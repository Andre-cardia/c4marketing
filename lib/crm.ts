export type CRMStageKey =
    | 'new_lead'
    | 'contacted'
    | 'meeting_scheduled'
    | 'proposal_sent'
    | 'proposal_won'
    | 'proposal_lost';

export interface CRMUser {
    id: string;
    full_name?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
}

export interface CRMStage {
    id: string;
    key: CRMStageKey;
    name: string;
    position: number;
    is_closed: boolean;
}

export interface CRMLead {
    id: string;
    name: string;
    company_name: string;
    whatsapp: string;
    whatsapp_normalized?: string | null;
    email?: string | null;
    email_normalized?: string | null;
    address?: string | null;
    notes?: string | null;
    owner_user_id?: string | null;
    stage_id: string;
    opened_at: string;
    closed_at?: string | null;
    next_follow_up_at?: string | null;
    last_interaction_at?: string | null;
    source?: string | null;
    lead_temperature?: string | null;
    estimated_value?: number | null;
    loss_reason?: string | null;
    proposal_id?: number | null;
    acceptance_id?: number | null;
    created_by?: string | null;
    updated_by?: string | null;
    created_at: string;
    updated_at: string;
    archived_at?: string | null;
}

export interface CRMActivity {
    id: string;
    lead_id: string;
    activity_type: 'note' | 'call' | 'email' | 'whatsapp_in' | 'whatsapp_out' | 'meeting' | 'system';
    summary: string;
    content?: string | null;
    metadata?: Record<string, unknown> | null;
    created_by?: string | null;
    created_at: string;
}

export interface CRMStageHistory {
    id: string;
    lead_id: string;
    from_stage_id?: string | null;
    to_stage_id: string;
    moved_by?: string | null;
    moved_at: string;
    note?: string | null;
}

export interface CRMFollowup {
    id: string;
    lead_id: string;
    owner_user_id?: string | null;
    title: string;
    due_at: string;
    completed_at?: string | null;
    status: 'pending' | 'completed' | 'cancelled';
    created_by?: string | null;
    created_at: string;
}

export interface CRMProposalOption {
    id: number;
    slug: string;
    company_name: string;
}

export interface CRMLeadFormState {
    name: string;
    company_name: string;
    whatsapp: string;
    email: string;
    address: string;
    notes: string;
    owner_user_id: string;
    stage_id: string;
    next_follow_up_at: string;
    source: string;
    lead_temperature: string;
    estimated_value: string;
    loss_reason: string;
    proposal_id: string;
}

export const CRM_STAGE_STYLES: Record<CRMStageKey, { borderColor: string; badgeClass: string }> = {
    new_lead: {
        borderColor: '#64748b',
        badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300',
    },
    contacted: {
        borderColor: '#0ea5e9',
        badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    },
    meeting_scheduled: {
        borderColor: '#8b5cf6',
        badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    },
    proposal_sent: {
        borderColor: '#f59e0b',
        badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
    proposal_won: {
        borderColor: '#10b981',
        badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    proposal_lost: {
        borderColor: '#ef4444',
        badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    },
};

export const createEmptyLeadForm = (defaultStageId = ''): CRMLeadFormState => ({
    name: '',
    company_name: '',
    whatsapp: '',
    email: '',
    address: '',
    notes: '',
    owner_user_id: '',
    stage_id: defaultStageId,
    next_follow_up_at: '',
    source: '',
    lead_temperature: '',
    estimated_value: '',
    loss_reason: '',
    proposal_id: '',
});

export const getCRMUserLabel = (user?: CRMUser | null) => {
    if (!user) return 'Sem responsável';
    return user.full_name?.trim() || user.name?.trim() || user.email?.trim() || 'Usuário sem nome';
};

export const normalizeCRMPhone = (value: string) => value.replace(/\D/g, '');

export const normalizeCRMEmail = (value: string) => value.trim().toLowerCase();

export const formatCRMDateTime = (value?: string | null) => {
    if (!value) return 'Sem data';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

export const formatCRMDate = (value?: string | null) => {
    if (!value) return 'Sem data';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
};

export const toDateTimeLocalInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const tzOffset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export const getTemperatureBadgeClass = (temperature?: string | null) => {
    switch (temperature) {
        case 'quente':
            return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        case 'morno':
            return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
        case 'frio':
            return 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
        default:
            return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';
    }
};

export const getActivityLabel = (activityType: CRMActivity['activity_type']) => {
    switch (activityType) {
        case 'call':
            return 'Ligação';
        case 'email':
            return 'Email';
        case 'meeting':
            return 'Reunião';
        case 'whatsapp_in':
            return 'WhatsApp recebido';
        case 'whatsapp_out':
            return 'WhatsApp enviado';
        case 'system':
            return 'Sistema';
        default:
            return 'Anotação';
    }
};
