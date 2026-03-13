export type ContractBodyVersion = 1 | 2;

export const LEGACY_CONTRACT_BODY_VERSION: ContractBodyVersion = 1;
export const CURRENT_CONTRACT_BODY_VERSION: ContractBodyVersion = 2;

export const C4_CONTRACT_COMPANY_NAME = 'C4 Marketing (HAC ASSESSORIA E CONSULTORIA LTDA)';
export const C4_CONTRACT_COMPANY_CITY = 'Florianópolis/SC';
export const C4_CONTRACT_COMPANY_CNPJ = '24.043.876/0001-83';
export const LEGACY_CONTRACT_SIGNATURE_CNPJ = '48.005.917/0001-57';

export const WEBSITE_MAX_LAYOUT_REVISIONS = 3;
export const WEBSITE_DELIVERY_TIMELINE_PLACEHOLDER = '30 dias úteis ou 2 meses';
export const CONTRACT_TIME_ZONE = 'America/Sao_Paulo';
export const CONTRACT_TIME_ZONE_LABEL = 'horário de Brasília';

const RECURRING_CONTRACT_SERVICE_IDS = ['traffic_management', 'hosting', 'ai_agents'] as const;
const CONTRACT_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: CONTRACT_TIME_ZONE,
});
const CONTRACT_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: CONTRACT_TIME_ZONE,
});

export const normalizeContractBodyVersion = (value: unknown): ContractBodyVersion =>
    value === CURRENT_CONTRACT_BODY_VERSION
        ? CURRENT_CONTRACT_BODY_VERSION
        : LEGACY_CONTRACT_BODY_VERSION;

export const isRecurringContractService = (serviceId: string) =>
    RECURRING_CONTRACT_SERVICE_IDS.includes(
        serviceId as (typeof RECURRING_CONTRACT_SERVICE_IDS)[number]
    );

export const normalizeWebsiteDeliveryTimeline = (value?: string | null) => {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
};

export const getWebsiteDeliveryTimelineClause = (value?: string | null) => {
    const normalized = normalizeWebsiteDeliveryTimeline(value);
    if (normalized) {
        return `O prazo estimado para desenvolvimento e entrega do website será de ${normalized} após o envio completo dos materiais pela CONTRATANTE.`;
    }

    return 'O prazo estimado para desenvolvimento e entrega do website será aquele definido na proposta comercial e/ou no detalhamento adicional do serviço, após o envio completo dos materiais pela CONTRATANTE.';
};

const isDateOnlyIsoString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const formatDateOnlyPtBr = (value: string) => {
    const [year, month, day] = value.trim().split('-');
    return `${day}/${month}/${year}`;
};

export const formatOfficialAcceptanceTimestamp = (value?: string | null) => {
    if (!value) return '';

    if (typeof value === 'string' && isDateOnlyIsoString(value)) {
        return formatDateOnlyPtBr(value);
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return value;
    }

    return `${CONTRACT_DATE_FORMATTER.format(parsedDate)} às ${CONTRACT_TIME_FORMATTER.format(parsedDate)} (${CONTRACT_TIME_ZONE_LABEL})`;
};
