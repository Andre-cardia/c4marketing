import React, { useEffect, useState, useMemo } from 'react';
import Header from '../components/Header';
import NoticeCard from '../components/NoticeCard';
import TaskModal from '../components/projects/TaskModal';
import NoticeModal from '../components/NoticeModal';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
    Users, Building, FileText, Calendar, LogOut, Plus, Link as LinkIcon,
    ExternalLink, Trash2, Moon, Sun, Bell, LayoutDashboard, ListTodo,
    Briefcase, AlertTriangle, CheckCircle, Clock, Activity, Target,
    X, ArrowRight, BarChart2
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
    status?: string;
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
    status: 'backlog' | 'in_progress' | 'approval' | 'done' | 'paused';
    priority: 'low' | 'medium' | 'high';
    due_date: string;
    project_id: number;
    description?: string;
    assignee?: string;
    attachment_url?: string;
    // Enriched field
    project_name?: string;
}

interface Booking {
    id: number;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    status: string;
    meetingUrl?: string;
}

interface AccessLog {
    id: string;
    user_id: string;
    accessed_at: string;
    user_email?: string;
    user?: {
        full_name: string;
        avatar_url?: string;
        email: string;
    };
}

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, fullName, email, avatarUrl, loading: roleLoading } = useUserRole();

    const [totalUsers, setTotalUsers] = useState<number>(0);
    const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
    const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
    const [usersMap, setUsersMap] = useState<Map<string, any>>(new Map());
    const [usersEmailMap, setUsersEmailMap] = useState<Map<string, any>>(new Map());
    const [loading, setLoading] = useState(true);

    // Derived State
    const [criticalTasks, setCriticalTasks] = useState<Task[]>([]);
    const [myPriorityTasks, setMyPriorityTasks] = useState<Task[]>([]);
    const [deliveriesThisWeek, setDeliveriesThisWeek] = useState<number>(0);

    // Modal States
    const [showCriticalListModal, setShowCriticalListModal] = useState(false);
    const [tasksToView, setTasksToView] = useState<Task[]>([]); // For the list modal
    const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | undefined>(undefined);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

    // Notice Modal
    const [showNoticeModal, setShowNoticeModal] = useState(false);
    const [showAccessReportModal, setShowAccessReportModal] = useState(false);

    // User Avatar Map
    const [userAvatars, setUserAvatars] = useState<{ [email: string]: string }>({});

    // -- Access Control Logic --
    const logAccess = async () => {
        const lastLog = localStorage.getItem('lastAccessLog');
        const now = new Date();

        // Debounce: Log only if last log was > 30 minutes ago
        if (lastLog) {
            const lastDate = new Date(lastLog);
            const diffInMinutes = (now.getTime() - lastDate.getTime()) / (1000 * 60);
            if (diffInMinutes < 30) return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('access_logs').insert([{
                user_id: user.id,
                user_email: user.email
            }]);
            localStorage.setItem('lastAccessLog', now.toISOString());
        }
    };

    const fetchAccessLogs = async () => {
        const { data } = await supabase.from('access_logs').select('*').order('accessed_at', { ascending: false }).limit(20);
        if (data) {
            setAccessLogs(data);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        // Sequential fetch to ensure acceptances (projects) are loaded before task enrichment
        const acceptancesData = await fetchAcceptances();
        await Promise.all([
            fetchProposals(),
            fetchUsersCount(),
            fetchNotices(),
            fetchAllTasks(acceptancesData),
            fetchUpcomingBookings(),
            fetchUsersCount(),
            fetchAccessLogs(),
            logAccess()
        ]);
        setLoading(false);
    };

    // Re-enrich access logs when usersMap changes
    const enrichedAccessLogs = useMemo(() => {
        return accessLogs.map(log => {
            // Try finding user by ID (if app_users.id matches auth.id)
            let user = usersMap.get(log.user_id);
            // If not found, try by email (if log has email)
            if (!user && log.user_email) {
                user = usersEmailMap.get(log.user_email);
            }
            return {
                ...log,
                user
            };
        });
    }, [accessLogs, usersMap, usersEmailMap]);

    const fetchAcceptances = async () => {
        const { data } = await supabase.from('acceptances').select('*').order('timestamp', { ascending: false });
        if (data) {
            setAcceptances(data);
            return data;
        }
        return [];
    };

    const calculateOperationalStats = (tasksData: Task[]) => {
        // Calculate Deliveries for next 7 days
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const deliveries = tasksData.filter(t => {
            if (!t.due_date) return false;
            const date = new Date(t.due_date);
            return date >= today && date <= nextWeek && t.status !== 'done';
        }).length;
        setDeliveriesThisWeek(deliveries);

        // Filter My Priority Tasks (Assuming 'Gestor' sees all high priority, others see assigned)
        // For simplicity in this demo, showing all high priority not done
        setMyPriorityTasks(tasksData.filter(t => t.priority === 'high' && t.status !== 'done'));
    };

    const getProjectProgress = (projectId: number) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        if (projectTasks.length === 0) return 0;
        const done = projectTasks.filter(t => t.status === 'done').length;
        return Math.round((done / projectTasks.length) * 100);
    };

    const getProjectServices = (acceptance: Acceptance) => {
        if (!acceptance.contract_snapshot?.proposal?.services) return ['Consultoria Geral'];
        return acceptance.contract_snapshot.proposal.services.map((s: any) => {
            // Map IDs to readable names if needed, or use existing naming convention
            // Assuming services have a 'name' or we derive from ID
            // If service object structure is { id: 'traffic_management', price: ... }
            const serviceMap: { [key: string]: string } = {
                'traffic_management': 'Tráfego Pago',
                'landing_page': 'Landing Page',
                'social_media': 'Social Media',
                'consulting': 'Consultoria',
                'web_design': 'Website',
                'crm_setup': 'Imp. CRM'
            };
            return serviceMap[s.id] || s.id || 'Serviço';
        });
    };

    const getNextDeadline = (projectId: number) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId && t.status !== 'done' && t.due_date);
        if (projectTasks.length === 0) return null;
        // Sort by date
        const sorted = [...projectTasks].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        return sorted[0].due_date;
    };

    const fetchProposals = async () => {
        const { data } = await supabase.from('proposals').select('*').order('created_at', { ascending: false });
        if (data) setProposals(data);
    };

    const fetchUsersCount = async () => {
        const { count, data } = await supabase.from('app_users').select('*', { count: 'exact' });
        if (count !== null) setTotalUsers(count);

        // Build Avatar Map & Users Map
        if (data) {
            const map: { [email: string]: string } = {};
            const uMap = new Map();
            const eMap = new Map();
            data.forEach((u: any) => {
                if (u.email && u.avatar_url) {
                    map[u.email] = u.avatar_url;
                }
                uMap.set(u.id, u);
                if (u.email) eMap.set(u.email, u);
            });
            setUserAvatars(map);
            setUsersMap(uMap);
            setUsersEmailMap(eMap);
        }
    };



    const fetchNotices = async () => {
        const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(10);
        if (data) setNotices(data);
    };

    const fetchAllTasks = async (loadedAcceptances?: Acceptance[]) => {
        const { data } = await supabase.from('project_tasks').select('*');
        if (data) {
            // Enrich with Project Name
            const projectsMap = new Map(loadedAcceptances?.map(a => [a.id, a.company_name]) || acceptances.map(a => [a.id, a.company_name]));

            const enrichedTasks = data.map((t: any) => ({
                ...t,
                project_name: projectsMap.get(t.project_id) || 'Projeto Desconhecido'
            }));

            setTasks(enrichedTasks);
            setTasks(enrichedTasks);
            setCriticalTasks(enrichedTasks.filter((t: Task) => t.priority === 'high' && t.status !== 'done'));
            calculateOperationalStats(enrichedTasks);
        }
    };

    const fetchUpcomingBookings = async () => {
        try {
            const API_KEY = 'cal_live_dce1007edad18303ba5dedbb992d83e6';
            const response = await fetch(`https://api.cal.com/v2/bookings?status=upcoming&limit=100`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` },
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();
                let bookingsArray: any[] = [];

                if (data.data && Array.isArray(data.data)) {
                    bookingsArray = data.data;
                } else if (data.data && data.data.bookings && Array.isArray(data.data.bookings)) {
                    bookingsArray = data.data.bookings;
                }

                if (bookingsArray.length > 0) {
                    const today = new Date();
                    const nextWeek = new Date();
                    nextWeek.setDate(today.getDate() + 7);

                    const filtered = bookingsArray
                        .map((b: any) => ({
                            id: b.id,
                            title: b.title,
                            description: b.description,
                            startTime: b.startTime,
                            endTime: b.endTime,
                            status: b.status,
                            meetingUrl: b.metadata?.videoCallUrl || b.references?.find((r: any) => r.meetingUrl)?.meetingUrl || b.location
                        }))
                        .filter((b: Booking) => {
                            const date = new Date(b.startTime);
                            return date >= today && date <= nextWeek;
                        })
                        .sort((a: Booking, b: Booking) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

                    setUpcomingBookings(filtered);
                }
            }
        } catch (error) {
            console.error('Error fetching bookings:', error);
        }
    };

    const handleDeleteNotice = async (id: string) => {
        if (userRole !== 'gestor') return; // Security check

        const { error } = await supabase.from('notices').delete().eq('id', id);
        if (!error) {
            setNotices(notices.filter(n => n.id !== id));
        }
    };

    const handleCreateNotice = async (message: string, priority: 'normal' | 'importante' | 'urgente') => {
        if (!email || !fullName) return;

        const { data, error } = await supabase.from('notices').insert([{
            message,
            priority,
            author_name: fullName,
            author_email: email,
            created_at: new Date().toISOString()
        }]).select();

        if (data) {
            setNotices([data[0], ...notices]);
            setShowNoticeModal(false);
        }
    };

    // Interaction Handlers
    const handleOpenCriticalList = () => {
        setTasksToView(criticalTasks);
        setShowCriticalListModal(true);
    };

    const handleOpenTask = (task: Task) => {
        setSelectedTaskForEdit(task);
        setSelectedProjectId(task.project_id);
        setShowTaskModal(true);
    };

    const handleCloseTaskModal = () => {
        setShowTaskModal(false);
        setSelectedTaskForEdit(undefined);
        setSelectedProjectId(null);
        // Refresh tasks to update list if changed
        fetchAllTasks();
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Top Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

                    {/* Active Projects */}
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-brand-coral/50 transition-all flex items-center justify-between">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-slate-500/5 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:bg-slate-500/10"></div>
                        <div className="relative flex items-center gap-4">
                            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                                <Briefcase size={24} />
                            </div>
                            <div>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400 block">Projetos Ativos</span>
                                <div className="text-2xl font-black text-slate-800 dark:text-white leading-none mt-1">
                                    {clientStatusCounts.active} <span className="text-xs font-normal text-slate-400 align-middle ml-1">em andamento</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Deliveries This Week */}
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-brand-coral/50 transition-all flex items-center justify-between">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-slate-500/5 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:bg-slate-500/10"></div>
                        <div className="relative flex items-center gap-4">
                            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl">
                                <Target size={24} />
                            </div>
                            <div>
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400 block">Entregas (7 dias)</span>
                                <div className="text-2xl font-black text-slate-800 dark:text-white leading-none mt-1">
                                    {deliveriesThisWeek} <span className="text-xs font-bold text-amber-600 align-middle ml-1">prazo curto!</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">

                    {/* Left Column: Global Status, Projects, Notices */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* Global Status Bar Chart (Vertical & Monthly) */}
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <BarChart2 className="w-5 h-5 text-brand-coral" />
                                    Volume de Tarefas (Por Mês)
                                </h3>
                                {/* Legend */}
                                <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wider">
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-400"></div><span className="text-slate-500">Backlog</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-600"></div><span className="text-slate-500">Exec.</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="text-slate-500">Aprov.</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-slate-500">Final.</span></div>
                                </div>
                            </div>

                            <div className="h-64 flex items-end gap-2 sm:gap-4 md:gap-8">
                                {(() => {
                                    const months = [];
                                    const today = new Date();
                                    // Generate last 1 month and next 4 months
                                    for (let i = -1; i < 5; i++) {
                                        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
                                        months.push(d);
                                    }

                                    const data = months.map(month => {
                                        const monthKey = month.toISOString().slice(0, 7); // YYYY-MM
                                        const monthTasks = tasks.filter(t => t.due_date && t.due_date.startsWith(monthKey));

                                        return {
                                            monthLabel: month.toLocaleDateString('pt-BR', { month: 'short' }),
                                            backlog: monthTasks.filter(t => t.status === 'backlog').length,
                                            in_progress: monthTasks.filter(t => t.status === 'in_progress').length,
                                            approval: monthTasks.filter(t => t.status === 'approval').length,
                                            done: monthTasks.filter(t => t.status === 'done').length,
                                            total: monthTasks.length
                                        };
                                    });

                                    const maxTotal = Math.max(...data.map(d => d.total), 1); // Avoid div by zero

                                    return data.map((d, index) => (
                                        <div key={index} className="flex-1 flex flex-col items-center group relative">
                                            {/* Tooltip */}
                                            <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs p-2 rounded-lg shadow-lg pointer-events-none whitespace-nowrap z-10">
                                                <div className="font-bold mb-1">{d.monthLabel} - {d.total} Tarefas</div>
                                                <div className="flex gap-2">
                                                    <span className="text-slate-300">B: {d.backlog}</span>
                                                    <span className="text-blue-300">E: {d.in_progress}</span>
                                                    <span className="text-amber-300">A: {d.approval}</span>
                                                    <span className="text-emerald-300">F: {d.done}</span>
                                                </div>
                                            </div>

                                            {/* Bar Stack */}
                                            <div className="w-full max-w-[40px] bg-slate-50 dark:bg-slate-800 rounded-t-xl overflow-hidden relative flex flex-col-reverse" style={{ height: '200px' }}>
                                                {/* Background track handled by container bg */}

                                                {/* Stacked Segments (flex-col-reverse fills from bottom) */}
                                                {d.total > 0 ? (
                                                    <>
                                                        <div style={{ height: `${(d.backlog / maxTotal) * 100}%` }} className="bg-slate-400 w-full transition-all duration-500 hover:bg-slate-500"></div>
                                                        <div style={{ height: `${(d.in_progress / maxTotal) * 100}%` }} className="bg-blue-600 w-full transition-all duration-500 hover:bg-blue-700"></div>
                                                        <div style={{ height: `${(d.approval / maxTotal) * 100}%` }} className="bg-amber-500 w-full transition-all duration-500 hover:bg-amber-600"></div>
                                                        <div style={{ height: `${(d.done / maxTotal) * 100}%` }} className="bg-emerald-500 w-full transition-all duration-500 hover:bg-emerald-600"></div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 absolute bottom-0"></div>
                                                )}
                                            </div>

                                            {/* Label */}
                                            <div className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400 capitalize">
                                                {d.monthLabel}
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-300 dark:text-slate-600">
                                                {d.total}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        {/* Service Progress Tracking */}
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <LayoutDashboard className="w-5 h-5 text-brand-coral" />
                                    Acompanhamento de Serviços
                                </h3>
                                <button onClick={() => navigate('/projects')} className="text-xs text-brand-coral font-bold hover:underline">Ver Todos os Projetos</button>
                            </div>

                            {acceptances.filter(a => a.status === 'Ativo').length === 0 ? (
                                <p className="text-slate-400 text-center py-8">Nenhum projeto ativo com serviços rastreados.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="text-xs font-bold text-slate-500 uppercase border-b border-slate-100 dark:border-slate-800">
                                                <th className="py-3 pl-2">Cliente</th>
                                                <th className="py-3">Serviço</th>
                                                <th className="py-3 w-1/4">Progresso Geral</th>
                                                <th className="py-3">Próximo Prazo</th>
                                                <th className="py-3 text-right pr-2">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {acceptances
                                                .filter(a => a.status === 'Ativo')
                                                .slice(0, 5)
                                                .map((project) => {
                                                    const services = getProjectServices(project);
                                                    const progress = getProjectProgress(project.id);
                                                    const nextDeadline = getNextDeadline(project.id);

                                                    return services.map((service, index) => (
                                                        <tr key={`${project.id}-${index}`} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                            <td className="py-4 pl-2 font-bold text-slate-800 dark:text-white">
                                                                {/* Show project name only on first service or repeat? Let's repeat for clarity but maybe lighter if subsequent? No, repeat is safer for now. */}
                                                                {project.company_name}
                                                            </td>
                                                            <td className="py-4">
                                                                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase rounded-md border border-slate-200 dark:border-slate-700">
                                                                    {service}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 pr-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-brand-coral'}`}
                                                                            style={{ width: `${progress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-slate-500 w-8 text-right">{progress}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-4">
                                                                {nextDeadline ? (
                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                        <Clock size={12} className={new Date(nextDeadline) < new Date() ? 'text-red-500' : 'text-slate-400'} />
                                                                        <span className={new Date(nextDeadline) < new Date() ? 'text-red-500 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                                                                            {new Date(nextDeadline).toLocaleDateString()}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400">-</span>
                                                                )}
                                                            </td>
                                                            <td className="py-4 text-right pr-2">
                                                                <button
                                                                    onClick={() => navigate('/projects')}
                                                                    className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors"
                                                                >
                                                                    <ArrowRight size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ));
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>



                        {/* Notices (Highlights) */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex-1">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Bell className="w-5 h-5 text-brand-coral" />
                                    Avisos da Equipe
                                </h3>
                                {userRole === 'gestor' && (
                                    <button
                                        onClick={() => setShowNoticeModal(true)}
                                        className="p-2 bg-brand-coral text-white rounded-full hover:bg-brand-coral/90 transition-colors shadow-md shadow-brand-coral/20"
                                        title="Novo Aviso"
                                    >
                                        <Plus size={18} />
                                    </button>
                                )}
                            </div>
                            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {notices.length === 0 ? (
                                    <div className="text-center py-10 opacity-50">
                                        <Bell size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                                        <p className="text-slate-400 text-sm">Nenhum aviso importante no momento.</p>
                                    </div>
                                ) : (
                                    notices.map(notice => (
                                        <NoticeCard
                                            key={notice.id}
                                            id={notice.id}
                                            message={notice.message}
                                            authorName={notice.author_name}
                                            authorAvatar={userAvatars[notice.author_email]}
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

                    {/* Right Column: Agenda & Priorities */}
                    <div className="space-y-8">
                        {/* Recent Critical Tasks (Moved Here) */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <ListTodo className="w-5 h-5 text-red-500" />
                                    Prioridades
                                </h3>
                                <button onClick={handleOpenCriticalList} className="text-xs text-brand-coral font-bold hover:underline">Ver Todas</button>
                            </div>

                            {criticalTasks.length === 0 ? (
                                <p className="text-slate-400 text-center py-6 text-sm">Nenhuma tarefa crítica pendente.</p>
                            ) : (
                                <div className="space-y-3">
                                    {criticalTasks.slice(0, 5).map(task => (
                                        <div
                                            key={task.id}
                                            className="flex flex-col gap-2 p-3 bg-red-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl cursor-pointer hover:border-red-200 dark:hover:border-red-900/50 transition-colors group"
                                            onClick={() => handleOpenTask(task)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs line-clamp-2 leading-tight">{task.title}</h4>
                                                <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                <span className="font-semibold text-slate-600 dark:text-slate-400 truncate max-w-[80px]">{task.project_name}</span>
                                                <span>•</span>
                                                <Clock size={10} className={new Date(task.due_date) < new Date() ? 'text-red-500' : ''} />
                                                <span className={new Date(task.due_date) < new Date() ? 'text-red-500 font-bold' : ''}>
                                                    {new Date(task.due_date).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Upcoming Meetings (Next 7 Days) */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-brand-coral" />
                                    Agenda (7 dias)
                                </h3>
                                <button onClick={() => navigate('/agenda')} className="text-xs text-brand-coral font-bold hover:underline">Ver Agenda Completa</button>
                            </div>

                            {upcomingBookings.length === 0 ? (
                                <div className="text-center py-6 text-slate-400">
                                    <p className="text-sm">Nenhuma reunião prevista para esta semana.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {upcomingBookings.slice(0, 5).map(booking => (
                                        <div key={booking.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="flex flex-col items-center justify-center w-10 h-10 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm shrink-0">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                                    {new Date(booking.startTime).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}
                                                </span>
                                                <span className="text-sm font-bold text-brand-coral leading-none">
                                                    {new Date(booking.startTime).getDate()}
                                                </span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-slate-800 dark:text-white text-xs truncate" title={booking.title}>{booking.title}</h4>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                    <Clock size={10} />
                                                    {new Date(booking.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(booking.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            {booking.meetingUrl && (
                                                <a
                                                    href="/meetings"
                                                    className="p-1.5 bg-brand-coral/10 hover:bg-brand-coral text-brand-coral hover:text-white rounded-lg transition-colors"
                                                    title="Ver na Agenda"
                                                >
                                                    <ArrowRight size={14} />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recent Access & Report */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-brand-coral" />
                                    Acessos Recentes
                                </h3>
                                {userRole === 'gestor' && (
                                    <button
                                        onClick={() => setShowAccessReportModal(true)}
                                        className="text-xs flex items-center gap-1 text-slate-500 hover:text-brand-coral transition-colors font-bold"
                                    >
                                        <FileText size={12} /> Relatório
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {enrichedAccessLogs.length === 0 ? (
                                    <p className="text-slate-400 text-center py-4 text-sm">Nenhum acesso registrado.</p>
                                ) : (
                                    enrichedAccessLogs.map(log => {
                                        const timeAgo = (() => {
                                            const diff = new Date().getTime() - new Date(log.accessed_at).getTime();
                                            const mins = Math.floor(diff / 60000);
                                            if (mins < 60) return `${mins}m atrás`;
                                            const hours = Math.floor(mins / 60);
                                            if (hours < 24) return `${hours}h atrás`;
                                            return new Date(log.accessed_at).toLocaleDateString() + ' ' + new Date(log.accessed_at).toLocaleTimeString().slice(0, 5);
                                        })();

                                        return (
                                            <div key={log.id} className="flex items-center gap-3">
                                                <div className="relative">
                                                    {log.user?.avatar_url ? (
                                                        <img src={log.user.avatar_url} alt={log.user.full_name} className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                                                            <Users size={14} className="text-slate-400" />
                                                        </div>
                                                    )}
                                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-baseline">
                                                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate pr-2">
                                                            {log.user?.full_name || log.user_email || 'Usuário'}
                                                        </h4>
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{timeAgo}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions / Navigation */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button
                        onClick={() => navigate('/projects')}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left flex items-center gap-4"
                    >
                        <div className="bg-slate-100 dark:bg-slate-800 w-12 h-12 flex items-center justify-center rounded-2xl text-slate-600 dark:text-slate-400 group-hover:bg-brand-coral group-hover:text-white transition-colors">
                            <Briefcase className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-slate-800 dark:text-white">Projetos</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Gerenciar entregas</span>
                        </div>
                    </button>
                    {/* ... other buttons ... */}
                    <button
                        onClick={() => navigate('/proposals')}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left flex items-center gap-4"
                    >
                        <div className="bg-slate-100 dark:bg-slate-800 w-12 h-12 flex items-center justify-center rounded-2xl text-slate-600 dark:text-slate-400 group-hover:bg-brand-coral group-hover:text-white transition-colors">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-slate-800 dark:text-white">Propostas</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Novo contrato</span>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/users')}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl hover:border-brand-coral dark:hover:border-brand-coral transition-all group shadow-sm hover:shadow-md text-left flex items-center gap-4"
                    >
                        <div className="bg-slate-100 dark:bg-slate-800 w-12 h-12 flex items-center justify-center rounded-2xl text-slate-600 dark:text-slate-400 group-hover:bg-brand-coral group-hover:text-white transition-colors">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-slate-800 dark:text-white">Equipe</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Gerenciar acessos</span>
                        </div>
                    </button>
                </div>

                {/* Critical Tasks List Modal */}
                {showCriticalListModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-2xl max-h-[80vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                            <div className="bg-white dark:bg-slate-900 px-8 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                    <AlertTriangle className="text-red-500" />
                                    Tarefas Críticas
                                </h2>
                                <button
                                    onClick={() => setShowCriticalListModal(false)}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto">
                                {tasksToView.length === 0 ? (
                                    <p className="text-center text-slate-400">Nenhuma tarefa crítica encontrada.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {tasksToView.map(task => (
                                            <div key={task.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex justify-between items-center group">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-lg">{task.title}</h4>
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-slate-500 mt-1">
                                                        <span className="font-bold text-brand-coral">{task.project_name}</span>
                                                        <span className="hidden sm:inline">•</span>
                                                        <div className="flex items-center gap-1">
                                                            <Clock size={14} />
                                                            Prazo: {new Date(task.due_date).toLocaleDateString()}
                                                        </div>
                                                        <span className="hidden sm:inline">•</span>
                                                        <div className="flex items-center gap-1">
                                                            <Users size={14} />
                                                            {task.assignee || 'Sem responsável'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleOpenTask(task)}
                                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-brand-coral hover:text-white text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap"
                                                >
                                                    Visualizar <ExternalLink size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Task Modal */}
                {selectedProjectId && (
                    <TaskModal
                        isOpen={showTaskModal}
                        onClose={handleCloseTaskModal}
                        projectId={selectedProjectId}
                        task={selectedTaskForEdit}
                        projectName={selectedTaskForEdit?.project_name}
                        onSave={handleCloseTaskModal} // Refresh list on save
                    />
                )}

                {/* Create Notice Modal */}
                <NoticeModal
                    isOpen={showNoticeModal}
                    onClose={() => setShowNoticeModal(false)}
                    onSave={handleCreateNotice}
                    authorName={fullName}
                    authorAvatar={avatarUrl}
                />

                {/* Monthly Access Report Modal */}
                {showAccessReportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                            <div className="bg-white dark:bg-slate-900 px-8 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                        <FileText className="text-brand-coral" />
                                        Relatório Mensal de Acesso
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">Desempenho da equipe neste mês</p>
                                </div>
                                <button
                                    onClick={() => setShowAccessReportModal(false)}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="p-8 overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 tracking-wider">
                                            <th className="pb-4 pl-2 font-bold">Colaborador</th>
                                            <th className="pb-4 text-center font-bold">Acessos (Mês)</th>
                                            <th className="pb-4 text-center font-bold">Tarefas Atribuídas</th>
                                            <th className="pb-4 text-center font-bold text-emerald-500">Concluídas</th>
                                            <th className="pb-4 text-center font-bold text-red-500">Atrasadas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm font-medium">
                                        {(() => {
                                            // Calculate Stats
                                            const currentMonth = new Date().toISOString().slice(0, 7);
                                            const stats = Array.from(usersMap.values()).map(user => {
                                                const userLogs = accessLogs.filter(l => {
                                                    const isSameMonth = l.accessed_at.startsWith(currentMonth);
                                                    const matchesId = l.user_id === user.id;
                                                    const matchesEmail = l.user_email && user.email && l.user_email === user.email;
                                                    return isSameMonth && (matchesId || matchesEmail);
                                                }).length;
                                                // Note: Tasks normally don't have assignee_id linked clearly in this demo interface (it was assignee name string). 
                                                // We will match by Name fuzzy or assume we can't fully link without ID.
                                                // For this demo, we will try to match by name if user.full_name is in task.assignee
                                                const userTasks = tasks.filter(t => t.assignee && t.assignee.includes(user.full_name || '')); // Fuzzy match

                                                const totalTasks = userTasks.length;
                                                const completed = userTasks.filter(t => t.status === 'done').length;
                                                const overdue = userTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;

                                                // If no logs and no tasks, skip? No, show all users.
                                                return { user, userLogs, totalTasks, completed, overdue };
                                            }).sort((a, b) => b.userLogs - a.userLogs); // Sort by visibility

                                            return stats.map(({ user, userLogs, totalTasks, completed, overdue }) => (
                                                <tr key={user.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="py-4 pl-2">
                                                        <div className="flex items-center gap-3">
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt={user.full_name} className="w-10 h-10 rounded-full object-cover" />
                                                            ) : (
                                                                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold">
                                                                    {user.full_name?.charAt(0) || '?'}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <div className="font-bold text-slate-800 dark:text-white">{user.full_name}</div>
                                                                <div className="text-xs text-slate-400">{user.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-center text-slate-600 dark:text-slate-300">
                                                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full font-bold">
                                                            {userLogs}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 text-center text-slate-600 dark:text-slate-300">{totalTasks}</td>
                                                    <td className="py-4 text-center font-bold text-emerald-500">{completed}</td>
                                                    <td className="py-4 text-center font-bold text-red-500">{overdue}</td>
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
};

export default Dashboard;
