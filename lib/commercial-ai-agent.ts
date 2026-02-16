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
    const { data: allAcceptances } = await supabase
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
        // A contract is "active" if it was accepted on or before monthEnd and its status is one of the active statuses
        const activeContracts = acceptances.filter(a => {
            const acceptDate = new Date(a.timestamp);
            if (acceptDate > monthEnd) return false;

            // Consider active statuses
            const status = a.status || 'Ativo';
            return ['Ativo', 'Onboarding'].includes(status);
        });

        let mrr = 0;
        let setupRevenue = 0;

        activeContracts.forEach((acc: any) => {
            const monthlyFee = getMonthlyFee(acc);
            mrr += monthlyFee;
        });

        // Setup revenue: sum of setup_fee for contracts started this month
        monthAcceptances.forEach((acc: any) => {
            setupRevenue += getSetupFee(acc);
        });

        // Churn: contracts that left "Ativo" status during this month
        // (approximation: contracts with non-active status whose last known date is in this month)
        const churnedContracts = acceptances.filter(a => {
            const acceptDate = new Date(a.timestamp);
            if (acceptDate > monthEnd) return false;
            const status = a.status || 'Ativo';
            return ['Cancelado', 'Suspenso', 'Finalizado'].includes(status);
        }).length;

        // Only count churned that happened up to this month, relative to total contracts
        const totalContractsUpToMonth = acceptances.filter(a => new Date(a.timestamp) <= monthEnd).length;
        const churnThisMonth = m === 0 ? churnedContracts : Math.max(0, churnedContracts - acceptances.filter(a => {
            const acceptDate = new Date(a.timestamp);
            if (acceptDate > new Date(year, m, 0, 23, 59, 59)) return false;
            const status = a.status || 'Ativo';
            return ['Cancelado', 'Suspenso', 'Finalizado'].includes(status);
        }).length);

        const conversionRate = monthProposals.length > 0
            ? (monthAcceptances.length / monthProposals.length) * 100
            : 0;

        result.push({
            month: monthKey,
            monthLabel: monthLabels[m],
            mrr,
            arr: mrr * 12,
            newContracts: monthAcceptances.length,
            churnedContracts: churnThisMonth,
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
    if (acc.proposal?.monthly_fee) return acc.proposal.monthly_fee;
    if (acc.contract_snapshot?.proposal?.monthly_fee) return acc.contract_snapshot.proposal.monthly_fee;
    return 0;
}

function getSetupFee(acc: any): number {
    if (acc.proposal?.setup_fee) return acc.proposal.setup_fee;
    if (acc.contract_snapshot?.proposal?.setup_fee) return acc.contract_snapshot.proposal.setup_fee;
    return 0;
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
