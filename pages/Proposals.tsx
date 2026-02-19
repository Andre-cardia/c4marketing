import React, { useEffect, useState, useMemo } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Users, Building, Calendar, Link as LinkIcon, ExternalLink, Trash2, Plus, Moon, Sun, FileText, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    created_at: string;
    contract_duration: number;
    services?: { id: string; price: number }[];
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

const Proposals: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();

    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

    const [acceptances, setAcceptances] = useState<any[]>([]);

    // Filter & Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortProposals, setSortProposals] = useState<SortConfigProposal>({ key: 'created_at', direction: 'desc' });
    const [sortAcceptances, setSortAcceptances] = useState<SortConfigAcceptance>({ key: 'timestamp', direction: 'desc' });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    // Access control - redirect if not gestor or comercial
    useEffect(() => {
        if (!roleLoading && userRole !== 'gestor' && userRole !== 'comercial') {
            navigate('/dashboard');
        }
    }, [userRole, roleLoading, navigate]);

    useEffect(() => {
        if (userRole === 'gestor' || userRole === 'comercial') {
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
        const { data } = await supabase.from('acceptances').select('*').order('timestamp', { ascending: false });
        if (data) setAcceptances(data);
    };

    const handleDeleteProposal = async (id: number) => {
        if (!window.confirm('Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('proposals')
                .delete()
                .eq('id', id);

            if (error) throw error;

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
            const { error } = await supabase
                .from('acceptances')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setAcceptances(prev => prev.filter(acc => acc.id !== id));
            alert('Registro excluído com sucesso.');
        } catch (error) {
            console.error('Error deleting acceptance:', error);
            alert('Erro ao excluir. Verifique se você tem permissão de administrador.');
        }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        setAcceptances(prev => prev.map(acc =>
            acc.id === id ? { ...acc, status: newStatus } : acc
        ));

        try {
            const { error } = await supabase
                .from('acceptances')
                .update({ status: newStatus })
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Ativo': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            case 'Suspenso': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
            case 'Cancelado': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            case 'Finalizado': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
            default: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
        }
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
                a.company_name.toLowerCase().includes(lowerTerm) ||
                a.name.toLowerCase().includes(lowerTerm)
            );
        }

        sorted.sort((a, b) => {
            if (sortAcceptances.key === 'company_name') {
                return sortAcceptances.direction === 'asc'
                    ? a.company_name.localeCompare(b.company_name)
                    : b.company_name.localeCompare(a.company_name);
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

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gerenciar Propostas</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Crie, edite e acompanhe suas propostas comerciais.</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar propostas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:border-brand-coral outline-none transition-all w-64 text-slate-600 dark:text-slate-300 placeholder:text-slate-400"
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

                <div className="mb-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Carregando propostas...</div>
                    ) : proposals.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
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
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSortProposals('created_at')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Data
                                                {getSortIconProposal('created_at')}
                                            </div>
                                        </th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSortProposals('company_name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Empresa
                                                {getSortIconProposal('company_name')}
                                            </div>
                                        </th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
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
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm text-slate-600 dark:text-slate-300">
                                    {filteredProposals
                                        .filter(proposal => !acceptances.some(acc => acc.proposal_id === proposal.id))
                                        .map((proposal) => (
                                            <tr key={proposal.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="p-5">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                        <span className="font-medium text-slate-700 dark:text-slate-200">
                                                            {new Date(proposal.created_at).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="flex items-center gap-2">
                                                        <Building className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                        <span className="font-bold text-slate-800 dark:text-white">{proposal.company_name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                        <span>{proposal.responsible_name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => copyLink(proposal.slug)}
                                                            className="text-slate-400 hover:text-brand-coral p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
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
                                                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-all"
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
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Propostas Aceitas</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Contratos ativos e finalizados.</p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Carregando dados...</div>
                    ) : acceptances.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">Nenhum aceite registrado ainda.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSortAcceptances('timestamp')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Data
                                                {getSortIconAcceptance('timestamp')}
                                            </div>
                                        </th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSortAcceptances('name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Cliente
                                                {getSortIconAcceptance('name')}
                                            </div>
                                        </th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSortAcceptances('company_name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Empresa (CNPJ)
                                                {getSortIconAcceptance('company_name')}
                                            </div>
                                        </th>
                                        <th className="p-5 font-bold">Contrato</th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSortAcceptances('expiration_date')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Validade
                                                {getSortIconAcceptance('expiration_date')}
                                            </div>
                                        </th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
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
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm text-slate-600 dark:text-slate-300">
                                    {filteredAcceptances.map((acc) => (
                                        <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                                        {new Date(acc.timestamp).toLocaleDateString('pt-BR')}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-slate-400 pl-6">
                                                    {new Date(acc.timestamp).toLocaleTimeString('pt-BR')}
                                                </span>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Users className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                    <span className="font-bold text-slate-800 dark:text-white">{acc.name}</span>
                                                </div>
                                                <input
                                                    type="email"
                                                    value={acc.email || ''}
                                                    onChange={(e) => handleEmailChange(acc.id, e.target.value)}
                                                    className="text-xs text-slate-400 pl-6 bg-transparent outline-none border border-transparent hover:border-slate-200 focus:border-brand-coral rounded px-1 transition-all w-full"
                                                    placeholder="Adicionar email"
                                                />
                                            </td>
                                            <td className="p-5">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <Building className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                        <span className="font-semibold text-slate-700 dark:text-slate-200">{acc.company_name}</span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={acc.cnpj || ''}
                                                        onChange={(e) => handleCnpjChange(acc.id, e.target.value)}
                                                        className="text-xs text-slate-400 pl-6 font-mono bg-transparent outline-none border border-transparent hover:border-slate-200 focus:border-brand-coral rounded px-1 transition-all w-full"
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
                                                        className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-200 hover:border-blue-400"
                                                        title="Visualizar como Cliente"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        Cliente
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <input
                                                    type="date"
                                                    value={acc.expiration_date || ''}
                                                    onChange={(e) => handleExpirationChange(acc.id, e.target.value)}
                                                    className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-600 dark:text-slate-300 outline-none focus:border-brand-coral transition-colors"
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
                                                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-all"
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
            </main>
        </div>
    );
};

export default Proposals;
