import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Users, Building, Calendar, Link as LinkIcon, ExternalLink, Trash2, Plus, FileText, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import { getCompanyDisplayName } from '../lib/utils';
import FinancialReviewModal, {
    FinancialReviewAcceptanceSummary,
    FinancialReviewInstallment,
    FinancialReviewInstallmentInput,
    FinancialReviewMode,
} from '../components/proposals/FinancialReviewModal';

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    created_at: string;
    contract_duration: number;
    services?: { id: string; price: number }[];
}

interface Acceptance {
    id: number;
    proposal_id?: number | null;
    name: string;
    email?: string | null;
    company_name: string;
    company_alias?: string | null;
    company_display_name?: string;
    cnpj?: string | null;
    timestamp: string;
    status?: string | null;
    expiration_date?: string | null;
    billing_start_date?: string | null;
    financial_review_status?: string | null;
    financial_review_mode?: string | null;
    financial_reviewed_at?: string | null;
    contract_snapshot?: any;
    proposal?: {
        monthly_fee?: number | null;
        setup_fee?: number | null;
    } | null;
    acceptance_financial_installments?: FinancialReviewInstallment[];
}

type SortKeyProposal = 'created_at' | 'company_name' | 'responsible_name';
type SortKeyAcceptance = 'timestamp' | 'name' | 'company_name' | 'status' | 'expiration_date';
type SortDirection = 'asc' | 'desc';

interface SortConfigProposal {
    key: SortKeyProposal;
    direction: SortDirection;
}

interface SortConfigAcceptance {
    key: SortKeyAcceptance;
    direction: SortDirection;
}

const FINANCIAL_END_ACCEPTANCE_STATUSES = new Set(['Inativo', 'Suspenso', 'Cancelado', 'Finalizado']);

const toLocalDateInputValue = (date: Date = new Date()) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const getFinancialReviewSnapshot = (acceptance: Acceptance) => {
    const reviewSnapshot = acceptance.contract_snapshot?.financial_review;
    return reviewSnapshot && typeof reviewSnapshot === 'object' && !Array.isArray(reviewSnapshot)
        ? reviewSnapshot
        : null;
};

const getAcceptanceMonthlyFee = (acceptance: Acceptance) => {
    const reviewSnapshot = getFinancialReviewSnapshot(acceptance);
    if (reviewSnapshot?.monthly_fee != null) return Number(reviewSnapshot.monthly_fee) || 0;
    if (acceptance.contract_snapshot?.proposal?.monthly_fee != null) return Number(acceptance.contract_snapshot.proposal.monthly_fee) || 0;
    if (acceptance.contract_snapshot?.proposal?.value != null) return Number(acceptance.contract_snapshot.proposal.value) || 0;
    if (acceptance.contract_snapshot?.monthly_fee != null) return Number(acceptance.contract_snapshot.monthly_fee) || 0;
    if (acceptance.proposal?.monthly_fee != null) return Number(acceptance.proposal.monthly_fee) || 0;
    return 0;
};

const getAcceptanceNonRecurringTotal = (acceptance: Acceptance) => {
    const reviewSnapshot = getFinancialReviewSnapshot(acceptance);
    if (reviewSnapshot?.non_recurring_total != null) return Number(reviewSnapshot.non_recurring_total) || 0;
    if (acceptance.contract_snapshot?.proposal?.setup_fee != null) return Number(acceptance.contract_snapshot.proposal.setup_fee) || 0;
    if (acceptance.contract_snapshot?.setup_fee != null) return Number(acceptance.contract_snapshot.setup_fee) || 0;
    if (acceptance.proposal?.setup_fee != null) return Number(acceptance.proposal.setup_fee) || 0;
    return 0;
};

const hasFinancialReviewData = (acceptance: Partial<Acceptance> | Record<string, any>) => (
    Object.prototype.hasOwnProperty.call(acceptance, 'financial_review_status')
    || Object.prototype.hasOwnProperty.call(acceptance, 'financial_review_mode')
    || Object.prototype.hasOwnProperty.call(acceptance, 'financial_reviewed_at')
    || Array.isArray((acceptance as Acceptance).acceptance_financial_installments)
);

const isFinancialReviewPending = (acceptance: Acceptance) =>
    hasFinancialReviewData(acceptance)
        ? String(acceptance.financial_review_status || 'pending').trim().toLowerCase() !== 'completed'
        : false;

const normalizeAcceptances = (
    rows: any[],
    proposalLookup: Map<number, { monthly_fee?: number | null; setup_fee?: number | null }>
) => rows.map((item: any) => ({
    ...item,
    proposal: item.proposal || proposalLookup.get(Number(item.proposal_id)) || null,
    company_display_name: getCompanyDisplayName(item.company_name, item.company_alias),
    acceptance_financial_installments: Array.isArray(item.acceptance_financial_installments)
        ? [...item.acceptance_financial_installments].sort((left: FinancialReviewInstallment, right: FinancialReviewInstallment) => (
            String(left.expected_date || '').localeCompare(String(right.expected_date || ''))
        ))
        : [],
}));

const isMissingFinancialReviewStructureError = (error: any) => {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('acceptance_financial_installments')
        || message.includes('financial_review_')
        || message.includes('save_acceptance_financial_review')
        || message.includes('candidate function')
        || message.includes('schema cache')
        || message.includes('column')
        || message.includes('relation');
};

const mapAcceptanceToReviewSummary = (acceptance: Acceptance): FinancialReviewAcceptanceSummary => ({
    id: acceptance.id,
    companyDisplayName: getCompanyDisplayName(acceptance.company_name, acceptance.company_alias),
    acceptedAt: acceptance.timestamp,
    billingStartDate: acceptance.billing_start_date || '',
    monthlyFee: getAcceptanceMonthlyFee(acceptance),
    nonRecurringTotal: getAcceptanceNonRecurringTotal(acceptance),
    financialReviewMode: acceptance.financial_review_mode,
    installments: Array.isArray(acceptance.acceptance_financial_installments)
        ? acceptance.acceptance_financial_installments
        : [],
});

const Proposals: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();
    const canManageFinancialReview = userRole === 'gestor' || userRole === 'admin';

    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
    const [financialReviewAcceptance, setFinancialReviewAcceptance] = useState<Acceptance | null>(null);
    const [isFinancialReviewOpen, setIsFinancialReviewOpen] = useState(false);
    const [isSavingFinancialReview, setIsSavingFinancialReview] = useState(false);
    const [hasAutoOpenedFinancialReview, setHasAutoOpenedFinancialReview] = useState(false);

    // Filter & Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortProposals, setSortProposals] = useState<SortConfigProposal>({ key: 'created_at', direction: 'desc' });
    const [sortAcceptances, setSortAcceptances] = useState<SortConfigAcceptance>({ key: 'timestamp', direction: 'desc' });

    // Access control - redirect if not gestor or comercial
    useEffect(() => {
        if (!roleLoading && userRole !== 'gestor' && userRole !== 'comercial' && userRole !== 'admin') {
            navigate('/dashboard');
        }
    }, [userRole, roleLoading, navigate]);

    useEffect(() => {
        if (userRole === 'gestor' || userRole === 'comercial' || userRole === 'admin') {
            fetchData();
        }
    }, [userRole]);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchProposals(), fetchAcceptances()]);
        setLoading(false);
    };

    const fetchProposals = async () => {
        const { data } = await supabase.from('proposals').select('*').order('created_at', { ascending: false });
        if (data) setProposals(data);
    };

    const fetchAcceptances = async () => {
        const enrichedSelect = `
                *,
                proposal:proposals!acceptances_proposal_id_fkey (
                    id,
                    monthly_fee,
                    setup_fee
                ),
                acceptance_financial_installments (
                    id,
                    label,
                    amount,
                    expected_date
                )
            `;

        let acceptanceRows: any[] = [];

        const { data, error } = await supabase
            .from('acceptances')
            .select(enrichedSelect)
            .order('timestamp', { ascending: false });

        if (error) {
            console.warn('Falling back to legacy acceptances query:', error.message);
            const { data: legacyData, error: legacyError } = await supabase
                .from('acceptances')
                .select('*')
                .order('timestamp', { ascending: false });

            if (legacyError) {
                console.error('Error fetching acceptances:', legacyError);
                setAcceptances([]);
                return;
            }

            acceptanceRows = legacyData || [];
        } else {
            acceptanceRows = data || [];
        }

        const proposalIds = [...new Set(
            acceptanceRows
                .map((item: any) => Number(item.proposal_id))
                .filter((id) => Number.isFinite(id) && id > 0)
        )];

        const proposalLookup = new Map<number, { monthly_fee?: number | null; setup_fee?: number | null }>();
        if (proposalIds.length > 0) {
            const { data: proposalRows, error: proposalError } = await supabase
                .from('proposals')
                .select('id, monthly_fee, setup_fee')
                .in('id', proposalIds);

            if (proposalError) {
                console.error('Error fetching acceptance proposal lookup:', proposalError);
            } else {
                (proposalRows || []).forEach((proposal: any) => {
                    proposalLookup.set(Number(proposal.id), {
                        monthly_fee: proposal.monthly_fee,
                        setup_fee: proposal.setup_fee,
                    });
                });
            }
        }

        setAcceptances(normalizeAcceptances(acceptanceRows, proposalLookup));
    };

    const handleDeleteProposal = async (id: number) => {
        if (!window.confirm('Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const { error, count } = await supabase
                .from('proposals')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (error) throw error;

            if (count === 0) {
                alert('Não foi possível excluir a proposta. Verifique suas permissões ou se o registro ainda existe.');
                return;
            }

            setProposals(prev => prev.filter(prop => prop.id !== id));
            alert('Proposta excluída com sucesso.');
        } catch (error) {
            console.error('Error deleting proposal:', error);
            alert('Erro ao excluir proposta.');
        }
    };

    const handleDeleteAcceptance = async (id: number) => {
        if (!window.confirm('Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const { error, count } = await supabase
                .from('acceptances')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (error) throw error;

            if (count === 0) {
                alert('Não foi possível excluir o aceite. Verifique suas permissões.');
                return;
            }

            setAcceptances(prev => prev.filter(acc => acc.id !== id));
            alert('Registro excluído com sucesso.');
        } catch (error) {
            console.error('Error deleting acceptance:', error);
            alert('Erro ao excluir. Verifique se você tem permissão de administrador.');
        }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        const currentAcceptance = acceptances.find((acc) => acc.id === id);
        const today = toLocalDateInputValue();
        const shouldSetFinancialEndDate = FINANCIAL_END_ACCEPTANCE_STATUSES.has(newStatus)
            && (!currentAcceptance?.expiration_date || currentAcceptance.expiration_date > today);
        const nextExpirationDate = shouldSetFinancialEndDate
            ? today
            : (currentAcceptance?.expiration_date || '');

        setAcceptances(prev => prev.map(acc =>
            acc.id === id
                ? { ...acc, status: newStatus, expiration_date: nextExpirationDate || acc.expiration_date }
                : acc
        ));

        try {
            const { error } = await supabase
                .from('acceptances')
                .update({
                    status: newStatus,
                    ...(shouldSetFinancialEndDate ? { expiration_date: today } : {}),
                })
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Erro ao atualizar status.');
            fetchAcceptances();
        }
    };

    const calculateExpirationDate = (timestamp: string, snapshot: any) => {
        if (!timestamp || !snapshot?.proposal?.contract_duration) return '';
        try {
            const date = new Date(timestamp);
            const duration = Number(snapshot.proposal.contract_duration);

            if (isNaN(date.getTime()) || isNaN(duration)) return '';

            date.setMonth(date.getMonth() + duration);
            return date.toISOString().split('T')[0];
        } catch (e) {
            console.error('Error calculating expiration date', e);
            return '';
        }
    };

    const handleExpirationChange = async (id: number, date: string) => {
        setAcceptances(prev => prev.map(acc =>
            acc.id === id ? { ...acc, expiration_date: date } : acc
        ));

        try {
            const { error } = await supabase
                .from('acceptances')
                .update({ expiration_date: date })
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating expiration date:', error);
            alert('Erro ao atualizar data de validade.');
            fetchAcceptances();
        }
    };

    const handleEmailChange = async (id: number, email: string) => {
        setAcceptances(prev => prev.map(acc =>
            acc.id === id ? { ...acc, email: email } : acc
        ));

        try {
            const { error } = await supabase
                .from('acceptances')
                .update({ email: email })
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating email:', error);
            alert('Erro ao atualizar email.');
            fetchAcceptances();
        }
    };

    const handleCnpjChange = async (id: number, cnpj: string) => {
        setAcceptances(prev => prev.map(acc =>
            acc.id === id ? { ...acc, cnpj: cnpj } : acc
        ));

        try {
            const { error } = await supabase
                .from('acceptances')
                .update({ cnpj: cnpj })
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating CNPJ:', error);
            alert('Erro ao atualizar CNPJ.');
            fetchAcceptances();
        }
    };

    const openFinancialReview = (acceptance: Acceptance) => {
        setFinancialReviewAcceptance(acceptance);
        setIsFinancialReviewOpen(true);
    };

    const closeFinancialReview = () => {
        setIsFinancialReviewOpen(false);
        setFinancialReviewAcceptance(null);
    };

    const saveFinancialReviewWithoutRpc = async (
        acceptanceId: number,
        mode: FinancialReviewMode,
        installments: Array<{ label: string; amount: number; expected_date: string }>,
        billingStartDate: string,
        monthlyFee: number,
        nonRecurringTotal: number
    ) => {
        const reviewedAt = new Date().toISOString();
        const persistedNonRecurringTotal = mode === 'no_non_recurring' ? 0 : nonRecurringTotal;
        const currentSnapshot = (
            financialReviewAcceptance?.contract_snapshot
            && typeof financialReviewAcceptance.contract_snapshot === 'object'
            && !Array.isArray(financialReviewAcceptance.contract_snapshot)
        )
            ? { ...financialReviewAcceptance.contract_snapshot }
            : {};
        const currentProposalSnapshot = (
            currentSnapshot.proposal
            && typeof currentSnapshot.proposal === 'object'
            && !Array.isArray(currentSnapshot.proposal)
        )
            ? { ...currentSnapshot.proposal }
            : {};

        currentSnapshot.proposal = {
            ...currentProposalSnapshot,
            monthly_fee: monthlyFee,
            setup_fee: persistedNonRecurringTotal,
        };
        currentSnapshot.monthly_fee = monthlyFee;
        currentSnapshot.setup_fee = persistedNonRecurringTotal;
        currentSnapshot.financial_review = {
            ...(currentSnapshot.financial_review && typeof currentSnapshot.financial_review === 'object'
                ? currentSnapshot.financial_review
                : {}),
            monthly_fee: monthlyFee,
            non_recurring_total: persistedNonRecurringTotal,
            billing_start_date: billingStartDate || null,
            mode,
            reviewed_at: reviewedAt,
        };

        const { error: deleteError } = await supabase
            .from('acceptance_financial_installments')
            .delete()
            .eq('acceptance_id', acceptanceId);

        if (deleteError && !(mode === 'no_non_recurring' && isMissingFinancialReviewStructureError(deleteError))) {
            throw deleteError;
        }

        if (mode !== 'no_non_recurring' && installments.length > 0) {
            const { error: insertError } = await supabase
                .from('acceptance_financial_installments')
                .insert(
                    installments.map((installment) => ({
                        acceptance_id: acceptanceId,
                        label: installment.label || null,
                        amount: installment.amount,
                        expected_date: installment.expected_date,
                    }))
                );

            if (insertError) throw insertError;
        }

        const { error: updateError } = await supabase
            .from('acceptances')
            .update({
                billing_start_date: billingStartDate || null,
                contract_snapshot: currentSnapshot,
                financial_review_status: 'completed',
                financial_review_mode: mode,
                financial_reviewed_at: reviewedAt,
            })
            .eq('id', acceptanceId);

        if (updateError) throw updateError;
    };

    const handleSaveFinancialReview = async (
        mode: FinancialReviewMode,
        installments: FinancialReviewInstallmentInput[],
        billingStartDate: string,
        monthlyFee: number,
        nonRecurringTotal: number
    ) => {
        if (!financialReviewAcceptance) return;

        setIsSavingFinancialReview(true);
        try {
            const normalizedInstallments = installments.map((installment) => ({
                label: installment.label.trim(),
                amount: Number(installment.amount) || 0,
                expected_date: installment.expected_date,
            }));

            try {
                await saveFinancialReviewWithoutRpc(
                    financialReviewAcceptance.id,
                    mode,
                    normalizedInstallments,
                    billingStartDate,
                    monthlyFee,
                    nonRecurringTotal
                );
            } catch (fallbackError: any) {
                if (isMissingFinancialReviewStructureError(fallbackError)) {
                    throw new Error('A estrutura de revisao financeira ainda nao foi publicada no banco. Aplique a migration financeira mais recente e tente novamente.');
                }
                throw fallbackError;
            }

            closeFinancialReview();
            await fetchAcceptances();
        } catch (error: any) {
            console.error('Error saving financial review:', error);
            alert(error?.message || 'Erro ao salvar revisao financeira.');
        } finally {
            setIsSavingFinancialReview(false);
        }
    };

    useEffect(() => {
        if (!canManageFinancialReview || hasAutoOpenedFinancialReview || isFinancialReviewOpen || acceptances.length === 0) {
            return;
        }

        const latestPendingAcceptance = acceptances.find((acceptance) => isFinancialReviewPending(acceptance));
        if (!latestPendingAcceptance) return;

        setFinancialReviewAcceptance(latestPendingAcceptance);
        setIsFinancialReviewOpen(true);
        setHasAutoOpenedFinancialReview(true);
    }, [acceptances, canManageFinancialReview, hasAutoOpenedFinancialReview, isFinancialReviewOpen]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Ativo': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            case 'Suspenso': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
            case 'Cancelado': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            case 'Finalizado': return 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800/50 dark:text-neutral-400 dark:border-neutral-700';
            default: return 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700';
        }
    };

    const getFinancialReviewPresentation = (acceptance: Acceptance) => {
        const nonRecurringTotal = getAcceptanceNonRecurringTotal(acceptance);
        const installments = Array.isArray(acceptance.acceptance_financial_installments)
            ? acceptance.acceptance_financial_installments
            : [];

        if (isFinancialReviewPending(acceptance)) {
            return {
                label: 'Revisao pendente',
                detail: nonRecurringTotal > 0
                    ? `${formatCurrency(nonRecurringTotal)} bloqueados fora do MRR`
                    : `Recorrencia inicia em ${acceptance.billing_start_date ? new Date(`${acceptance.billing_start_date}T00:00:00`).toLocaleDateString('pt-BR') : 'data pendente'}`,
                tone: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
            };
        }

        if (acceptance.financial_review_mode === 'installments') {
            return {
                label: 'Parcelado',
                detail: `${installments.length} parcela${installments.length === 1 ? '' : 's'} • ${formatCurrency(nonRecurringTotal)}`,
                tone: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
            };
        }

        if (acceptance.financial_review_mode === 'single_payment') {
            return {
                label: 'Pagamento unico',
                detail: `1 parcela • ${formatCurrency(nonRecurringTotal)}`,
                tone: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
            };
        }

        return {
            label: 'Sem nao recorrente',
            detail: acceptance.billing_start_date
                ? `MRR inicia em ${new Date(`${acceptance.billing_start_date}T00:00:00`).toLocaleDateString('pt-BR')}`
                : 'Nada a lancar fora do MRR',
            tone: 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800/50 dark:text-neutral-300 dark:border-neutral-700',
        };
    };

    const copyLink = (slug: string) => {
        const url = `${window.location.origin}/p/${slug}`;
        navigator.clipboard.writeText(url);
        alert('Link copiado para a área de transferência!');
    };

    const handleSortProposals = (key: SortKeyProposal) => {
        setSortProposals(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleSortAcceptances = (key: SortKeyAcceptance) => {
        setSortAcceptances(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filteredProposals = useMemo(() => {
        let sorted = [...proposals];

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            sorted = sorted.filter(p =>
                p.company_name.toLowerCase().includes(lowerTerm) ||
                p.responsible_name.toLowerCase().includes(lowerTerm)
            );
        }

        sorted.sort((a, b) => {
            if (sortProposals.key === 'company_name') {
                return sortProposals.direction === 'asc'
                    ? a.company_name.localeCompare(b.company_name)
                    : b.company_name.localeCompare(a.company_name);
            } else if (sortProposals.key === 'responsible_name') {
                return sortProposals.direction === 'asc'
                    ? a.responsible_name.localeCompare(b.responsible_name)
                    : b.responsible_name.localeCompare(a.responsible_name);
            } else {
                return sortProposals.direction === 'asc'
                    ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });

        return sorted;
    }, [proposals, sortProposals, searchTerm]);

    const filteredAcceptances = useMemo(() => {
        let sorted = [...acceptances];

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            sorted = sorted.filter(a =>
                getCompanyDisplayName(a.company_name, a.company_alias).toLowerCase().includes(lowerTerm) ||
                a.company_name.toLowerCase().includes(lowerTerm) ||
                a.name.toLowerCase().includes(lowerTerm)
            );
        }

        sorted.sort((a, b) => {
            if (sortAcceptances.key === 'company_name') {
                return sortAcceptances.direction === 'asc'
                    ? getCompanyDisplayName(a.company_name, a.company_alias).localeCompare(getCompanyDisplayName(b.company_name, b.company_alias))
                    : getCompanyDisplayName(b.company_name, b.company_alias).localeCompare(getCompanyDisplayName(a.company_name, a.company_alias));
            } else if (sortAcceptances.key === 'name') {
                return sortAcceptances.direction === 'asc'
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name);
            } else if (sortAcceptances.key === 'status') {
                const statusA = a.status || '';
                const statusB = b.status || '';
                return sortAcceptances.direction === 'asc'
                    ? statusA.localeCompare(statusB)
                    : statusB.localeCompare(statusA);
            } else if (sortAcceptances.key === 'expiration_date') {
                const dateA = a.expiration_date ? new Date(a.expiration_date).getTime() : 0;
                const dateB = b.expiration_date ? new Date(b.expiration_date).getTime() : 0;
                return sortAcceptances.direction === 'asc' ? dateA - dateB : dateB - dateA;
            } else {
                return sortAcceptances.direction === 'asc'
                    ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            }
        });

        return sorted;
    }, [acceptances, sortAcceptances, searchTerm]);

    const getSortIconProposal = (key: SortKeyProposal) => {
        if (sortProposals.key !== key) return <ArrowUpDown className="w-4 h-4 opacity-30" />;
        return sortProposals.direction === 'asc' ? <ArrowUp className="w-4 h-4 text-brand-coral" /> : <ArrowDown className="w-4 h-4 text-brand-coral" />;
    };

    const getSortIconAcceptance = (key: SortKeyAcceptance) => {
        if (sortAcceptances.key !== key) return <ArrowUpDown className="w-4 h-4 opacity-30" />;
        return sortAcceptances.direction === 'asc' ? <ArrowUp className="w-4 h-4 text-brand-coral" /> : <ArrowDown className="w-4 h-4 text-brand-coral" />;
    };

    const pendingFinancialReviewCount = acceptances.filter((acceptance) => isFinancialReviewPending(acceptance)).length;
    const pendingBlockedFinancialReviewCount = acceptances.filter((acceptance) => (
        isFinancialReviewPending(acceptance) && getAcceptanceNonRecurringTotal(acceptance) > 0
    )).length;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Gerenciar Propostas</h2>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm">Crie, edite e acompanhe suas propostas comerciais.</p>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Buscar propostas..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm focus:border-brand-coral outline-none transition-all w-64 text-neutral-600 dark:text-neutral-300 placeholder:text-neutral-400"
                        />
                    </div>
                    <button
                        onClick={() => navigate('/proposals/new')}
                        className="bg-transparent border-2 border-brand-coral text-brand-coral hover:bg-brand-coral hover:text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-brand-coral/10 flex items-center gap-2"
                    >
                        <Plus size={20} />
                        <span className="hidden sm:inline">Nova Proposta</span>
                    </button>
                </div>
            </div>

            <div className="mb-12 bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
                {loading ? (
                    <div className="p-8 text-center text-neutral-400">Carregando propostas...</div>
                ) : proposals.length === 0 ? (
                    <div className="p-12 text-center text-neutral-400">
                        <Plus className="w-12 h-12 mb-4 mx-auto opacity-20" />
                        <p className="mb-4">Nenhuma proposta criada ainda.</p>
                        <button
                            onClick={() => navigate('/proposals/new')}
                            className="text-brand-coral font-bold hover:underline"
                        >
                            Criar minha primeira proposta
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-100 dark:border-neutral-800 text-xs text-neutral-400 uppercase tracking-wider">
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortProposals('created_at')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Data
                                            {getSortIconProposal('created_at')}
                                        </div>
                                    </th>
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortProposals('company_name')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Empresa
                                            {getSortIconProposal('company_name')}
                                        </div>
                                    </th>
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortProposals('responsible_name')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Responsável
                                            {getSortIconProposal('responsible_name')}
                                        </div>
                                    </th>
                                    <th className="p-5 font-bold">Link</th>
                                    <th className="p-5 font-bold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm text-neutral-600 dark:text-neutral-300">
                                {filteredProposals
                                    .filter(proposal => !acceptances.some(acc => acc.proposal_id === proposal.id))
                                    .map((proposal) => (
                                        <tr key={proposal.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                                                    <span className="font-medium text-neutral-700 dark:text-neutral-200">
                                                        {new Date(proposal.created_at).toLocaleDateString('pt-BR')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <Building className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                                                    <span className="font-bold text-neutral-900 dark:text-white">{proposal.company_name}</span>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                                                    <span>{proposal.responsible_name}</span>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => copyLink(proposal.slug)}
                                                        className="text-neutral-400 hover:text-brand-coral p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                                                        title="Copiar Link"
                                                    >
                                                        <LinkIcon className="w-4 h-4" />
                                                    </button>
                                                    <a
                                                        href={`/p/${proposal.slug}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-bold text-brand-coral flex items-center gap-1 hover:underline"
                                                    >
                                                        Visualizar <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="p-5 text-right">
                                                <button
                                                    onClick={() => handleDeleteProposal(proposal.id)}
                                                    className="text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-all"
                                                    title="Excluir Proposta"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="mb-8">
                <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Propostas Aceitas</h2>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm">Contratos ativos e finalizados.</p>
            </div>

            {pendingFinancialReviewCount > 0 && (
                <div className="rounded-c4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                    <span className="font-bold">{pendingFinancialReviewCount} aceite(s)</span> aguardando revisao financeira.
                    {pendingBlockedFinancialReviewCount > 0 && (
                        <span className="ml-2">
                            {pendingBlockedFinancialReviewCount} com receita nao recorrente bloqueada na projecao.
                        </span>
                    )}
                </div>
            )}

            <div className="bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
                {loading ? (
                    <div className="p-8 text-center text-neutral-400">Carregando dados...</div>
                ) : acceptances.length === 0 ? (
                    <div className="p-8 text-center text-neutral-400">Nenhum aceite registrado ainda.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-100 dark:border-neutral-800 text-xs text-neutral-400 uppercase tracking-wider">
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortAcceptances('timestamp')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Data
                                            {getSortIconAcceptance('timestamp')}
                                        </div>
                                    </th>
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortAcceptances('name')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Cliente
                                            {getSortIconAcceptance('name')}
                                        </div>
                                    </th>
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortAcceptances('company_name')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Empresa (CNPJ)
                                            {getSortIconAcceptance('company_name')}
                                        </div>
                                    </th>
                                    <th className="p-5 font-bold">Contrato</th>
                                    <th className="p-5 font-bold">Financeiro</th>
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortAcceptances('expiration_date')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Validade
                                            {getSortIconAcceptance('expiration_date')}
                                        </div>
                                    </th>
                                    <th
                                        className="p-5 font-bold cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                                        onClick={() => handleSortAcceptances('status')}
                                    >
                                        <div className="flex items-center gap-2">
                                            Status
                                            {getSortIconAcceptance('status')}
                                        </div>
                                    </th>
                                    <th className="p-5 font-bold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm text-neutral-600 dark:text-neutral-300">
                                {filteredAcceptances.map((acc) => (
                                    <tr key={acc.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors align-top">
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                                                <span className="font-medium text-neutral-700 dark:text-neutral-200">
                                                    {new Date(acc.timestamp).toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                            <span className="text-xs text-neutral-400 pl-6">
                                                {new Date(acc.timestamp).toLocaleTimeString('pt-BR')}
                                            </span>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Users className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                                                <span className="font-bold text-neutral-900 dark:text-white">{acc.name}</span>
                                            </div>
                                            <input
                                                type="email"
                                                value={acc.email || ''}
                                                onChange={(e) => handleEmailChange(acc.id, e.target.value)}
                                                className="text-xs text-neutral-400 pl-6 bg-transparent outline-none border border-transparent hover:border-neutral-300 focus:border-brand-coral rounded px-1 transition-all w-full"
                                                placeholder="Adicionar email"
                                            />
                                        </td>
                                        <td className="p-5">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <Building className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                                                    <span className="font-semibold text-neutral-700 dark:text-neutral-200">{getCompanyDisplayName(acc.company_name, acc.company_alias)}</span>
                                                </div>
                                                {acc.company_alias && (
                                                    <span className="text-[11px] text-neutral-400 pl-6">Razão social: {acc.company_name}</span>
                                                )}
                                                <input
                                                    type="text"
                                                    value={acc.cnpj || ''}
                                                    onChange={(e) => handleCnpjChange(acc.id, e.target.value)}
                                                    className="text-xs text-neutral-400 pl-6 font-mono bg-transparent outline-none border border-transparent hover:border-neutral-300 focus:border-brand-coral rounded px-1 transition-all w-full"
                                                    placeholder="00.000.000/0000-00"
                                                />
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={`/contracts/${acc.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 text-xs font-bold text-brand-coral hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-brand-coral/20 hover:border-brand-coral"
                                                    title="Visualizar Contrato"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    Contrato
                                                </a>
                                                <a
                                                    href={`/client/preview/${acc.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 text-xs font-bold text-neutral-500 dark:text-neutral-300 hover:text-brand-coral hover:bg-neutral-50 dark:hover:bg-neutral-800 px-3 py-1.5 rounded-lg transition-colors border border-neutral-200 dark:border-neutral-700 hover:border-brand-coral"
                                                    title="Visualizar como Cliente"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                    Cliente
                                                </a>
                                            </div>
                                        </td>
                                        <td className="p-5 min-w-[240px]">
                                            {(() => {
                                                const financial = getFinancialReviewPresentation(acc);

                                                return (
                                                    <div className="space-y-3">
                                                        <div className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-bold ${financial.tone}`}>
                                                            {financial.label}
                                                        </div>
                                                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                                            {financial.detail}
                                                        </div>
                                                        {canManageFinancialReview ? (
                                                            <button
                                                                onClick={() => openFinancialReview(acc)}
                                                                className="inline-flex items-center gap-2 rounded-lg border border-brand-coral/30 px-3 py-1.5 text-xs font-bold text-brand-coral hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                                            >
                                                                {isFinancialReviewPending(acc) ? 'Revisar financeiro' : 'Editar revisao'}
                                                            </button>
                                                        ) : isFinancialReviewPending(acc) ? (
                                                            <span className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-300">
                                                                Aguardando gestor
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-300">
                                                                Revisado
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="p-5">
                                            <input
                                                type="date"
                                                value={acc.expiration_date || ''}
                                                onChange={(e) => handleExpirationChange(acc.id, e.target.value)}
                                                className="bg-transparent border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 outline-none focus:border-brand-coral transition-colors"
                                            />
                                        </td>
                                        <td className="p-5">
                                            <select
                                                value={acc.status || 'Inativo'}
                                                onChange={(e) => handleStatusChange(acc.id, e.target.value)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer transition-colors ${getStatusColor(acc.status || 'Inativo')}`}
                                            >
                                                <option value="Inativo">Inativo</option>
                                                <option value="Ativo">Ativo</option>
                                                <option value="Suspenso">Suspenso</option>
                                                <option value="Cancelado">Cancelado</option>
                                                <option value="Finalizado">Finalizado</option>
                                            </select>
                                        </td>
                                        <td className="p-5 text-right flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleDeleteAcceptance(acc.id)}
                                                className="text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-all"
                                                title="Excluir Registro"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <FinancialReviewModal
                isOpen={isFinancialReviewOpen}
                acceptance={financialReviewAcceptance ? mapAcceptanceToReviewSummary(financialReviewAcceptance) : null}
                isSaving={isSavingFinancialReview}
                onClose={closeFinancialReview}
                onSave={handleSaveFinancialReview}
            />
        </div>
    );
};

export default Proposals;
