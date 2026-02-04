import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Users, Building, FileText, Calendar, LogOut, Plus, Link as LinkIcon, ExternalLink, Trash2, Moon, Sun } from 'lucide-react';

interface Acceptance {
    id: number;
    name: string;
    email: string | null;
    cpf: string;
    company_name: string;
    cnpj: string;
    timestamp: string;
    status?: string;
}

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    created_at: string;
    contract_duration: number;
    services?: { id: string; price: number }[];
}

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [totalUsers, setTotalUsers] = useState<number>(0);

    const clientStatusCounts = {
        onboarding: acceptances.filter(a => !a.status || a.status === 'Onboarding').length,
        active: acceptances.filter(a => a.status === 'Ativo').length,
        suspended: acceptances.filter(a => a.status === 'Suspenso').length,
        development: acceptances.filter(a => ['Em Desenvolvimento', 'LP', 'Site', 'E-commerce'].includes(a.status || '')).length,
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchAcceptances(), fetchProposals(), fetchUsersCount()]);
        setLoading(false);
    };

    const fetchAcceptances = async () => {
        const { data } = await supabase.from('acceptances').select('*').order('timestamp', { ascending: false });
        if (data) setAcceptances(data);
    };

    const fetchProposals = async () => {
        const { data } = await supabase.from('proposals').select('*').order('created_at', { ascending: false });
        if (data) setProposals(data);
    };

    const fetchUsersCount = async () => {
        const { count } = await supabase.from('app_users').select('*', { count: 'exact', head: true });
        if (count !== null) setTotalUsers(count);
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

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            {/* Header */}
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Main Navigation & KPIs */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                    {/* KPI Box: Performance */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-brand-coral" />
                            Desempenho Geral
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                                <span className="text-sm text-slate-500 dark:text-slate-400">Propostas Criadas</span>
                                <span className="text-xl font-black text-slate-800 dark:text-white">{proposals.length}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <span className="text-sm text-green-600 dark:text-green-400">Propostas Aceitas</span>
                                <span className="text-xl font-black text-green-700 dark:text-green-400">{acceptances.length}</span>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                <p className="text-xs text-slate-400 text-center">Taxa de Conversão: {proposals.length > 0 ? ((acceptances.length / proposals.length) * 100).toFixed(1) : 0}%</p>
                            </div>
                        </div>
                    </div>

                    {/* KPI Box: Clients Status */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-brand-coral" />
                            Status de Clientes
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center">
                                <span className="block text-2xl font-black text-slate-800 dark:text-white">{clientStatusCounts.onboarding}</span>
                                <span className="text-xs text-slate-500 font-bold uppercase">Onboarding</span>
                            </div>
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                                <span className="block text-2xl font-black text-green-700 dark:text-green-400">{clientStatusCounts.active}</span>
                                <span className="text-xs text-green-600 dark:text-green-400 font-bold uppercase">Ativos</span>
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                                <span className="block text-2xl font-black text-blue-700 dark:text-blue-400">{clientStatusCounts.development}</span>
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Em Dev</span>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center">
                                <span className="block text-2xl font-black text-slate-800 dark:text-white">{totalUsers}</span>
                                <span className="text-xs text-slate-500 font-bold uppercase">Usuários</span>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Actions */}
                    <div className="flex flex-col gap-4">
                        <button
                            onClick={() => navigate('/proposals/new')}
                            className="flex-1 bg-brand-coral hover:bg-brand-coral/90 text-white p-4 rounded-2xl font-bold text-left transition-all shadow-lg hover:shadow-brand-coral/25 flex items-center justify-between group"
                        >
                            <div>
                                <span className="block text-xs uppercase opacity-80 mb-1">Ação Rápida</span>
                                <span className="text-xl">Nova Proposta</span>
                            </div>
                            <Plus className="w-8 h-8 group-hover:scale-110 transition-transform" />
                        </button>

                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <button
                                onClick={() => navigate('/clients')}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl hover:border-brand-coral dark:hover:border-brand-coral transition-colors flex flex-col justify-center items-center gap-2 group"
                            >
                                <div className="bg-brand-coral/10 p-2 rounded-full text-brand-coral group-hover:bg-brand-coral group-hover:text-white transition-colors">
                                    <Users className="w-6 h-6" />
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-300">Clientes</span>
                            </button>

                            <button
                                onClick={() => navigate('/users')}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl hover:border-brand-coral dark:hover:border-brand-coral transition-colors flex flex-col justify-center items-center gap-2 group"
                            >
                                <div className="bg-brand-coral/10 p-2 rounded-full text-brand-coral group-hover:bg-brand-coral group-hover:text-white transition-colors">
                                    <Users className="w-6 h-6" />
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-300">Usuários</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Existing Proposals Section */}
                <div className="mb-12">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Últimas Propostas</h2>
                        </div>
                        <button
                            onClick={() => navigate('/proposals')} // Assuming you might want a full list page later, or just scroll
                            className="text-brand-coral font-bold text-sm hover:underline"
                        >
                            Ver todas
                        </button>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
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
                                            <th className="p-5 font-bold">Data</th>
                                            <th className="p-5 font-bold">Empresa</th>
                                            <th className="p-5 font-bold">Responsável</th>
                                            <th className="p-5 font-bold">Link</th>
                                            <th className="p-5 font-bold text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm text-slate-600 dark:text-slate-300">
                                        {proposals.slice(0, 5).map((proposal) => (
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
                </div>

                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Últimos Aceites</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Visualize e gerencie os acordos firmados.</p>
                </div>

                {/* Stats - REMOVED (Replaced by top KPIs) */}


                {/* Table */}
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
                                        <th className="p-5 font-bold">Data</th>
                                        <th className="p-5 font-bold">Cliente</th>
                                        <th className="p-5 font-bold">Empresa</th>
                                        <th className="p-5 font-bold">Documentos</th>
                                        <th className="p-5 font-bold">Contrato</th>
                                        <th className="p-5 font-bold">Status</th>
                                        <th className="p-5 font-bold text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm text-slate-600 dark:text-slate-300">
                                    {acceptances.map((acc) => (
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
                                                {acc.email && <div className="text-xs text-slate-400 pl-6">{acc.email}</div>}
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <Building className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                    <span>{acc.company_name}</span>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <FileText className="w-4 h-4 text-slate-300 dark:text-slate-500" />
                                                    <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-500 dark:text-slate-300">{acc.cnpj}</span>
                                                </div>
                                                <div className="pl-6 text-xs text-slate-400">CPF: {acc.cpf}</div>
                                            </td>
                                            <td className="p-5">
                                                <a
                                                    href={`/contracts/${acc.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 text-xs font-bold text-brand-coral hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-brand-coral/20 hover:border-brand-coral"
                                                    title="Visualizar Contrato"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    Visualizar
                                                </a>
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
        </div >
    );
};

export default Dashboard;
