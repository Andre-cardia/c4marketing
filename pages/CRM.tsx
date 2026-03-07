import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Building,
    Calendar,
    CheckCircle,
    Clock,
    FileText,
    Filter,
    Mail,
    MapPin,
    MessageSquare,
    Phone,
    Plus,
    RefreshCw,
    Search,
    User,
    X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from '../lib/UserRoleContext';
import {
    CRM_STAGE_STYLES,
    CRMActivity,
    CRMFollowup,
    CRMLead,
    CRMLeadFormState,
    CRMProposalOption,
    CRMStage,
    CRMStageHistory,
    CRMUser,
    createEmptyLeadForm,
    formatCRMDate,
    formatCRMDateTime,
    getActivityLabel,
    getCRMUserLabel,
    getTemperatureBadgeClass,
    normalizeCRMEmail,
    normalizeCRMPhone,
    toDateTimeLocalInput,
} from '../lib/crm';

const CRM: React.FC = () => {
    const { userRole, loading: roleLoading } = useUserRole();
    const isReadOnly = userRole === 'leitor';

    const [loading, setLoading] = useState(true);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [savingLead, setSavingLead] = useState(false);
    const [savingActivity, setSavingActivity] = useState(false);
    const [savingFollowup, setSavingFollowup] = useState(false);
    const [stages, setStages] = useState<CRMStage[]>([]);
    const [leads, setLeads] = useState<CRMLead[]>([]);
    const [users, setUsers] = useState<CRMUser[]>([]);
    const [proposals, setProposals] = useState<CRMProposalOption[]>([]);
    const [activities, setActivities] = useState<CRMActivity[]>([]);
    const [followups, setFollowups] = useState<CRMFollowup[]>([]);
    const [stageHistory, setStageHistory] = useState<CRMStageHistory[]>([]);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
    const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
    const [showLeadModal, setShowLeadModal] = useState(false);
    const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
    const [leadForm, setLeadForm] = useState<CRMLeadFormState>(createEmptyLeadForm());
    const [formError, setFormError] = useState<string | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        search: '',
        owner: '',
        stage: '',
        source: '',
        temperature: '',
        dateFrom: '',
        dateTo: '',
    });
    const [activityDraft, setActivityDraft] = useState({
        activity_type: 'note' as CRMActivity['activity_type'],
        summary: '',
        content: '',
    });
    const [followupDraft, setFollowupDraft] = useState({
        title: '',
        due_at: '',
        owner_user_id: '',
    });

    useEffect(() => {
        if (!roleLoading) {
            fetchInitialData();
        }
    }, [roleLoading]);

    useEffect(() => {
        if (!selectedLeadId) {
            setActivities([]);
            setFollowups([]);
            setStageHistory([]);
            return;
        }

        fetchLeadDetails(selectedLeadId);
    }, [selectedLeadId]);

    const stagesById = useMemo(() => {
        return new Map(stages.map((stage) => [stage.id, stage]));
    }, [stages]);

    const usersById = useMemo(() => {
        return new Map(users.map((user) => [user.id, user]));
    }, [users]);

    const proposalsById = useMemo(() => {
        return new Map(proposals.map((proposal) => [proposal.id, proposal]));
    }, [proposals]);

    const selectedLead = useMemo(
        () => leads.find((lead) => lead.id === selectedLeadId) || null,
        [leads, selectedLeadId]
    );

    const selectedProposal = useMemo(
        () => (selectedLead?.proposal_id ? proposalsById.get(selectedLead.proposal_id) || null : null),
        [proposalsById, selectedLead]
    );

    const filteredLeads = useMemo(() => {
        const lowerSearch = filters.search.trim().toLowerCase();
        const dateFromValue = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
        const dateToValue = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

        return leads.filter((lead) => {
            if (filters.owner && lead.owner_user_id !== filters.owner) return false;
            if (filters.stage && lead.stage_id !== filters.stage) return false;
            if (filters.source && (lead.source || '') !== filters.source) return false;
            if (filters.temperature && (lead.lead_temperature || '') !== filters.temperature) return false;

            if (dateFromValue || dateToValue) {
                const openedAt = new Date(lead.opened_at);
                if (dateFromValue && openedAt < dateFromValue) return false;
                if (dateToValue && openedAt > dateToValue) return false;
            }

            if (!lowerSearch) return true;

            const ownerLabel = getCRMUserLabel(usersById.get(lead.owner_user_id || ''));
            const haystack = [
                lead.name,
                lead.company_name,
                lead.whatsapp,
                lead.email || '',
                ownerLabel,
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(lowerSearch);
        });
    }, [filters, leads, usersById]);

    const summary = useMemo(() => {
        const openStages = new Set(
            stages.filter((stage) => !stage.is_closed).map((stage) => stage.id)
        );
        const wonStage = stages.find((stage) => stage.key === 'proposal_won')?.id;
        const lostStage = stages.find((stage) => stage.key === 'proposal_lost')?.id;

        return {
            total: filteredLeads.length,
            open: filteredLeads.filter((lead) => openStages.has(lead.stage_id)).length,
            won: filteredLeads.filter((lead) => lead.stage_id === wonStage).length,
            lost: filteredLeads.filter((lead) => lead.stage_id === lostStage).length,
        };
    }, [filteredLeads, stages]);

    const fetchInitialData = async () => {
        setLoading(true);
        setPageError(null);

        try {
            const [{ data: authData }, stagesResp, leadsResp, usersResp, proposalsResp] = await Promise.all([
                supabase.auth.getUser(),
                supabase.from('crm_pipeline_stages').select('*').order('position', { ascending: true }),
                supabase
                    .from('crm_leads')
                    .select('*')
                    .is('archived_at', null)
                    .order('opened_at', { ascending: false }),
                supabase
                    .from('app_users')
                    .select('id, full_name, name, email, role')
                    .in('role', ['admin', 'gestor', 'comercial', 'leitor'])
                    .order('email', { ascending: true }),
                supabase
                    .from('proposals')
                    .select('id, slug, company_name')
                    .order('created_at', { ascending: false })
                    .limit(200),
            ]);

            if (stagesResp.error) throw stagesResp.error;
            if (leadsResp.error) throw leadsResp.error;
            if (usersResp.error) throw usersResp.error;
            if (proposalsResp.error) throw proposalsResp.error;

            const nextStages = (stagesResp.data || []) as CRMStage[];
            const nextLeads = (leadsResp.data || []) as CRMLead[];
            const nextUsers = (usersResp.data || []) as CRMUser[];
            const nextProposals = (proposalsResp.data || []) as CRMProposalOption[];
            const currentUserEmail = (authData.user?.email || '').trim().toLowerCase();
            const currentAppUser = nextUsers.find(
                (user) => (user.email || '').trim().toLowerCase() === currentUserEmail
            );

            setStages(nextStages);
            setLeads(nextLeads);
            setUsers(nextUsers);
            setProposals(nextProposals);
            setCurrentUserId(currentAppUser?.id ?? null);

            setSelectedLeadId((current) => {
                if (current && nextLeads.some((lead) => lead.id === current)) return current;
                return nextLeads[0]?.id || null;
            });
        } catch (error: any) {
            console.error('Erro ao carregar CRM:', error);
            setPageError(error.message || 'Não foi possível carregar o CRM.');
        } finally {
            setLoading(false);
        }
    };

    const fetchLeadDetails = async (leadId: string) => {
        setLoadingDetails(true);

        try {
            const [activitiesResp, followupsResp, historyResp] = await Promise.all([
                supabase
                    .from('crm_lead_activities')
                    .select('*')
                    .eq('lead_id', leadId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('crm_followups')
                    .select('*')
                    .eq('lead_id', leadId)
                    .order('due_at', { ascending: true }),
                supabase
                    .from('crm_lead_stage_history')
                    .select('*')
                    .eq('lead_id', leadId)
                    .order('moved_at', { ascending: false }),
            ]);

            if (activitiesResp.error) throw activitiesResp.error;
            if (followupsResp.error) throw followupsResp.error;
            if (historyResp.error) throw historyResp.error;

            setActivities((activitiesResp.data || []) as CRMActivity[]);
            setFollowups((followupsResp.data || []) as CRMFollowup[]);
            setStageHistory((historyResp.data || []) as CRMStageHistory[]);
        } catch (error) {
            console.error('Erro ao carregar detalhe do lead:', error);
        } finally {
            setLoadingDetails(false);
        }
    };

    const openNewLeadModal = () => {
        const defaultStageId = stages[0]?.id || '';
        setEditingLeadId(null);
        setFormError(null);
        setLeadForm(createEmptyLeadForm(defaultStageId));
        setShowLeadModal(true);
    };

    const openEditLeadModal = (lead: CRMLead, forcedStageId?: string) => {
        setEditingLeadId(lead.id);
        setFormError(null);
        setLeadForm({
            name: lead.name,
            company_name: lead.company_name,
            whatsapp: lead.whatsapp,
            email: lead.email || '',
            address: lead.address || '',
            notes: lead.notes || '',
            owner_user_id: lead.owner_user_id || '',
            stage_id: forcedStageId || lead.stage_id,
            next_follow_up_at: toDateTimeLocalInput(lead.next_follow_up_at),
            source: lead.source || '',
            lead_temperature: lead.lead_temperature || '',
            estimated_value:
                typeof lead.estimated_value === 'number' ? String(lead.estimated_value) : '',
            loss_reason: lead.loss_reason || '',
            proposal_id: lead.proposal_id ? String(lead.proposal_id) : '',
        });
        setShowLeadModal(true);
    };

    const closeLeadModal = () => {
        setShowLeadModal(false);
        setEditingLeadId(null);
        setFormError(null);
        setLeadForm(createEmptyLeadForm(stages[0]?.id || ''));
    };

    const saveLead = async (event: React.FormEvent) => {
        event.preventDefault();

        if (isReadOnly) return;

        if (!leadForm.name.trim() || !leadForm.company_name.trim() || !leadForm.whatsapp.trim()) {
            setFormError('Nome, empresa e WhatsApp são obrigatórios.');
            return;
        }

        if (!leadForm.owner_user_id) {
            setFormError('Selecione um responsável pelo atendimento.');
            return;
        }

        if (!leadForm.stage_id) {
            setFormError('Selecione um estágio do pipeline.');
            return;
        }

        if (!currentUserId) {
            setFormError('Não foi possível identificar o usuário atual no cadastro interno do sistema.');
            return;
        }

        const targetStage = stagesById.get(leadForm.stage_id);
        if (targetStage?.key === 'proposal_lost' && !leadForm.loss_reason.trim()) {
            setFormError('Informe o motivo de perda antes de salvar o lead como perdido.');
            return;
        }

        const normalizedPhone = normalizeCRMPhone(leadForm.whatsapp);
        const normalizedEmail = normalizeCRMEmail(leadForm.email);
        const duplicateLeads = leads.filter((lead) => {
            if (lead.id === editingLeadId) return false;
            const samePhone = normalizedPhone && lead.whatsapp_normalized === normalizedPhone;
            const sameEmail = normalizedEmail && lead.email_normalized === normalizedEmail;
            return samePhone || sameEmail;
        });

        if (duplicateLeads.length > 0) {
            const shouldContinue = window.confirm(
                `Foram encontrados ${duplicateLeads.length} lead(s) com mesmo WhatsApp ou email. Deseja continuar mesmo assim?`
            );
            if (!shouldContinue) return;
        }

        setSavingLead(true);
        setFormError(null);

        const payload = {
            name: leadForm.name.trim(),
            company_name: leadForm.company_name.trim(),
            whatsapp: leadForm.whatsapp.trim(),
            whatsapp_normalized: normalizedPhone || null,
            email: leadForm.email.trim() || null,
            email_normalized: normalizedEmail || null,
            address: leadForm.address.trim() || null,
            notes: leadForm.notes.trim() || null,
            owner_user_id: leadForm.owner_user_id || null,
            stage_id: leadForm.stage_id,
            next_follow_up_at: leadForm.next_follow_up_at ? new Date(leadForm.next_follow_up_at).toISOString() : null,
            source: leadForm.source || null,
            lead_temperature: leadForm.lead_temperature || null,
            estimated_value: leadForm.estimated_value ? Number(leadForm.estimated_value) : null,
            loss_reason: leadForm.loss_reason.trim() || null,
            proposal_id: leadForm.proposal_id ? Number(leadForm.proposal_id) : null,
            updated_by: currentUserId,
        };

        try {
            if (editingLeadId) {
                const { error } = await supabase
                    .from('crm_leads')
                    .update(payload)
                    .eq('id', editingLeadId);

                if (error) throw error;
            } else {
                const { data, error } = await supabase
                    .from('crm_leads')
                    .insert({
                        ...payload,
                        created_by: currentUserId,
                    })
                    .select('id')
                    .single();

                if (error) throw error;
                setSelectedLeadId(data?.id || null);
            }

            await fetchInitialData();
            closeLeadModal();
        } catch (error: any) {
            console.error('Erro ao salvar lead:', error);
            setFormError(error.message || 'Não foi possível salvar o lead.');
        } finally {
            setSavingLead(false);
        }
    };

    const moveLeadToStage = async (lead: CRMLead, targetStageId: string) => {
        if (isReadOnly || lead.stage_id === targetStageId) return;

        const targetStage = stagesById.get(targetStageId);
        if (!targetStage) return;

        if (targetStage.key === 'proposal_lost' && !(lead.loss_reason || '').trim()) {
            alert('Informe o motivo de perda antes de mover para Proposta Perdida.');
            openEditLeadModal(lead, targetStageId);
            return;
        }

        try {
            const { error } = await supabase
                .from('crm_leads')
                .update({
                    stage_id: targetStageId,
                    updated_by: currentUserId,
                })
                .eq('id', lead.id);

            if (error) throw error;

            await fetchInitialData();
        } catch (error) {
            console.error('Erro ao mover lead:', error);
            alert('Não foi possível mover o card.');
        }
    };

    const createActivity = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!selectedLeadId || !activityDraft.summary.trim() || isReadOnly) return;
        if (!currentUserId) {
            alert('Não foi possível identificar o usuário atual no cadastro interno do sistema.');
            return;
        }

        setSavingActivity(true);

        try {
            const { error } = await supabase
                .from('crm_lead_activities')
                .insert({
                    lead_id: selectedLeadId,
                    activity_type: activityDraft.activity_type,
                    summary: activityDraft.summary.trim(),
                    content: activityDraft.content.trim() || null,
                    created_by: currentUserId,
                });

            if (error) throw error;

            setActivityDraft({
                activity_type: 'note',
                summary: '',
                content: '',
            });

            await Promise.all([fetchLeadDetails(selectedLeadId), fetchInitialData()]);
        } catch (error) {
            console.error('Erro ao criar atividade:', error);
            alert('Não foi possível registrar a atividade.');
        } finally {
            setSavingActivity(false);
        }
    };

    const createFollowup = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!selectedLeadId || !followupDraft.title.trim() || !followupDraft.due_at || isReadOnly) return;
        if (!currentUserId) {
            alert('Não foi possível identificar o usuário atual no cadastro interno do sistema.');
            return;
        }

        setSavingFollowup(true);

        try {
            const { error } = await supabase
                .from('crm_followups')
                .insert({
                    lead_id: selectedLeadId,
                    owner_user_id: followupDraft.owner_user_id || selectedLead?.owner_user_id || currentUserId,
                    title: followupDraft.title.trim(),
                    due_at: new Date(followupDraft.due_at).toISOString(),
                    created_by: currentUserId,
                });

            if (error) throw error;

            setFollowupDraft({
                title: '',
                due_at: '',
                owner_user_id: selectedLead?.owner_user_id || '',
            });

            await fetchLeadDetails(selectedLeadId);
        } catch (error) {
            console.error('Erro ao criar follow-up:', error);
            alert('Não foi possível criar o follow-up.');
        } finally {
            setSavingFollowup(false);
        }
    };

    const completeFollowup = async (followupId: string) => {
        if (isReadOnly) return;

        try {
            const { error } = await supabase
                .from('crm_followups')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                })
                .eq('id', followupId);

            if (error) throw error;
            if (selectedLeadId) await fetchLeadDetails(selectedLeadId);
        } catch (error) {
            console.error('Erro ao concluir follow-up:', error);
            alert('Não foi possível concluir o follow-up.');
        }
    };

    if (roleLoading || loading) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center text-neutral-400">
                Carregando CRM...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-400 font-bold">CRM</p>
                    <h1 className="text-[1.8rem] leading-none font-montserrat font-extrabold text-neutral-900 dark:text-white tracking-tight">
                        Pipeline comercial
                    </h1>
                    <p className="text-[13px] text-neutral-500 dark:text-neutral-400 max-w-2xl mt-2">
                        Quadro independente do kanban operacional para gestão de leads, histórico de contato e follow-ups.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={fetchInitialData}
                        className="px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[13px] font-bold text-neutral-600 dark:text-neutral-200 hover:border-brand-coral transition-colors flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        Atualizar
                    </button>
                    {!isReadOnly && (
                        <button
                            onClick={openNewLeadModal}
                            className="px-5 py-2.5 rounded-c4 bg-brand-coral text-white text-[13px] font-bold shadow-lg shadow-brand-coral/20 hover:bg-brand-coral/90 transition-colors flex items-center gap-2"
                        >
                            <Plus size={16} />
                            Novo Lead
                        </button>
                    )}
                </div>
            </section>

            {pageError && (
                <div className="rounded-c4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px]">
                    {pageError}
                </div>
            )}

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">Total</p>
                    <p className="text-[30px] leading-none font-extrabold text-neutral-900 dark:text-white mt-3">{summary.total}</p>
                    <p className="text-[13px] text-neutral-500 mt-2">Leads após aplicação dos filtros.</p>
                </div>
                <div className="bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">Em aberto</p>
                    <p className="text-[30px] leading-none font-extrabold text-neutral-900 dark:text-white mt-3">{summary.open}</p>
                    <p className="text-[13px] text-neutral-500 mt-2">Oportunidades ainda em negociação.</p>
                </div>
                <div className="bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">Ganhas</p>
                    <p className="text-[30px] leading-none font-extrabold text-emerald-600 mt-3">{summary.won}</p>
                    <p className="text-[13px] text-neutral-500 mt-2">Leads fechados como proposta aceita.</p>
                </div>
                <div className="bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">Perdidas</p>
                    <p className="text-[30px] leading-none font-extrabold text-rose-600 mt-3">{summary.lost}</p>
                    <p className="text-[13px] text-neutral-500 mt-2">Leads encerrados com perda registrada.</p>
                </div>
            </section>

            <section className="bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">
                    <Filter size={14} />
                    Filtros
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                            value={filters.search}
                            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                            placeholder="Buscar por nome, empresa ou contato"
                            className="w-full pl-10 pr-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                        />
                    </label>

                    <select
                        value={filters.owner}
                        onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}
                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                    >
                        <option value="">Todos os responsáveis</option>
                        {users.map((user) => (
                            <option key={user.id} value={user.id}>
                                {getCRMUserLabel(user)}
                            </option>
                        ))}
                    </select>

                    <select
                        value={filters.stage}
                        onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))}
                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                    >
                        <option value="">Todos os estágios</option>
                        {stages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                                {stage.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={filters.source}
                        onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))}
                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                    >
                        <option value="">Todas as origens</option>
                        <option value="indicacao">Indicação</option>
                        <option value="trafego_pago">Tráfego pago</option>
                        <option value="organico">Orgânico</option>
                        <option value="prospeccao">Prospecção</option>
                        <option value="site">Site</option>
                        <option value="evento">Evento</option>
                        <option value="outro">Outro</option>
                    </select>

                    <select
                        value={filters.temperature}
                        onChange={(event) => setFilters((current) => ({ ...current, temperature: event.target.value }))}
                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                    >
                        <option value="">Todas as temperaturas</option>
                        <option value="frio">Frio</option>
                        <option value="morno">Morno</option>
                        <option value="quente">Quente</option>
                    </select>

                    <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                    />

                    <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                    />

                    <button
                        onClick={() =>
                            setFilters({
                                search: '',
                                owner: '',
                                stage: '',
                                source: '',
                                temperature: '',
                                dateFrom: '',
                                dateTo: '',
                            })
                        }
                        className="px-4 py-2.5 rounded-c4 border border-dashed border-neutral-300 dark:border-neutral-700 text-[13px] font-bold text-neutral-500 hover:text-brand-coral hover:border-brand-coral transition-colors"
                    >
                        Limpar filtros
                    </button>
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">Pipeline</p>
                        <h2 className="text-base font-bold text-neutral-900 dark:text-white mt-1">
                            Arraste os cards entre os estágios
                        </h2>
                    </div>
                    <p className="text-[12px] text-neutral-400">
                        O board agora ocupa a largura principal. Role horizontalmente para visualizar todas as colunas.
                    </p>
                </div>

                <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm p-3">
                    <div className="overflow-x-auto pb-2 -mx-1 px-1">
                        <div className="flex gap-3 min-w-max">
                            {stages.map((stage) => {
                                const stageLeads = filteredLeads.filter((lead) => lead.stage_id === stage.id);
                                const stageStyle = CRM_STAGE_STYLES[stage.key];
                                const isActiveDrop = dragOverStageId === stage.id;

                                return (
                                    <div
                                        key={stage.id}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            setDragOverStageId(stage.id);
                                        }}
                                        onDragLeave={() => setDragOverStageId(null)}
                                        onDrop={async (event) => {
                                            event.preventDefault();
                                            setDragOverStageId(null);
                                            if (!draggedLeadId) return;
                                            const draggedLead = leads.find((lead) => lead.id === draggedLeadId);
                                            setDraggedLeadId(null);
                                            if (draggedLead) {
                                                await moveLeadToStage(draggedLead, stage.id);
                                            }
                                        }}
                                        className={`w-[258px] rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 shadow-sm flex flex-col max-h-[70vh] ${isActiveDrop ? 'ring-2 ring-brand-coral/50' : ''}`}
                                        style={{ borderTop: `4px solid ${stageStyle.borderColor}` }}
                                    >
                                        <div className="px-3.5 py-2.5 border-b border-neutral-100 dark:border-neutral-800 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white truncate">{stage.name}</h2>
                                                <p className="text-[11px] text-neutral-400 mt-1">
                                                    {stage.is_closed ? 'Estágio fechado' : 'Estágio em andamento'}
                                                </p>
                                            </div>
                                            <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${stageStyle.badgeClass}`}>
                                                {stageLeads.length}
                                            </span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
                                            {stageLeads.length === 0 ? (
                                                <div className="h-24 border border-dashed border-neutral-200 dark:border-neutral-700 rounded-c4 flex items-center justify-center text-[11px] text-neutral-400 text-center px-4">
                                                    Nenhum card neste estágio.
                                                </div>
                                            ) : (
                                                stageLeads.map((lead) => {
                                                    const owner = usersById.get(lead.owner_user_id || '');
                                                    const proposal = lead.proposal_id ? proposalsById.get(lead.proposal_id) : null;
                                                    const isSelected = lead.id === selectedLeadId;

                                                    return (
                                                        <div
                                                            key={lead.id}
                                                            draggable={!isReadOnly}
                                                            onDragStart={(event) => {
                                                                setDraggedLeadId(lead.id);
                                                                event.dataTransfer.effectAllowed = 'move';
                                                            }}
                                                            onDragEnd={() => {
                                                                setDraggedLeadId(null);
                                                                setDragOverStageId(null);
                                                            }}
                                                            onClick={() => setSelectedLeadId(lead.id)}
                                                            className={`rounded-c4 border p-3 transition-all cursor-pointer ${isSelected
                                                                ? 'border-brand-coral shadow-lg shadow-brand-coral/10 bg-brand-coral/5'
                                                                : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-brand-coral/40'
                                                                }`}
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="text-[13px] font-bold text-neutral-900 dark:text-white truncate">
                                                                        {lead.name}
                                                                    </p>
                                                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1 mt-1">
                                                                        <Building size={11} />
                                                                        {lead.company_name}
                                                                    </p>
                                                                </div>

                                                                {!isReadOnly && (
                                                                    <button
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            openEditLeadModal(lead);
                                                                        }}
                                                                        className="text-[10px] font-bold text-brand-coral hover:underline shrink-0"
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <div className="mt-3 space-y-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                                                                <div className="flex items-center gap-1.5">
                                                                    <Phone size={11} />
                                                                    <span className="truncate">{lead.whatsapp}</span>
                                                                </div>
                                                                {lead.email && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Mail size={11} />
                                                                        <span className="truncate">{lead.email}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-1.5">
                                                                    <User size={11} />
                                                                    <span className="truncate">{getCRMUserLabel(owner)}</span>
                                                                </div>
                                                            </div>

                                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                                <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-neutral-200/80 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200">
                                                                    {formatCRMDate(lead.opened_at)}
                                                                </span>
                                                                {lead.lead_temperature && (
                                                                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${getTemperatureBadgeClass(lead.lead_temperature)}`}>
                                                                        {lead.lead_temperature}
                                                                    </span>
                                                                )}
                                                                {lead.source && (
                                                                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                                                                        {lead.source}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {(lead.next_follow_up_at || proposal) && (
                                                                <div className="mt-3 space-y-1.5">
                                                                    {lead.next_follow_up_at && (
                                                                        <div className="text-[10px] text-neutral-500 flex items-center gap-1.5">
                                                                            <Clock size={11} />
                                                                            {formatCRMDateTime(lead.next_follow_up_at)}
                                                                        </div>
                                                                    )}
                                                                    {proposal && (
                                                                        <div className="text-[10px] text-brand-coral flex items-center gap-1.5">
                                                                            <FileText size={11} />
                                                                            Proposta vinculada
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">Detalhe do lead</p>
                        <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white mt-1">
                            {selectedLead ? selectedLead.name : 'Selecione um card no kanban'}
                        </h2>
                    </div>
                    {selectedLead && !isReadOnly && (
                        <button
                            onClick={() => openEditLeadModal(selectedLead)}
                            className="text-[13px] font-bold text-brand-coral hover:underline"
                        >
                            Editar
                        </button>
                    )}
                </div>

                {!selectedLead ? (
                    <div className="p-5 text-[13px] text-neutral-500">
                        Clique em um card do board para abrir os detalhes, follow-ups e histórico do lead.
                    </div>
                ) : (
                    <div className="grid xl:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="p-4 space-y-4 border-b xl:border-b-0 xl:border-r border-neutral-100 dark:border-neutral-800">
                            <div className="space-y-2.5">
                                <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                                    <Building size={14} />
                                    <span>{selectedLead.company_name}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                                    <Phone size={14} />
                                    <span>{selectedLead.whatsapp}</span>
                                </div>
                                {selectedLead.email && (
                                    <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                                        <Mail size={14} />
                                        <span>{selectedLead.email}</span>
                                    </div>
                                )}
                                {selectedLead.address && (
                                    <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                                        <MapPin size={14} />
                                        <span>{selectedLead.address}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-[13px] text-neutral-500">
                                    <User size={14} />
                                    <span>{getCRMUserLabel(usersById.get(selectedLead.owner_user_id || ''))}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold">Abertura</p>
                                    <p className="text-[13px] font-semibold text-neutral-900 dark:text-white mt-2">
                                        {formatCRMDateTime(selectedLead.opened_at)}
                                    </p>
                                </div>
                                <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold">Fechamento</p>
                                    <p className="text-[13px] font-semibold text-neutral-900 dark:text-white mt-2">
                                        {formatCRMDateTime(selectedLead.closed_at)}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <MessageSquare size={14} className="text-brand-coral" />
                                    <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Observações</h3>
                                </div>
                                <p className="text-[13px] text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
                                    {selectedLead.notes || 'Nenhuma observação registrada.'}
                                </p>
                                {selectedLead.loss_reason && (
                                    <div className="rounded-c4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 p-3 text-[13px] text-rose-700 dark:text-rose-200">
                                        Motivo de perda: {selectedLead.loss_reason}
                                    </div>
                                )}
                            </div>

                            {selectedProposal && (
                                <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-4">
                                    <div className="flex items-center gap-2">
                                        <FileText size={14} className="text-brand-coral" />
                                        <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Proposta vinculada</h3>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                                                {selectedProposal.company_name}
                                            </p>
                                            <p className="text-[11px] text-neutral-400 mt-1">
                                                ID {selectedLead.proposal_id}
                                            </p>
                                        </div>
                                        <a
                                            href={`/p/${selectedProposal.slug}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[13px] font-bold text-brand-coral hover:underline"
                                        >
                                            Abrir
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 lg:p-5 space-y-4">
                            <div className="grid gap-4 2xl:grid-cols-2">
                                <section className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Timeline</h3>
                                        {loadingDetails && <span className="text-[11px] text-neutral-400">Atualizando...</span>}
                                    </div>

                                    {!isReadOnly && (
                                        <form onSubmit={createActivity} className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3 space-y-2.5">
                                            <select
                                                value={activityDraft.activity_type}
                                                onChange={(event) => setActivityDraft((current) => ({
                                                    ...current,
                                                    activity_type: event.target.value as CRMActivity['activity_type'],
                                                }))}
                                                className="w-full px-3.5 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                            >
                                                <option value="note">Anotação</option>
                                                <option value="call">Ligação</option>
                                                <option value="email">Email</option>
                                                <option value="meeting">Reunião</option>
                                                <option value="whatsapp_out">WhatsApp enviado</option>
                                                <option value="whatsapp_in">WhatsApp recebido</option>
                                            </select>
                                            <input
                                                value={activityDraft.summary}
                                                onChange={(event) => setActivityDraft((current) => ({ ...current, summary: event.target.value }))}
                                                placeholder="Resumo da interação"
                                                className="w-full px-3.5 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                            />
                                            <textarea
                                                value={activityDraft.content}
                                                onChange={(event) => setActivityDraft((current) => ({ ...current, content: event.target.value }))}
                                                placeholder="Detalhes adicionais"
                                                rows={3}
                                                className="w-full px-3.5 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors resize-none"
                                            />
                                            <button
                                                type="submit"
                                                disabled={savingActivity}
                                                className="px-3.5 py-2 rounded-c4 bg-brand-coral text-white text-[13px] font-bold hover:bg-brand-coral/90 transition-colors disabled:opacity-60"
                                            >
                                                {savingActivity ? 'Salvando...' : 'Registrar atividade'}
                                            </button>
                                        </form>
                                    )}

                                    <div className="space-y-2.5">
                                        {activities.length === 0 ? (
                                            <div className="rounded-c4 border border-dashed border-neutral-200 dark:border-neutral-700 p-4 text-[13px] text-neutral-400">
                                                Nenhuma atividade registrada.
                                            </div>
                                        ) : (
                                            activities.map((activity) => (
                                                <div key={activity.id} className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3.5">
                                                    <p className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                                                        {activity.summary}
                                                    </p>
                                                    <p className="text-[11px] text-neutral-400 mt-1">
                                                        {getActivityLabel(activity.activity_type)} • {formatCRMDateTime(activity.created_at)}
                                                    </p>
                                                    {activity.content && (
                                                        <p className="text-[13px] text-neutral-600 dark:text-neutral-300 mt-2.5 whitespace-pre-wrap">
                                                            {activity.content}
                                                        </p>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>

                                <section className="space-y-3">
                                    <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Follow-ups</h3>

                                    {!isReadOnly && (
                                        <form onSubmit={createFollowup} className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3 space-y-2.5">
                                            <input
                                                value={followupDraft.title}
                                                onChange={(event) => setFollowupDraft((current) => ({ ...current, title: event.target.value }))}
                                                placeholder="Próxima ação comercial"
                                                className="w-full px-3.5 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                            />
                                            <input
                                                type="datetime-local"
                                                value={followupDraft.due_at}
                                                onChange={(event) => setFollowupDraft((current) => ({ ...current, due_at: event.target.value }))}
                                                className="w-full px-3.5 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                            />
                                            <select
                                                value={followupDraft.owner_user_id}
                                                onChange={(event) => setFollowupDraft((current) => ({ ...current, owner_user_id: event.target.value }))}
                                                className="w-full px-3.5 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-800 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                            >
                                                <option value="">Responsável padrão do lead</option>
                                                {users.map((user) => (
                                                    <option key={user.id} value={user.id}>
                                                        {getCRMUserLabel(user)}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="submit"
                                                disabled={savingFollowup}
                                                className="px-3.5 py-2 rounded-c4 bg-brand-coral text-white text-[13px] font-bold hover:bg-brand-coral/90 transition-colors disabled:opacity-60"
                                            >
                                                {savingFollowup ? 'Salvando...' : 'Criar follow-up'}
                                            </button>
                                        </form>
                                    )}

                                    <div className="space-y-2.5">
                                        {followups.length === 0 ? (
                                            <div className="rounded-c4 border border-dashed border-neutral-200 dark:border-neutral-700 p-4 text-[13px] text-neutral-400">
                                                Nenhum follow-up criado.
                                            </div>
                                        ) : (
                                            followups.map((followup) => {
                                                const isOverdue =
                                                    followup.status === 'pending' && new Date(followup.due_at) < new Date();
                                                return (
                                                    <div key={followup.id} className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3.5 flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                                                                {followup.title}
                                                            </p>
                                                            <p className="text-[11px] text-neutral-400 mt-1">
                                                                {formatCRMDateTime(followup.due_at)} • {getCRMUserLabel(usersById.get(followup.owner_user_id || ''))}
                                                            </p>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${followup.status === 'completed'
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                                    : isOverdue
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                                                    }`}>
                                                                    {followup.status === 'completed' ? 'Concluído' : isOverdue ? 'Vencido' : 'Pendente'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {!isReadOnly && followup.status !== 'completed' && (
                                                            <button
                                                                onClick={() => completeFollowup(followup.id)}
                                                                className="text-[12px] font-bold text-brand-coral hover:underline shrink-0"
                                                            >
                                                                Concluir
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </section>
                            </div>

                            <section className="space-y-3">
                                <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Histórico de estágio</h3>
                                {stageHistory.length === 0 ? (
                                    <div className="rounded-c4 border border-dashed border-neutral-200 dark:border-neutral-700 p-4 text-[13px] text-neutral-400">
                                        Ainda não há movimentações registradas.
                                    </div>
                                ) : (
                                    <div className="grid gap-2.5 lg:grid-cols-2">
                                        {stageHistory.map((historyItem) => (
                                            <div key={historyItem.id} className="rounded-c4 border border-neutral-200 dark:border-neutral-800 p-3.5">
                                                <p className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                                                    {(stagesById.get(historyItem.from_stage_id || '')?.name || 'Origem inicial')}
                                                    {' -> '}
                                                    {stagesById.get(historyItem.to_stage_id)?.name || 'Estágio atual'}
                                                </p>
                                                <p className="text-[11px] text-neutral-400 mt-1">
                                                    {formatCRMDateTime(historyItem.moved_at)}
                                                </p>
                                                {historyItem.note && (
                                                    <p className="text-[13px] text-neutral-600 dark:text-neutral-300 mt-2.5">
                                                        {historyItem.note}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                )}
            </section>

            {showLeadModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center">
                    <div className="w-full max-w-[880px] max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 shadow-2xl">
                        <div className="px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold">
                                    {editingLeadId ? 'Editar lead' : 'Novo lead'}
                                </p>
                                <h2 className="text-[17px] font-bold text-neutral-900 dark:text-white mt-1">
                                    {editingLeadId ? 'Atualizar oportunidade' : 'Cadastrar oportunidade'}
                                </h2>
                            </div>
                            <button
                                onClick={closeLeadModal}
                                className="p-2 rounded-c4 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={saveLead} className="p-4 space-y-3.5">
                            {formError && (
                                <div className="rounded-c4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px] flex items-start gap-2">
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                    <span>{formError}</span>
                                </div>
                            )}

                            <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Nome</label>
                                    <input
                                        value={leadForm.name}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, name: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Empresa</label>
                                    <input
                                        value={leadForm.company_name}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, company_name: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">WhatsApp</label>
                                    <input
                                        value={leadForm.whatsapp}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, whatsapp: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Email</label>
                                    <input
                                        value={leadForm.email}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Endereço</label>
                                    <input
                                        value={leadForm.address}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, address: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Responsável</label>
                                    <select
                                        value={leadForm.owner_user_id}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, owner_user_id: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    >
                                        <option value="">Selecione</option>
                                        {users.map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {getCRMUserLabel(user)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Estágio</label>
                                    <select
                                        value={leadForm.stage_id}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, stage_id: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    >
                                        {stages.map((stage) => (
                                            <option key={stage.id} value={stage.id}>
                                                {stage.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Próximo follow-up</label>
                                    <input
                                        type="datetime-local"
                                        value={leadForm.next_follow_up_at}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, next_follow_up_at: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Valor estimado</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={leadForm.estimated_value}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, estimated_value: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Origem</label>
                                    <select
                                        value={leadForm.source}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, source: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    >
                                        <option value="">Selecione</option>
                                        <option value="indicacao">Indicação</option>
                                        <option value="trafego_pago">Tráfego pago</option>
                                        <option value="organico">Orgânico</option>
                                        <option value="prospeccao">Prospecção</option>
                                        <option value="site">Site</option>
                                        <option value="evento">Evento</option>
                                        <option value="outro">Outro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Temperatura</label>
                                    <select
                                        value={leadForm.lead_temperature}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, lead_temperature: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    >
                                        <option value="">Selecione</option>
                                        <option value="frio">Frio</option>
                                        <option value="morno">Morno</option>
                                        <option value="quente">Quente</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Proposta vinculada</label>
                                    <select
                                        value={leadForm.proposal_id}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, proposal_id: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    >
                                        <option value="">Nenhuma proposta</option>
                                        {proposals.map((proposal) => (
                                            <option key={proposal.id} value={proposal.id}>
                                                #{proposal.id} • {proposal.company_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Observações</label>
                                    <textarea
                                        rows={4}
                                        value={leadForm.notes}
                                        onChange={(event) => setLeadForm((current) => ({ ...current, notes: event.target.value }))}
                                        className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors resize-none"
                                    />
                                </div>
                                {(leadForm.loss_reason || stagesById.get(leadForm.stage_id)?.key === 'proposal_lost') && (
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Motivo de perda</label>
                                        <textarea
                                            rows={3}
                                            value={leadForm.loss_reason}
                                            onChange={(event) => setLeadForm((current) => ({ ...current, loss_reason: event.target.value }))}
                                            className="w-full px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors resize-none"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeLeadModal}
                                    className="px-4 py-2.5 rounded-c4 border border-neutral-200 dark:border-neutral-700 text-[13px] font-bold text-neutral-600 dark:text-neutral-200 hover:border-neutral-400 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingLead}
                                    className="px-5 py-2.5 rounded-c4 bg-brand-coral text-white text-[13px] font-bold shadow-lg shadow-brand-coral/20 hover:bg-brand-coral/90 transition-colors disabled:opacity-60"
                                >
                                    {savingLead ? 'Salvando...' : editingLeadId ? 'Salvar alterações' : 'Criar lead'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CRM;
