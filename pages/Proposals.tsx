import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Users, Building, Calendar, Link as LinkIcon, ExternalLink, Trash2, Plus, Moon, Sun } from 'lucide-react';

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    created_at: string;
    contract_duration: number;
    services?: { id: string; price: number }[];
}

const Proposals: React.FC = () => {
    const navigate = useNavigate();
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    useEffect(() => {
        fetchProposals();
    }, []);

    const fetchProposals = async () => {
        setLoading(true);
        const { data } = await supabase.from('proposals').select('*').order('created_at', { ascending: false });
        if (data) setProposals(data);
        setLoading(false);
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

    const copyLink = (slug: string) => {
        const url = `${window.location.origin}/p/${slug}`;
        navigator.clipboard.writeText(url);
        alert('Link copiado para a área de transferência!');
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gerenciar Propostas</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Crie, edite e acompanhe suas propostas comerciais.</p>
                    </div>
                    <button
                        onClick={() => navigate('/proposals/new')}
                        className="bg-brand-coral hover:bg-brand-coral/90 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-brand-coral/25 flex items-center gap-2"
                    >
                        <Plus size={20} />
                        Nova Proposta
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
                                    {proposals.map((proposal) => (
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
            </main>
        </div>
    );
};

export default Proposals;
