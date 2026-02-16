import { supabase } from './supabase';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const BASE_URL = import.meta.env.DEV ? '/api/openai' : 'https://api.openai.com';

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
    totalRevenue: number;  // mrr + setupRevenue
    activeClients: number;
}

export interface CommercialContext {
    year: number;
    months: MonthlyMetrics[];
    comparisonMonths?: MonthlyMetrics[];
    comparisonYear?: number;
    currentMRR: number;
    currentARR: number;
    currentActiveClients: number;
    averageChurnRate: number;
    averageConversionRate: number;
    mrrGrowth: number; // % change from previous month
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
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
    const { data: allAcceptances, error: accError } = await supabase
        .from('acceptances')
        .select(`
            id, timestamp, company_name, status,
            contract_snapshot,
            proposal_id,
            proposal:proposals (
                monthly_fee,
                setup_fee,
                services,
                contract_duration
            )
        `)
        .order('timestamp', { ascending: true });

    if (accError) console.error('Erro ao buscar acceptances:', accError);

    const proposals = allProposals || [];
    const acceptances = allAcceptances || [];

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
        currentARR: currentMRR * 12,
        currentActiveClients: currentMonth?.activeClients || 0,
        averageChurnRate: Math.round(avgChurn * 10) / 10,
        averageConversionRate: Math.round(avgConversion * 10) / 10,
        mrrGrowth: Math.round(mrrGrowth * 10) / 10,
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

    for (let m = 0; m < 12; m++) {
        const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
        const monthStart = new Date(year, m, 1);
        const monthEnd = new Date(year, m + 1, 0, 23, 59, 59);

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

        // Calculate MRR: sum of monthly_fee for ALL contracts active up to this month
        const activeContracts = acceptances.filter(a => {
            const acceptDate = new Date(a.timestamp);
            if (acceptDate > monthEnd) return false;
            return isActiveContract(a);
        });

        let mrr = 0;
        let setupRevenue = 0;

        activeContracts.forEach((acc: any) => {
            mrr += getMonthlyFee(acc);
        });

        // Setup revenue: sum of setup_fee for contracts started this month
        monthAcceptances.forEach((acc: any) => {
            setupRevenue += getSetupFee(acc);
        });

        // Churn count: contracts churned up to this month
        const totalChurnedUpToMonth = acceptances.filter(a => {
            const acceptDate = new Date(a.timestamp);
            if (acceptDate > monthEnd) return false;
            return isChurnedContract(a);
        }).length;

        // Churn from previous month (for delta calculation)
        const totalChurnedUpToPrevMonth = m > 0 ? acceptances.filter(a => {
            const acceptDate = new Date(a.timestamp);
            const prevMonthEnd = new Date(year, m, 0, 23, 59, 59);
            if (acceptDate > prevMonthEnd) return false;
            return isChurnedContract(a);
        }).length : 0;

        const churnThisMonth = totalChurnedUpToMonth - totalChurnedUpToPrevMonth;

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
        });
    }

    return result;
}

function getMonthlyFee(acc: any): number {
    // Try linked proposal first
    if (acc.proposal && acc.proposal.monthly_fee != null) {
        return Number(acc.proposal.monthly_fee) || 0;
    }
    // Fallback to contract_snapshot.proposal.monthly_fee
    if (acc.contract_snapshot?.proposal?.monthly_fee != null) {
        return Number(acc.contract_snapshot.proposal.monthly_fee) || 0;
    }
    // Manually created projects store value as "value" instead of "monthly_fee"
    if (acc.contract_snapshot?.proposal?.value != null) {
        return Number(acc.contract_snapshot.proposal.value) || 0;
    }
    // Also check top-level contract_snapshot fields (some snapshots store differently)
    if (acc.contract_snapshot?.monthly_fee != null) {
        return Number(acc.contract_snapshot.monthly_fee) || 0;
    }
    return 0;
}

function getSetupFee(acc: any): number {
    // Try linked proposal first
    if (acc.proposal && acc.proposal.setup_fee != null) {
        return Number(acc.proposal.setup_fee) || 0;
    }
    // Fallback to contract_snapshot
    if (acc.contract_snapshot?.proposal?.setup_fee != null) {
        return Number(acc.contract_snapshot.proposal.setup_fee) || 0;
    }
    // Also check top-level
    if (acc.contract_snapshot?.setup_fee != null) {
        return Number(acc.contract_snapshot.setup_fee) || 0;
    }
    return 0;
}

/**
 * Checks if an acceptance is considered active.
 * Contracts without explicit status or with active-like statuses are considered active.
 */
function isActiveContract(acc: any): boolean {
    const status = (acc.status || '').trim();
    // If no status set, it's active by default
    if (!status) return true;
    // Explicit active statuses
    const activeStatuses = ['Ativo', 'Onboarding', 'Em andamento', 'ativo', 'onboarding'];
    return activeStatuses.some(s => s.toLowerCase() === status.toLowerCase());
}

function isChurnedContract(acc: any): boolean {
    const status = (acc.status || '').trim();
    if (!status) return false;
    const churnStatuses = ['Cancelado', 'Suspenso', 'Finalizado', 'cancelado', 'suspenso', 'finalizado'];
    return churnStatuses.some(s => s.toLowerCase() === status.toLowerCase());
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────

/**
 * Sends messages to the AI Commercial Director and returns a response.
 */
export async function chatWithDirector(
    messages: ChatMessage[],
    context: CommercialContext
): Promise<string> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API Key não encontrada. Verifique seu arquivo .env.');
    }

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const contextSummary = `
DADOS COMERCIAIS DO ANO ${context.year}:
- MRR Atual: ${formatCurrency(context.currentMRR)}
- ARR Atual: ${formatCurrency(context.currentARR)}
- Clientes Ativos: ${context.currentActiveClients}
- Crescimento MRR (mês anterior): ${context.mrrGrowth}%
- Taxa Média de Conversão: ${context.averageConversionRate}%
- Taxa Média de Churn: ${context.averageChurnRate}%

EVOLUÇÃO MENSAL:
${context.months.map(m => `${m.monthLabel}: MRR ${formatCurrency(m.mrr)} | Novos: ${m.newContracts} | Churn: ${m.churnedContracts} | Propostas: ${m.totalProposals} | Conversão: ${m.conversionRate}% | Ativos: ${m.activeClients}`).join('\n')}

${context.comparisonMonths ? `\nCOMPARAÇÃO COM ${context.comparisonYear}:\n${context.comparisonMonths.map(m => `${m.monthLabel}: MRR ${formatCurrency(m.mrr)} | Novos: ${m.newContracts} | Churn: ${m.churnedContracts} | Conversão: ${m.conversionRate}%`).join('\n')}` : ''}
`;

    const systemPrompt = `Você é o Diretor Comercial de IA da C4 Marketing.
Seu papel é analisar métricas comerciais, identificar tendências, fazer análises preditivas e recomendar ações estratégicas.

Capacidades:
- Análise de MRR, ARR, churn e conversão
- Identificação de tendências de crescimento ou declínio
- Análise preditiva baseada em padrões históricos
- Recomendações de estratégia comercial
- Comparações entre períodos

Regras:
- Responda SEMPRE em português do Brasil
- Seja direto e objetivo, com insights acionáveis
- Use dados numéricos para embasar suas análises
- Quando fizer previsões, explique o raciocínio
- Use emojis profissionais de forma moderada
- Formate números monetários em BRL (R$)
- Não invente dados que não existam no contexto

${contextSummary}`;

    const fullMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages
    ];

    try {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: fullMessages,
                temperature: 0.4,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Erro ao comunicar com a IA.');
        }

        return data.choices[0].message.content.trim();
    } catch (error: any) {
        console.error('Erro no chatbot comercial:', error);
        if (error.message === 'Failed to fetch') {
            throw new Error('Erro de conexão. Verifique sua internet e a chave API.');
        }
        throw error;
    }
}
