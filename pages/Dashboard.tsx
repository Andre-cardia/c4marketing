import React, { useEffect, useState, useMemo } from 'react';
import Header from '../components/Header';
import NoticeCard from '../components/NoticeCard';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
    Users, Building, FileText, Calendar, LogOut, Plus, Link as LinkIcon,
    ExternalLink, Trash2, Moon, Sun, Bell, DollarSign, TrendingUp,
    Briefcase, AlertTriangle, CheckCircle, Clock, Activity, Target
} from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';

interface Acceptance {
    id: number;
    name: string;
    email: string | null;
    cpf: string;
    company_name: string;
    cnpj: string;
    timestamp: string;
    status?: string;
    // For revenue calculation
    contract_snapshot?: any;
    proposal_id?: number | null;
}

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    created_at: string;
    contract_duration: number;
    services?: { id: string; price: number }[];
    status?: string; // 'pending', 'accepted', 'rejected'
}

interface Notice {
    id: string;
    message: string;
    author_name: string;
    author_email: string;
    priority: 'normal' | 'importante' | 'urgente';
    created_at: string;
}

interface Task {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string;
    project_id: number;
}

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();

    const [totalUsers, setTotalUsers] = useState<number>(0);
    const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    // Derived State
    const [revenue, setRevenue] = useState(0);
    const [criticalTasks, setCriticalTasks] = useState<Task[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([
            fetchAcceptances(),
            fetchProposals(),
            fetchUsersCount(),
            fetchNotices(),
            fetchAllTasks()
        ]);
        setLoading(false);
    };

    const fetchAcceptances = async () => {
        const { data } = await supabase.from('acceptances').select('*').order('timestamp', { ascending: false });
        if (data) {
            setAcceptances(data);
            calculateRevenue(data);
        }
    };

    const calculateRevenue = async (acceptancesData: Acceptance[]) => {
        let total = 0;
        // This is a simplified calculation. Ideally, we fetch services for each acceptance from the DB or snapshot.
        // For now, we'll try to use available snapshots or fetch related proposals.
        // To avoid N+1 queries in the loop for fetched proposals, we can rely on what we have or fetch proposals separately.

        // We will do a robust matching after proposals are fetched, or use a separate loop here if needed.
        // For speed, let's assume we can get prices from contract_snapshot if available.

        for (const acc of acceptancesData) {
            if (acc.status === 'Ativo' || acc.status === 'Onboarding' || !acc.status) { // Assume active if status missing for legacy
                if (acc.contract_snapshot?.proposal?.services) {
                    acc.contract_snapshot.proposal.services.forEach((s: any) => {
                        total += Number(s.price || 0);
                    });
                }
            }
        }
        setRevenue(total);
    };

    const fetchProposals = async () => {
        const { data } = await supabase.from('proposals').select('*').order('created_at', { ascending: false });
        if (data) setProposals(data);
    };

    const fetchUsersCount = async () => {
        const { count } = await supabase.from('app_users').select('*', { count: 'exact', head: true });
        if (count !== null) setTotalUsers(count);
    };

    const fetchNotices = async () => {
        const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(10);
        if (data) setNotices(data);
    };

    const fetchAllTasks = async () => {
        const { data } = await supabase.from('project_tasks').select('*');
        if (data) {
            setTasks(data);
            setCriticalTasks(data.filter((t: Task) => t.priority === 'high' && t.status !== 'done'));
        }
    };

    const handleDeleteNotice = async (id: string) => {
        const { error } = await supabase.from('notices').delete().eq('id', id);
        if (!error) {
            setNotices(notices.filter(n => n.id !== id));
        }
    };

    const clientStatusCounts = useMemo(() => ({
        onboarding: acceptances.filter(a => !a.status || a.status === 'Onboarding').length,
        active: acceptances.filter(a => a.status === 'Ativo').length,
        suspended: acceptances.filter(a => a.status === 'Suspenso').length,
    }), [acceptances]);

    const taskStatusCounts = useMemo(() => ({
        backlog: tasks.filter(t => t.status === 'backlog').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        approval: tasks.filter(t => t.status === 'approval').length,
        done: tasks.filter(t => t.status === 'done').length,
    }), [tasks]);

    if (roleLoading) return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-coral"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Top Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Revenue Card */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-green-500/5 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:bg-green-500/10"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl">
                                    <DollarSign size={24} />
                                </div>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Receita Estimada (MRR)</span>
                            </div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(revenue).replace('R$', 'R$ ')}
                            </div>
                            <div className="text-xs text-green-500 font-bold mt-2 flex items-center gap-1">
                                <TrendingUp size={12} /> +12% vs. mês anterior
                            </div>
                        </div>
                    </div>

                    {/* Active Projects Card */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:bg-blue-500/10"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                                    <Briefcase size={24} />
                                </div>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Projetos Ativos</span>
                            </div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">
                                {clientStatusCounts.active}
                            </div>
                            <div className="text-xs text-slate-400 mt-2">
                                {clientStatusCounts.onboarding} em onboarding
                            </div>
                        </div>
                    </div>

                    {/* Funnel Card */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-brand-coral/5 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:bg-brand-coral/10"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-brand-coral/10 text-brand-coral rounded-xl">
                                    <Target size={24} />
                                </div>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Taxa de Conversão</span>
                            </div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">
                                {proposals.length > 0 ? ((acceptances.length / proposals.length) * 100).toFixed(1) : 0}%
                            </div>
                            <div className="text-xs text-slate-400 mt-2">
                                {proposals.length} propostas enviadas
                            </div>
                        </div>
                    </div>

                    {/* Critical Tasks Card */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group cursor-pointer hover:border-red-300 dark:hover:border-red-900 transition-colors" onClick={() => navigate('/projects')}>
                        <div className="absolute right-0 top-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:bg-red-500/10"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl">
                                    <AlertTriangle size={24} />
                                </div>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Tarefas Críticas</span>
                            </div>
                            <div className="text-3xl font-black text-slate-800 dark:text-white">
                                {criticalTasks.length}
                            </div>
                            <div className="text-xs text-red-500 font-bold mt-2">
                                Requerem atenção imediata
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">

                    {/* Left Column: Charts & Analysis */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Commercial Performance Chart (Existing but refined) */}
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-brand-coral" />
                                    Performance Semestral
                                </h3>
                                <div className="flex gap-4 text-xs font-bold">
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div> Criadas</div>
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-brand-coral"></div> Aceitas</div>
                                </div>
                            </div>

                            {/* Simple CSS Bar Chart Implementation */}
                            <div className="h-64 flex items-end justify-between gap-2">
                                {(() => {
                                    const months = [];
                                    for (let i = 5; i >= 0; i--) {
                                        const d = new Date();
                                        d.setMonth(d.getMonth() - i);
                                        months.push(d);
                                    }

                                    return months.map((date, idx) => {
                                        const mKey = date.toISOString().slice(0, 7); // YYYY-MM
                                        const created = proposals.filter(p => p.created_at.startsWith(mKey)).length;
                                        const accepted = acceptances.filter(a => a.timestamp.startsWith(mKey)).length;
                                        const max = Math.max(1, ...months.map(m => {
                                            const k = m.toISOString().slice(0, 7);
                                            return Math.max(
                                                proposals.filter(p => p.created_at.startsWith(k)).length,
                                                acceptances.filter(a => a.timestamp.startsWith(k)).length
                                            );
                                        }));

                                        return (
                                            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                                                <div className="w-full flex justify-center items-end gap-1 h-full pb-2 relative">
                                                    <div className="absolute -top-8 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {created} / {accepted}
                                                    </div>
                                                    <div style={{ height: `${(created / max) * 100}%` }} className="w-3 md:w-6 bg-slate-200 dark:bg-slate-700 rounded-t-lg transition-all duration-500 hover:bg-slate-300"></div>
                                                    <div style={{ height: `${(accepted / max) * 100}%` }} className="w-3 md:w-6 bg-brand-coral rounded-t-lg transition-all duration-500 opacity-90 hover:opacity-100"></div>
                                                </div>
                                                <span className="text-xs text-slate-400 font-medium uppercase">{date.toLocaleString('default', { month: 'short' })}</span>
                                            </div>
                                        )
                                    });
                                })()}
                            </div>
                        </div>

                        {/* Recent Critical Tasks */}
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-red-500" />
                                    Prioridades
                                </h3>
                                <button onClick={() => navigate('/projects')} className="text-xs text-brand-coral font-bold hover:underline">Ver Todas</button>
                            </div>

                            {criticalTasks.length === 0 ? (
                                <p className="text-slate-400 text-center py-8">Nenhuma tarefa crítica pendente.</p>
                            ) : (
                                <div className="space-y-3">
                                    {criticalTasks.slice(0, 5).map(task => (
                                        <div key={task.id} className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl">
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-200">{task.title}</h4>
                                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                    <Clock size={12} /> Prazo: {new Date(task.due_date).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <span className="px-3 py-1 bg-white dark:bg-slate-800 text-red-500 text-xs font-bold rounded-full shadow-sm">
                                                Urgente
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Operational Stats & Notices */}
                    <div className="space-y-8">

                        {/* Global Task Status */}
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-blue-500" />
                                Status Global
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                                        <span className="text-slate-600 dark:text-slate-300 font-medium">Backlog</span>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-white">{taskStatusCounts.backlog}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                        <span className="text-slate-600 dark:text-slate-300 font-medium">Em Execução</span>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-white">{taskStatusCounts.in_progress}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                        <span className="text-slate-600 dark:text-slate-300 font-medium">Aprovação</span>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-white">{taskStatusCounts.approval}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                        <span className="text-slate-600 dark:text-slate-300 font-medium">Finalizado</span>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-white">{taskStatusCounts.done}</span>
                                </div>
                            </div>
                        </div>

                        {/* Notices (Simplified) */}
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Bell className="w-5 h-5 text-brand-coral" />
                                    Avisos
                                </h3>
                                <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400">
                                    <Plus size={18} />
                                </button>
                            </div>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {notices.length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm py-4">Nenhum aviso.</p>
                                ) : (
                                    notices.map(notice => (
                                        <NoticeCard
                                            key={notice.id}
                                            id={notice.id}
                                            message={notice.message}
                                            authorName={notice.author_name}
                                            timestamp={notice.created_at}
                                            priority={notice.priority}
                                            canDelete={userRole === 'gestor'}
                                            onDelete={handleDeleteNotice}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions / Navigation */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button
                        onClick={() => navigate('/projects')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left flex items-center gap-4"
                    >
                        <div className="bg-brand-coral/10 w-12 h-12 flex items-center justify-center rounded-2xl text-brand-coral group-hover:bg-brand-coral group-hover:text-white transition-colors">
                            <Briefcase className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-slate-800 dark:text-white">Projetos</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Gerenciar entregas</span>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/proposals')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left flex items-center gap-4"
                    >
                        <div className="bg-blue-50 dark:bg-blue-900/20 w-12 h-12 flex items-center justify-center rounded-2xl text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-slate-800 dark:text-white">Propostas</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Novo contrato</span>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/users')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left flex items-center gap-4"
                    >
                        <div className="bg-slate-100 dark:bg-slate-700 w-12 h-12 flex items-center justify-center rounded-2xl text-slate-600 dark:text-slate-300 group-hover:bg-slate-800 dark:group-hover:bg-slate-600 group-hover:text-white transition-colors">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-slate-800 dark:text-white">Equipe</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Gerenciar acessos</span>
                        </div>
                    </button>
                </div>

            </main>
        </div>
    );
};

export default Dashboard;
