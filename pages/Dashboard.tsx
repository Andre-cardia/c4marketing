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
}

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    created_at: string;
    contract_duration: number;
}

const Dashboard: React.FC = () => {
    const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

    // Create Proposal Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProposal, setNewProposal] = useState({
        companyName: '',
        responsibleName: '',
        monthlyFee: 2500,
        setupFee: 700,
        mediaLimit: 5000,
        contractDuration: 6
    });
    const [creating, setCreating] = useState(false);

    const navigate = useNavigate();

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
        await Promise.all([fetchAcceptances(), fetchProposals()]);
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

    const handleCreateProposal = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);

        const slug = newProposal.companyName
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with dash
            .replace(/^-+|-+$/g, ''); // remove leading/trailing dashes

        try {
            const { error } = await supabase.from('proposals').insert([{
                company_name: newProposal.companyName,
                responsible_name: newProposal.responsibleName,
                monthly_fee: newProposal.monthlyFee,
                setup_fee: newProposal.setupFee,
                media_limit: newProposal.mediaLimit,
                contract_duration: newProposal.contractDuration,
                slug: slug
            }]);

            if (error) throw error;

            setShowCreateModal(false);
            setNewProposal({
                companyName: '',
                responsibleName: '',
                monthlyFee: 2500,
                setupFee: 700,
                mediaLimit: 5000,
                contractDuration: 6
            });
            fetchProposals();
            alert('Proposta criada com sucesso!');
        } catch (error: any) {
            console.error('Error creating proposal:', error);
            alert('Erro ao criar proposta. Verifique se o nome da empresa é válido.');
        } finally {
            setCreating(false);
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
            {/* Create Proposal Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200 dark:border-slate-700">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Criar Nova Proposta</h3>

                        <form onSubmit={handleCreateProposal} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Nome da Empresa</label>
                                <input
                                    type="text"
                                    required
                                    value={newProposal.companyName}
                                    onChange={e => setNewProposal({ ...newProposal, companyName: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    placeholder="Ex: Amplexo Diesel"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Responsável</label>
                                <input
                                    type="text"
                                    required
                                    value={newProposal.responsibleName}
                                    onChange={e => setNewProposal({ ...newProposal, responsibleName: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    placeholder="Ex: João Silva"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Mensalidade (R$)</label>
                                    <input
                                        type="number"
                                        required
                                        value={newProposal.monthlyFee}
                                        onChange={e => setNewProposal({ ...newProposal, monthlyFee: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Setup/LP (R$)</label>
                                    <input
                                        type="number"
                                        required
                                        value={newProposal.setupFee}
                                        onChange={e => setNewProposal({ ...newProposal, setupFee: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Limite (Ads) R$</label>
                                    <input
                                        type="number"
                                        required
                                        value={newProposal.mediaLimit}
                                        onChange={e => setNewProposal({ ...newProposal, mediaLimit: parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Contrato (Meses)</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={newProposal.contractDuration}
                                        onChange={e => setNewProposal({ ...newProposal, contractDuration: parseInt(e.target.value) })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 bg-brand-coral text-white py-3 rounded-xl font-bold hover:bg-red-500 transition-colors shadow-lg shadow-brand-coral/20"
                                >
                                    {creating ? 'Criando...' : 'Criar Proposta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Header */}
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Proposals Section */}
                <div className="mb-12">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Propostas Comerciais</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Gerencie links personalizados para seus clientes.</p>
                        </div>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-slate-900 dark:bg-brand-coral text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 dark:hover:bg-red-500 transition-colors shadow-lg"
                        >
                            <Plus className="w-4 h-4" />
                            Nova Proposta
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {proposals.map(proposal => (
                            <div key={proposal.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-brand-coral/10 p-3 rounded-xl text-brand-coral">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <button
                                        onClick={() => copyLink(proposal.slug)}
                                        className="text-slate-400 hover:text-brand-coral p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                        title="Copiar Link"
                                    >
                                        <LinkIcon className="w-5 h-5" />
                                    </button>
                                </div>

                                <h3 className="font-bold text-slate-800 dark:text-white text-lg mb-1">{proposal.company_name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Resp: {proposal.responsible_name}</p>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-700">
                                    <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                        {new Date(proposal.created_at).toLocaleDateString()}
                                    </span>
                                    <a
                                        href={`/p/${proposal.slug}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-brand-coral flex items-center gap-1 hover:underline"
                                    >
                                        Visualizar <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        ))}

                        {/* Empty State Card */}
                        {proposals.length === 0 && !loading && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-brand-coral/50 hover:bg-brand-coral/5 hover:text-brand-coral transition-all min-h-[200px]"
                            >
                                <Plus className="w-8 h-8 mb-2 opacity-50" />
                                <span className="font-medium text-sm">Criar primeira proposta</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Aceites Recentes</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Visualize e gerencie os acordos firmados.</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl text-green-600 dark:text-green-400">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Total de Aceites</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-white">{acceptances.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

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
                                            <td className="p-5 text-right">
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

export default Dashboard;
