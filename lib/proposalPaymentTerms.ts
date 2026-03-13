export const DEFAULT_ONE_TIME_PAYMENT_TERMS = '50% na entrada e 50% na entrega do serviço.';

const ONE_TIME_PROPOSAL_SERVICE_IDS = [
    'landing_page',
    'website',
    'ecommerce',
    'consulting',
] as const;

const PROPOSAL_SERVICE_LABELS: Record<string, string> = {
    traffic_management: 'Gestão de Tráfego',
    hosting: 'Hospedagem',
    landing_page: 'Landing Page',
    website: 'Web Site Institucional',
    ecommerce: 'E-commerce',
    consulting: 'Consultoria de Mkt',
    ai_agents: 'Agentes de IA',
};

export const isOneTimeProposalService = (serviceId: string) =>
    ONE_TIME_PROPOSAL_SERVICE_IDS.includes(
        serviceId as (typeof ONE_TIME_PROPOSAL_SERVICE_IDS)[number]
    );

export const normalizeOneTimePaymentTerms = (paymentTerms?: string | null) => {
    const normalized = paymentTerms?.trim();
    return normalized && normalized.length > 0
        ? normalized
        : DEFAULT_ONE_TIME_PAYMENT_TERMS;
};

export const hasServicePaymentTerms = (paymentTerms?: string | null) =>
    typeof paymentTerms === 'string' && paymentTerms.trim().length > 0;

export const getProposalServiceLabel = (serviceId: string) =>
    PROPOSAL_SERVICE_LABELS[serviceId] || serviceId;
