import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';
import { useTheme } from '../../lib/ThemeContext';
import { LogOut, LayoutDashboard, BarChart3, Wallet, AlertCircle, Eye, Menu, X, Clock, Sun, Moon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { TrafficProjectView } from './components/TrafficProjectView';
import { LandingPageProjectView } from './components/LandingPageProjectView';
import { WebsiteProjectView } from './components/WebsiteProjectView';

const LOGO_URL = '/logo-c4-prancheta-7.png';

interface ProjectSummary {
    id: string;
    type: 'traffic' | 'landing_page' | 'website';
    acceptance: any;
    data: any;
    subItems: any[];
}

const ClientDashboard: React.FC = () => {
    const { acceptanceId } = useParams<{ acceptanceId?: string }>();
    const { email, fullName, userRole } = useUserRole();
    const { darkMode, setDarkMode } = useTheme();
    const navigate = useNavigate();

    const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [timeUntilUpdate, setTimeUntilUpdate] = useState('24h');

    const isPreviewMode = !!acceptanceId && (userRole === 'gestor' || userRole === 'admin');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const cycleMs = 24 * 60 * 60 * 1000;
            const msIntoCycle = now.getTime() % cycleMs;
            const msUntilNextUpdate = cycleMs - msIntoCycle;
            const hours = Math.floor(msUntilNextUpdate / (1000 * 60 * 60));
            const minutes = Math.floor((msUntilNextUpdate % (1000 * 60 * 60)) / (1000 * 60));
            setTimeUntilUpdate(`${hours}h ${minutes}m`);
        };
        const timer = setInterval(updateClock, 60000);
        updateClock();
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (isPreviewMode) {
            fetchByAcceptanceId(Number(acceptanceId));
        } else if (email) {
            fetchClientProjects();
        }
    }, [email, acceptanceId]);

    const fetchByAcceptanceId = async (accId: number) => {
        try {
            setLoading(true);
            const { data: acceptance, error: accErr } = await supabase
                .from('acceptances')
                .select('id, name, email, company_name, timestamp')
                .eq('id', accId)
                .single();
            if (accErr || !acceptance) { setLoading(false); return; }
            await fetchProjectsForAcceptance(acceptance);
        } catch (error) {
            console.error('Error in fetchByAcceptanceId:', error);
            setLoading(false);
        }
    };

    const fetchClientProjects = async () => {
        try {
            setLoading(true);
            const { data: acceptances, error: accErr } = await supabase
                .from('acceptances')
                .select('id, name, email, company_name, timestamp')
                .eq('email', email);
            if (accErr || !acceptances || acceptances.length === 0) { setLoading(false); return; }
            const results: ProjectSummary[] = [];
            for (const acc of acceptances) {
                const projs = await getProjectsForAcceptanceSingle(acc);
                results.push(...projs);
            }
            setAllProjects(results);
            setLoading(false);
        } catch (error) {
            console.error('Error in fetchClientProjects:', error);
            setLoading(false);
        }
    };

    const getProjectsForAcceptanceSingle = async (acceptance: any): Promise<ProjectSummary[]> => {
        const foundProjects: ProjectSummary[] = [];

        const { data: trafficProject } = await supabase
            .from('traffic_projects').select('*').eq('acceptance_id', acceptance.id).single();
        if (trafficProject) {
            const { data: campaigns } = await supabase
                .from('traffic_campaigns')
                .select(`*, timeline:traffic_campaign_timeline (*)`)
                .eq('traffic_project_id', trafficProject.id)
                .order('created_at', { ascending: false });
            foundProjects.push({ id: trafficProject.id, type: 'traffic', acceptance, data: trafficProject, subItems: campaigns || [] });
        }

        const { data: lpProject } = await supabase
            .from('landing_page_projects').select('*').eq('acceptance_id', acceptance.id).single();
        if (lpProject) {
            const { data: pages } = await supabase
                .from('landing_pages').select('*').eq('landing_page_project_id', lpProject.id).order('created_at', { ascending: false });
            foundProjects.push({ id: lpProject.id, type: 'landing_page', acceptance, data: lpProject, subItems: pages || [] });
        }

        const { data: webProject } = await supabase
            .from('website_projects').select('*').eq('acceptance_id', acceptance.id).single();
        if (webProject) {
            const { data: sites } = await supabase
                .from('websites').select('*').eq('website_project_id', webProject.id).order('created_at', { ascending: false });
            foundProjects.push({ id: webProject.id, type: 'website', acceptance, data: webProject, subItems: sites || [] });
        }

        return foundProjects;
    };

    const fetchProjectsForAcceptance = async (acceptance: any) => {
        const projects = await getProjectsForAcceptanceSingle(acceptance);
        setAllProjects(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            return [...prev, ...projects.filter(p => !existingIds.has(p.id))];
        });
        setLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-50 dark:bg-black flex items-center justify-center text-neutral-500 animate-pulse transition-colors duration-300">
                Carregando escritório virtual...
            </div>
        );
    }

    if (allProjects.length === 0) {
        return (
            <div className="min-h-screen bg-neutral-50 dark:bg-black flex flex-col items-center justify-center text-neutral-900 dark:text-white p-6 transition-colors duration-300">
                <div className="w-20 h-20 bg-white dark:bg-neutral-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-neutral-200 dark:border-neutral-800">
                    <AlertCircle className="w-10 h-10 text-brand-coral" />
                </div>
                <h1 className="text-3xl font-extrabold mb-3 text-neutral-900 dark:text-white font-montserrat">Projeto não localizado</h1>
                <p className="text-neutral-500 dark:text-neutral-400 text-center max-w-md mb-8 leading-relaxed">
                    {isPreviewMode
                        ? 'Este ID de aceitação não possui projetos vinculados (Tráfego, LP ou Site).'
                        : <>Não encontramos nenhum projeto ativo vinculado ao email <span className="font-bold text-neutral-900 dark:text-white">{email}</span>.</>
                    }
                </p>
                <button
                    onClick={() => isPreviewMode ? navigate(-1) : handleLogout()}
                    className="px-8 py-3 bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800 rounded-xl transition-all border border-neutral-200 dark:border-neutral-700 font-medium shadow-lg hover:-translate-y-0.5 text-neutral-700 dark:text-white"
                >
                    {isPreviewMode ? 'Voltar para Propostas' : 'Encerrar Sessão'}
                </button>
            </div>
        );
    }

    const firstProject = allProjects[0];
    const clientName = firstProject.acceptance?.company_name || firstProject.acceptance?.name || 'Cliente';

    const navInactive = 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white border border-transparent';
    const navActive = 'bg-brand-coral/10 text-brand-coral border border-brand-coral/20';

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-black text-neutral-900 dark:text-white font-sans flex relative overflow-hidden transition-colors duration-300">

            {/* Preview Banner */}
            {isPreviewMode && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-neutral-900 dark:bg-neutral-950 border-b border-neutral-800 text-white py-2 px-4 flex items-center justify-between text-xs md:text-sm font-medium">
                    <div className="flex items-center gap-2">
                        <Eye size={16} className="animate-pulse text-brand-coral" />
                        <span className="truncate">Visualizando como: <strong>{firstProject.acceptance?.name}</strong></span>
                    </div>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex-shrink-0 flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-colors border border-white/10"
                    >
                        <X size={14} />
                        <span className="hidden sm:inline">Voltar</span>
                    </button>
                </div>
            )}

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm transition-opacity duration-300"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <aside className={`
                fixed md:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800
                transform transition-all duration-300 ease-in-out md:translate-x-0 flex flex-col shadow-2xl md:shadow-none
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                ${isPreviewMode ? 'pt-10 md:pt-0' : ''}
            `}>
                <div className="p-6 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800">
                    <div className="w-full flex justify-center md:justify-start">
                        <img src={LOGO_URL} alt="C4 Marketing" className="h-20 w-auto object-contain brightness-0 dark:invert" />
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                    <button
                        onClick={() => { setActiveTab('overview'); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-c4 transition-all group ${activeTab === 'overview' ? navActive : navInactive}`}
                    >
                        <LayoutDashboard size={20} />
                        <span className="font-semibold text-sm font-montserrat">Visão Geral</span>
                    </button>

                    <button
                        onClick={() => { setActiveTab('reports'); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-c4 transition-all group ${activeTab === 'reports' ? navActive : navInactive}`}
                    >
                        <BarChart3 size={20} />
                        <span className="font-semibold text-sm font-montserrat">Relatórios</span>
                    </button>

                    <button
                        onClick={() => { setActiveTab('finance'); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-c4 transition-all group ${activeTab === 'finance' ? navActive : navInactive}`}
                    >
                        <Wallet size={20} />
                        <span className="font-semibold text-sm font-montserrat">Financeiro</span>
                    </button>
                </nav>

                <div className="px-3 pb-2">
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-c4 ${navInactive} transition-all`}
                    >
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        <span className="font-semibold text-sm font-montserrat">{darkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
                    </button>
                </div>

                <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-c4 border border-neutral-200 dark:border-neutral-700/50">
                        <div className="w-10 h-10 rounded-full bg-brand-coral/10 text-brand-coral flex items-center justify-center text-sm font-bold border border-brand-coral/20">
                            {(isPreviewMode ? firstProject.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate text-neutral-900 dark:text-white">
                                {isPreviewMode ? firstProject.acceptance?.name : (fullName || 'Cliente')}
                            </p>
                            <p className="text-neutral-500 text-xs truncate">
                                {isPreviewMode ? firstProject.acceptance?.email : email}
                            </p>
                        </div>
                    </div>
                    {!isPreviewMode && (
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-c4 transition-all border border-transparent hover:border-red-200 dark:hover:border-red-500/20"
                        >
                            <LogOut size={14} />
                            Encerrar Sessão
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`flex-1 overflow-y-auto bg-neutral-50 dark:bg-black relative w-full ${isPreviewMode ? 'pt-10 md:pt-0' : ''} transition-colors duration-300`}>

                {/* Mobile Header */}
                <div className="md:hidden sticky top-0 z-30 bg-neutral-50/90 dark:bg-black/90 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 bg-white dark:bg-neutral-800 rounded-c4 text-brand-coral border border-neutral-200 dark:border-neutral-700 active:scale-95 transition-transform shadow-sm"
                        >
                            <Menu size={24} />
                        </button>
                        <img src={LOGO_URL} alt="C4 Marketing" className="h-8 w-auto object-contain brightness-0 dark:invert" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-brand-coral">
                            {(isPreviewMode ? firstProject.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </span>
                    </div>
                </div>

                <div className="p-6 md:p-10 max-w-7xl mx-auto">

                    {/* Header Section */}
                    <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-neutral-200 dark:border-neutral-800">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-black text-neutral-900 dark:text-white tracking-tight font-montserrat mb-2">
                                {activeTab === 'overview' && clientName}
                                {activeTab === 'reports' && 'Relatórios de Performance'}
                                {activeTab === 'finance' && 'Painel Financeiro'}
                            </h1>
                            <p className="text-neutral-500 dark:text-neutral-400 flex items-center gap-2 text-sm md:text-base">
                                <span className={`w-2.5 h-2.5 rounded-full ${activeTab === 'overview' ? 'bg-brand-coral animate-pulse' : 'bg-neutral-400 dark:bg-neutral-600'}`}></span>
                                {activeTab === 'overview' ? 'Projeto Ativo' : 'Dados atualizados em tempo real'}
                            </p>
                        </div>
                        {activeTab === 'overview' && (
                            <div className="hidden md:flex items-center gap-2">
                                <button
                                    onClick={() => setDarkMode(!darkMode)}
                                    className="p-2 bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-brand-coral dark:hover:text-brand-coral transition-colors shadow-sm"
                                    title={darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
                                >
                                    {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                                </button>
                                <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-900 rounded-c4 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400 shadow-sm">
                                    <Clock size={14} className="text-brand-coral" />
                                    <span>Atualiza em: {timeUntilUpdate}</span>
                                </div>
                            </div>
                        )}
                    </header>

                    {/* Content Switcher */}
                    {activeTab === 'overview' && (
                        <div className="space-y-8">
                            {allProjects.map(project => (
                                <div key={project.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                    {project.type === 'traffic' && <TrafficProjectView project={project.data} campaigns={project.subItems} />}
                                    {project.type === 'landing_page' && <LandingPageProjectView project={project.data} pages={project.subItems} />}
                                    {project.type === 'website' && <WebsiteProjectView project={project.data} websites={project.subItems} />}
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[400px] flex flex-col items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-3xl bg-white/50 dark:bg-neutral-900/50 p-12 text-center">
                            <div className="w-24 h-24 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-6 shadow-xl border border-neutral-200 dark:border-neutral-700">
                                <BarChart3 className="text-brand-coral/50" size={48} />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2 font-montserrat">Relatórios em Construção</h2>
                            <p className="text-neutral-500 dark:text-neutral-400 max-w-md mx-auto mb-8">
                                Estamos processando os dados das suas campanhas para gerar insights valiosos. Em breve você terá acesso a métricas detalhadas aqui.
                            </p>
                            <button onClick={() => setActiveTab('overview')} className="text-brand-coral font-bold hover:text-neutral-900 dark:hover:text-white hover:underline transition-colors">
                                Voltar para Visão Geral
                            </button>
                        </div>
                    )}

                    {activeTab === 'finance' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[400px] flex flex-col items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-3xl bg-white/50 dark:bg-neutral-900/50 p-12 text-center">
                            <div className="w-24 h-24 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-6 shadow-xl border border-neutral-200 dark:border-neutral-700">
                                <Wallet className="text-brand-coral/50" size={48} />
                            </div>
                            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2 font-montserrat">Painel Financeiro</h2>
                            <p className="text-neutral-500 dark:text-neutral-400 max-w-md mx-auto mb-8">
                                O histórico de faturas e pagamentos estará disponível nesta seção em breve.
                            </p>
                            <button onClick={() => setActiveTab('overview')} className="text-brand-coral font-bold hover:text-neutral-900 dark:hover:text-white hover:underline transition-colors">
                                Voltar para Visão Geral
                            </button>
                        </div>
                    )}

                    <footer className="mt-20 border-t border-neutral-200 dark:border-neutral-800 pt-8 text-center text-neutral-500 text-sm">
                        <p>© {new Date().getFullYear()} C4 Marketing. Todos os direitos reservados.</p>
                        <p className="mt-2 text-xs">Precisa de ajuda? Entre em contato com seu gerente de conta.</p>
                    </footer>
                </div>
            </main>
        </div>
    );
};

export default ClientDashboard;
