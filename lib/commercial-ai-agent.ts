import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonthlyMetrics {
    month: string;       // "YYYY-MM"
    monthLabel: string;  // "Jan", "Fev", etc.
    mrr: number;
    arr: number;
    newContracts: number;
    churnedContracts: number;
    totalProposals: number;
    acceptedProposals: number;
    conversionRate: number;
    setupRevenue: number;
    totalRevenue: number;  // realized total for past months, projected total for future months
    activeClients: number;
    isForecast: boolean;   // true if this month is a projection
    forecastMRR: number;   // projected MRR (equals mrr for past months, projected for future)
}

export interface CommercialContext {
    year: number;
    months: MonthlyMetrics[];
    comparisonMonths?: MonthlyMetrics[];
    comparisonYear?: number;
    currentMRR: number;
    accumulatedRevenue: number; // Sum of MRR + Setup of past months
    actualARR: number;          // currentMRR * 12
    predictedARR: number;       // projected total revenue for the year
    currentActiveClients: number;
    averageChurnRate: number;
    averageConversionRate: number;
    mrrGrowth: number; // % change from previous month
    pendingFinancialReviews: number;
    blockedNonRecurringContracts: number;
    blockedNonRecurringRevenue: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

const ACTIVE_CONTRACT_STATUSES = new Set(['ativo', 'onboarding', 'em andamento']);
const FINANCIAL_END_STATUSES = new Set(['cancelado', 'suspenso', 'finalizado', 'inativo']);

function getFinancialReviewSnapshot(acc: any) {
    const reviewSnapshot = acc?.contract_snapshot?.financial_review;
    return reviewSnapshot && typeof reviewSnapshot === 'object' && !Array.isArray(reviewSnapshot)
        ? reviewSnapshot
        : null;
}

function mergeAcceptanceProposalData(acceptances: any[], proposals: any[]): any[] {
    const proposalLookup = new Map(
        (proposals || []).map((proposal: any) => [Number(proposal.id), proposal])
    );

    return (acceptances || []).map((acceptance: any) => ({
        ...acceptance,
        proposal: acceptance.proposal || proposalLookup.get(Number(acceptance.proposal_id)) || null,
        acceptance_financial_installments: Array.isArray(acceptance.acceptance_financial_installments)
            ? acceptance.acceptance_financial_installments
            : [],
    }));
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

/**
 * Fetches all proposals and acceptances for a given year to compute commercial metrics.
 */
export async function fetchCommercialContext(
    year: number,
    comparisonYear?: number
): Promise<CommercialContext> {
    // Fetch ALL proposals (to compute conversion rate per month)
    const { data: allProposals } = await supabase
        .from('proposals')
        .select('id, created_at, monthly_fee, setup_fee, services, contract_duration')
        .order('created_at', { ascending: true });

    // Fetch ALL acceptances with their proposal data
    const enrichedAcceptancesSelect = `
            id, timestamp, billing_start_date, expiration_date, company_name, status,
            financial_review_status, financial_review_mode,
            contract_snapshot,
            proposal_id,
            proposal:proposals!acceptances_proposal_id_fkey (
                id,
                monthly_fee,
                setup_fee,
                services,
                contract_duration
            ),
            acceptance_financial_installments (
                id,
                label,
                amount,
                expected_date
            )
        `;

    const { data: allAcceptances, error: accError } = await supabase
        .from('acceptances')
        .select(enrichedAcceptancesSelect)
        .order('timestamp', { ascending: true });

    if (accError) console.error('Erro ao buscar acceptances:', accError);

    const proposals = allProposals || [];
    let acceptances = mergeAcceptanceProposalData(allAcceptances || [], proposals);

    if (accError) {
        const { data: legacyAcceptances, error: legacyAccError } = await supabase
            .from('acceptances')
            .select('id, timestamp, billing_start_date, expiration_date, company_name, status, contract_snapshot, proposal_id')
            .order('timestamp', { ascending: true });

        if (legacyAccError) {
            console.error('Erro ao buscar acceptances no fallback legado:', legacyAccError);
            acceptances = [];
        } else {
            acceptances = mergeAcceptanceProposalData(legacyAcceptances || [], proposals);
        }
    }

    const blockedNonRecurringAcceptances = acceptances.filter((acc) =>
        isPendingFinancialReview(acc) && getNonRecurringTotal(acc) > 0
    );

    const months = computeMonthlyMetrics(year, proposals, acceptances);

    let comparisonMonths: MonthlyMetrics[] | undefined;
    if (comparisonYear) {
        comparisonMonths = computeMonthlyMetrics(comparisonYear, proposals, acceptances);
    }

    // Current values (latest month with data or current month)
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = months.find(m => m.month === currentMonthKey) || months[months.length - 1];
    const previousMonth = months.length >= 2 ? months[months.length - 2] : null;

    const currentMRR = currentMonth?.mrr || 0;
    const mrrGrowth = previousMonth && previousMonth.mrr > 0
        ? ((currentMRR - previousMonth.mrr) / previousMonth.mrr) * 100
        : 0;

    // Predicted total revenue: realized past months + projected future months.
    const predictedARR = months.reduce((sum, m) => sum + m.totalRevenue, 0);
    // Accumulated Revenue (YTD): sum of real revenue (MRR + Setup) for past months only
    const accRevenue = months.filter(m => !m.isForecast).reduce((sum, m) => sum + m.totalRevenue, 0);
    // Actual ARR (annualized run rate): current MRR * 12
    const actualARR = currentMRR * 12;

    const avgChurn = months.length > 0
        ? months.reduce((sum, m) => sum + (m.activeClients > 0 ? (m.churnedContracts / m.activeClients) * 100 : 0), 0) / months.length
        : 0;

    const avgConversion = months.length > 0
        ? months.reduce((sum, m) => sum + m.conversionRate, 0) / months.length
        : 0;

    return {
        year,
        months,
        comparisonMonths,
        comparisonYear,
        currentMRR,
        accumulatedRevenue: accRevenue,
        actualARR,
        predictedARR,
        currentActiveClients: currentMonth?.activeClients || 0,
        averageChurnRate: Math.round(avgChurn * 10) / 10,
        averageConversionRate: Math.round(avgConversion * 10) / 10,
        mrrGrowth: Math.round(mrrGrowth * 10) / 10,
        pendingFinancialReviews: acceptances.filter((acc) => isPendingFinancialReview(acc)).length,
        blockedNonRecurringContracts: blockedNonRecurringAcceptances.length,
        blockedNonRecurringRevenue: blockedNonRecurringAcceptances.reduce((sum, acc) => sum + getNonRecurringTotal(acc), 0),
    };
}

/**
 * Computes monthly metrics for a given year.
 */
function computeMonthlyMetrics(
    year: number,
    proposals: any[],
    acceptances: any[]
): MonthlyMetrics[] {
    const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const result: MonthlyMetrics[] = [];

    const now = new Date();

    for (let m = 0; m < 12; m++) {
        const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
        const monthStart = new Date(year, m, 1);
        const monthEnd = new Date(year, m + 1, 0, 23, 59, 59);
        const activeContractsAtMonthEnd = acceptances.filter(a => isFinanciallyActiveAtDate(a, monthEnd));
        const monthMRR = activeContractsAtMonthEnd.reduce((sum, acc) => sum + getMonthlyFee(acc), 0);
        const monthSetupRevenue = acceptances.reduce((sum, acc) => (
            sum + getScheduledSetupRevenueForMonth(acc, monthStart, monthEnd)
        ), 0);

        // Future months: project current active MRR
        if (monthStart > now) {
            result.push({
                month: monthKey,
                monthLabel: monthLabels[m],
                mrr: 0, arr: 0, newContracts: 0, churnedContracts: 0,
                totalProposals: 0, acceptedProposals: 0, conversionRate: 0,
                setupRevenue: monthSetupRevenue,
                totalRevenue: monthMRR + monthSetupRevenue,
                activeClients: 0,
                isForecast: true,
                forecastMRR: monthMRR,
            });
            continue;
        }

        // Proposals created in this month
        const monthProposals = proposals.filter(p => {
            const d = new Date(p.created_at);
            return d >= monthStart && d <= monthEnd;
        });

        // Acceptances (new contracts) in this month
        const monthAcceptances = acceptances.filter(a => {
            const d = new Date(a.timestamp);
            return d >= monthStart && d <= monthEnd;
        });

        // MRR: contratos ativos na data de referência do mês (considera billing_start_date quando existir)
        const activeContracts = activeContractsAtMonthEnd;

        let mrr = monthMRR;
        const setupRevenue = monthSetupRevenue;

        const churnThisMonth = acceptances.filter(a => {
            const churnDate = getFinancialEndDate(a);
            return Boolean(churnDate && churnDate >= monthStart && churnDate <= monthEnd && isChurnedContract(a));
        }).length;

        const conversionRate = monthProposals.length > 0
            ? (monthAcceptances.length / monthProposals.length) * 100
            : 0;

        result.push({
            month: monthKey,
            monthLabel: monthLabels[m],
            mrr,
            arr: mrr * 12,
            newContracts: monthAcceptances.length,
            churnedContracts: Math.max(0, churnThisMonth),
            totalProposals: monthProposals.length,
            acceptedProposals: monthAcceptances.length,
            conversionRate: Math.round(conversionRate * 10) / 10,
            setupRevenue,
            totalRevenue: mrr + setupRevenue,
            activeClients: activeContracts.length,
            isForecast: false,
            forecastMRR: monthMRR,
        });
    }

    return result;
}

function getMonthlyFee(acc: any): number {
    const reviewSnapshot = getFinancialReviewSnapshot(acc);
    if (reviewSnapshot?.monthly_fee != null) {
        return Number(reviewSnapshot.monthly_fee) || 0;
    }
    // Try linked proposal first
    if (acc.contract_snapshot?.proposal?.monthly_fee != null) {
        return Number(acc.contract_snapshot.proposal.monthly_fee) || 0;
    }
    if (acc.contract_snapshot?.proposal?.value != null) {
        return Number(acc.contract_snapshot.proposal.value) || 0;
    }
    if (acc.contract_snapshot?.monthly_fee != null) {
        return Number(acc.contract_snapshot.monthly_fee) || 0;
    }
    if (acc.proposal && acc.proposal.monthly_fee != null) {
        return Number(acc.proposal.monthly_fee) || 0;
    }
    return 0;
}

function getSetupFee(acc: any): number {
    const reviewSnapshot = getFinancialReviewSnapshot(acc);
    if (reviewSnapshot?.non_recurring_total != null) {
        return Number(reviewSnapshot.non_recurring_total) || 0;
    }
    if (acc.contract_snapshot?.proposal?.setup_fee != null) {
        return Number(acc.contract_snapshot.proposal.setup_fee) || 0;
    }
    if (acc.contract_snapshot?.setup_fee != null) {
        return Number(acc.contract_snapshot.setup_fee) || 0;
    }
    if (acc.proposal && acc.proposal.setup_fee != null) {
        return Number(acc.proposal.setup_fee) || 0;
    }
    return 0;
}

function getNonRecurringTotal(acc: any): number {
    return getSetupFee(acc);
}

function hasFinancialReviewData(acc: any): boolean {
    return Object.prototype.hasOwnProperty.call(acc || {}, 'financial_review_status')
        || Object.prototype.hasOwnProperty.call(acc || {}, 'financial_review_mode')
        || Object.prototype.hasOwnProperty.call(acc || {}, 'financial_reviewed_at')
        || Array.isArray(acc?.acceptance_financial_installments);
}

function isPendingFinancialReview(acc: any): boolean {
    if (!hasFinancialReviewData(acc)) return false;
    return String(acc?.financial_review_status || 'pending').trim().toLowerCase() !== 'completed';
}

function getLegacySetupRevenueForMonth(acc: any, monthStart: Date, monthEnd: Date): number {
    const acceptedAt = parseDateLike(acc?.timestamp);
    if (!acceptedAt || acceptedAt < monthStart || acceptedAt > monthEnd) return 0;
    return getSetupFee(acc);
}

function getScheduledSetupRevenueForMonth(acc: any, monthStart: Date, monthEnd: Date): number {
    if (String(acc?.financial_review_mode || '').trim().toLowerCase() === 'no_non_recurring') {
        return 0;
    }

    if (getSetupFee(acc) <= 0.01) {
        return 0;
    }

    if (!hasFinancialReviewData(acc)) {
        return getLegacySetupRevenueForMonth(acc, monthStart, monthEnd);
    }

    if (isPendingFinancialReview(acc)) return 0;

    const installments = Array.isArray(acc?.acceptance_financial_installments)
        ? acc.acceptance_financial_installments
        : [];

    if (installments.length === 0) {
        return getLegacySetupRevenueForMonth(acc, monthStart, monthEnd);
    }

    return installments.reduce((sum: number, installment: any) => {
        const expectedDate = parseDateLike(installment?.expected_date, true);
        if (!expectedDate) return sum;
        if (expectedDate < monthStart || expectedDate > monthEnd) return sum;
        return sum + (Number(installment?.amount) || 0);
    }, 0);
}

function normalizeContractStatus(acc: any): string {
    return String(acc?.status || '').trim().toLowerCase();
}

/**
 * Checks if an acceptance is considered active.
 * Contracts without explicit status or with active-like statuses are considered active.
 */
function isActiveContract(acc: any): boolean {
    const status = normalizeContractStatus(acc);
    if (!status) return true;
    return ACTIVE_CONTRACT_STATUSES.has(status);
}

function isChurnedContract(acc: any): boolean {
    const status = normalizeContractStatus(acc);
    return FINANCIAL_END_STATUSES.has(status);
}

function parseDateLike(value: string | null | undefined, endOfDay = false): Date | null {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return new Date(`${raw}T${endOfDay ? '23:59:59' : '00:00:00'}`);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getFinancialStartDate(acc: any): Date | null {
    const billingStart = parseDateLike(acc?.billing_start_date);
    if (billingStart) return billingStart;
    const snapshotBillingStart = parseDateLike(acc?.contract_snapshot?.billing_start_date);
    if (snapshotBillingStart) return snapshotBillingStart;
    const snapshotProposalBillingStart = parseDateLike(acc?.contract_snapshot?.proposal?.billing_start_date);
    if (snapshotProposalBillingStart) return snapshotProposalBillingStart;
    return parseDateLike(acc?.timestamp);
}

function getFinancialEndDate(acc: any): Date | null {
    return parseDateLike(acc?.expiration_date, true);
}

function isFinanciallyActiveAtDate(acc: any, referenceDate: Date): boolean {
    const financialStart = getFinancialStartDate(acc);
    if (financialStart && financialStart > referenceDate) {
        return false;
    }

    const expirationDate = getFinancialEndDate(acc);
    if (expirationDate && expirationDate < referenceDate) {
        return false;
    }

    if (isActiveContract(acc)) return true;
    if (isChurnedContract(acc)) return Boolean(expirationDate);
    return false;
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────

/**
 * Sends messages to the AI Commercial Director and returns a response.
 */
export async function chatWithDirector(
    messages: ChatMessage[],
    context: CommercialContext
): Promise<string> {
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const contextSummary = `
DADOS COMERCIAIS DO ANO ${context.year}:
- MRR Atual: ${formatCurrency(context.currentMRR)}
- ARR Atual (Run Rate): ${formatCurrency(context.actualARR)}
- Receita Acumulada no Ano (YTD): ${formatCurrency(context.accumulatedRevenue)}
- Previsão de Receita Total no Ano: ${formatCurrency(context.predictedARR)}
- Clientes Ativos: ${context.currentActiveClients}
- Crescimento MRR (mês anterior): ${context.mrrGrowth}%
- Taxa Média de Conversão: ${context.averageConversionRate}%
- Taxa Média de Churn: ${context.averageChurnRate}%

EVOLUÇÃO MENSAL:
${context.months.map(m => `${m.monthLabel}: MRR ${formatCurrency(m.mrr)} | Novos: ${m.newContracts} | Churn: ${m.churnedContracts} | Propostas: ${m.totalProposals} | Conversão: ${m.conversionRate}% | Ativos: ${m.activeClients}`).join('\n')}

${context.comparisonMonths ? `\nCOMPARAÇÃO COM ${context.comparisonYear}:\n${context.comparisonMonths.map(m => `${m.monthLabel}: MRR ${formatCurrency(m.mrr)} | Novos: ${m.newContracts} | Churn: ${m.churnedContracts} | Conversão: ${m.conversionRate}%`).join('\n')}` : ''}
`;

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
            action: 'chat_director',
            messages,
            contextSummary,
        },
    });

    if (error) throw new Error(error.message || 'Erro ao comunicar com a IA.');

    return data.reply;
}
