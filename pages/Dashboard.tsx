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
    const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

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
                    {/* KPI Box: Performance Graph */}
                    <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-brand-coral" />
                                    Desempenho Comercial
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Comparativo semestral de propostas</p>
                            </div>
                            <div className="flex gap-4 text-xs font-bold">
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                                    <span className="text-slate-600 dark:text-slate-300">Criadas</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-3 h-3 rounded-full bg-brand-coral"></div>
                                    <span className="text-slate-600 dark:text-slate-300">Aceitas</span>
                                </div>
                            </div>
                        </div>

                        {/* CSS Bar Chart */}
                        <div className="flex items-end justify-between h-48 gap-2 sm:gap-4 mt-auto w-full px-2">
                            {(() => {
                                const months = [];
                                const startDate = new Date(2026, 0, 1);
                                const endDate = new Date();

                                let current = new Date(startDate);
                                while (current <= endDate || (current.getMonth() === endDate.getMonth() && current.getFullYear() === endDate.getFullYear())) {
                                    months.push(new Date(current));
                                    current.setMonth(current.getMonth() + 1);
                                }

                                // Use UTC to avoid timezone issues
                                const getMonthKey = (dateStr: string) => {
                                    const d = new Date(dateStr);
                                    // Extract year and month from the ISO string to avoid timezone shifts
                                    const isoStr = d.toISOString(); // e.g., "2026-02-03T18:50:42.906Z"
                                    return isoStr.substring(0, 7); // Returns "2026-02"
                                };

                                const getLocalMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

                                return months.map((date, index) => {
                                    const monthKey = date.toLocaleString('default', { month: 'short' });
                                    const mKey = getLocalMonthKey(date);

                                    const createdCount = proposals.filter(p => {
                                        const pKey = getMonthKey(p.created_at);
                                        return pKey === mKey;
                                    }).length;

                                    const acceptedCount = acceptances.filter(a => {
                                        const aKey = getMonthKey(a.timestamp);
                                        return aKey === mKey;
                                    }).length;

                                    // Calculate max across all months
                                    const allCounts = months.map(m => {
                                        const k = getLocalMonthKey(m);
                                        const p = proposals.filter(prop => getMonthKey(prop.created_at) === k).length;
                                        const a = acceptances.filter(acc => getMonthKey(acc.timestamp) === k).length;
                                        return Math.max(p, a);
                                    });
                                    const dynamicMax = Math.max(10, ...allCounts);

                                    const hCreated = (createdCount / dynamicMax) * 100;
                                    const hAccepted = (acceptedCount / dynamicMax) * 100;

                                    return (
                                        <div key={index} className="flex flex-col items-center flex-1 group">
                                            <div className="relative flex justify-center items-end w-full gap-1 h-full">
                                                {/* Tooltip */}
                                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg border border-slate-700">
                                                    {createdCount} Criadas | {acceptedCount} Aceitas
                                                </div>

                                                {/* Bar Created */}
                                                <div
                                                    className="w-3 sm:w-6 bg-slate-300 dark:bg-slate-700 rounded-t-sm transition-all duration-500"
                                                    style={{ height: `${Math.max(4, hCreated)}%`, opacity: hCreated > 0 ? 1 : 0.3 }}
                                                ></div>
                                                {/* Bar Accepted */}
                                                <div
                                                    className="w-3 sm:w-6 bg-brand-coral rounded-t-sm transition-all duration-500 opacity-90"
                                                    style={{ height: `${Math.max(4, hAccepted)}%`, opacity: hAccepted > 0 ? 1 : 0.3 }}
                                                ></div>
                                            </div>
                                            <span className="mt-3 text-xs font-bold text-slate-400 uppercase">{monthKey}</span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {/* KPI Box: Clients Status & Conversion */}
                    <div className="flex flex-col gap-6">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-brand-coral" />
                                Status de Projetos
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
                                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-center">
                                    <span className="block text-2xl font-black text-orange-700 dark:text-orange-400">{clientStatusCounts.suspended}</span>
                                    <span className="text-xs text-orange-600 dark:text-orange-400 font-bold uppercase">Suspensos</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-slate-500">Taxa de Conversão</span>
                                <span className="font-bold text-brand-coral">{proposals.length > 0 ? ((acceptances.length / proposals.length) * 100).toFixed(1) : 0}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-coral transition-all duration-1000 ease-out rounded-full"
                                    style={{ width: `${proposals.length > 0 ? (acceptances.length / proposals.length) * 100 : 0}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Primary Navigation Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <button
                        onClick={() => navigate('/projects')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left"
                    >
                        <div className="bg-brand-coral/10 w-12 h-12 flex items-center justify-center rounded-2xl text-brand-coral group-hover:bg-brand-coral group-hover:text-white transition-colors mb-4">
                            <Users className="w-6 h-6" />
                        </div>
                        <span className="block text-lg font-bold text-slate-800 dark:text-white mb-1">Gestão de Projetos</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">Acompanhar projetos e status</span>
                    </button>

                    <button
                        onClick={() => navigate('/proposals')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left"
                    >
                        <div className="bg-blue-50 dark:bg-blue-900/20 w-12 h-12 flex items-center justify-center rounded-2xl text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors mb-4">
                            <FileText className="w-6 h-6" />
                        </div>
                        <span className="block text-lg font-bold text-slate-800 dark:text-white mb-1">Gestão de Propostas</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">Criar e visualizar propostas</span>
                    </button>

                    <button
                        onClick={() => navigate('/users')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left"
                    >
                        <div className="bg-slate-100 dark:bg-slate-700 w-12 h-12 flex items-center justify-center rounded-2xl text-slate-600 dark:text-slate-300 group-hover:bg-slate-800 dark:group-hover:bg-slate-600 group-hover:text-white transition-colors mb-4">
                            <Users className="w-6 h-6" />
                        </div>
                        <span className="block text-lg font-bold text-slate-800 dark:text-white mb-1">Gestão de Usuários</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">Administrar equipe e acesso</span>
                    </button>
                </div>

            </main>
        </div>
    );
};

export default Dashboard;
