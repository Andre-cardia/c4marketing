import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';
import { LogOut, LayoutDashboard, BarChart3, Wallet, AlertCircle, Eye, Menu, X, Clock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { TrafficProjectView } from './components/TrafficProjectView';
import { LandingPageProjectView } from './components/LandingPageProjectView';
import { WebsiteProjectView } from './components/WebsiteProjectView';

interface ProjectSummary {
    id: string; // Project ID
    type: 'traffic' | 'landing_page' | 'website';
    acceptance: any;
    data: any; // The project record itself
    subItems: any[]; // Campaigns or Pages
}

const ClientDashboard: React.FC = () => {
    const { acceptanceId } = useParams<{ acceptanceId?: string }>();
    const { email, fullName, userRole } = useUserRole();
    const navigate = useNavigate();

    // State
    const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [timeUntilUpdate, setTimeUntilUpdate] = useState('24h');

    // Preview mode: gestor viewing a specific project as if they were the client
    const isPreviewMode = !!acceptanceId && (userRole === 'gestor' || userRole === 'admin');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            // Just a dummy clock effect
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

            // Get acceptance info
            const { data: acceptance, error: accErr } = await supabase
                .from('acceptances')
                .select('id, name, email, company_name, timestamp')
                .eq('id', accId)
                .single();

            if (accErr || !acceptance) {
                console.error('No acceptance found for ID:', accId, accErr);
                setLoading(false);
                return;
            }

            await fetchProjectsForAcceptance(acceptance);

        } catch (error) {
            console.error('Error in fetchByAcceptanceId:', error);
            setLoading(false);
        }
    };

    const fetchClientProjects = async () => {
        try {
            setLoading(true);

            // Get ALL acceptances for this email
            const { data: acceptances, error: accErr } = await supabase
                .from('acceptances')
                .select('id, name, email, company_name, timestamp')
                .eq('email', email);

            if (accErr || !acceptances || acceptances.length === 0) {
                console.error('No acceptances found for email:', email, accErr);
                setLoading(false);
                return;
            }

            // Fetch projects for all acceptances
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

    // Helper to fetch projects for a single acceptance
    const getProjectsForAcceptanceSingle = async (acceptance: any): Promise<ProjectSummary[]> => {
        const foundProjects: ProjectSummary[] = [];

        // 1. Traffic
        const { data: trafficProject } = await supabase
            .from('traffic_projects')
            .select('*')
            .eq('acceptance_id', acceptance.id)
            .single();

        if (trafficProject) {
            const { data: campaigns } = await supabase
                .from('traffic_campaigns')
                .select(`*, timeline:traffic_campaign_timeline (*)`)
                .eq('traffic_project_id', trafficProject.id)
                .order('created_at', { ascending: false });

            foundProjects.push({
                id: trafficProject.id,
                type: 'traffic',
                acceptance,
                data: trafficProject,
                subItems: campaigns || []
            });
        }

        // 2. Landing Page
        const { data: lpProject } = await supabase
            .from('landing_page_projects')
            .select('*')
            .eq('acceptance_id', acceptance.id)
            .single();

        if (lpProject) {
            const { data: pages } = await supabase
                .from('landing_pages')
                .select('*')
                .eq('landing_page_project_id', lpProject.id)
                .order('created_at', { ascending: false });

            foundProjects.push({
                id: lpProject.id,
                type: 'landing_page',
                acceptance,
                data: lpProject,
                subItems: pages || []
            });
        }

        // 3. Website
        const { data: webProject } = await supabase
            .from('website_projects')
            .select('*')
            .eq('acceptance_id', acceptance.id)
            .single();

        if (webProject) {
            const { data: sites } = await supabase
                .from('websites')
                .select('*')
                .eq('website_project_id', webProject.id)
                .order('created_at', { ascending: false });

            foundProjects.push({
                id: webProject.id,
                type: 'website',
                acceptance,
                data: webProject,
                subItems: sites || []
            });
        }

        return foundProjects;
    };

    const fetchProjectsForAcceptance = async (acceptance: any) => {
        const projects = await getProjectsForAcceptanceSingle(acceptance);
        setAllProjects(prev => {
            // Avoid duplicates
            const existingIds = new Set(prev.map(p => p.id));
            const newProjects = projects.filter(p => !existingIds.has(p.id));
            return [...prev, ...newProjects];
        });
        setLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    if (loading) {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 animate-pulse">Carregando escritório virtual...</div>;
    }

    if (allProjects.length === 0) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
                <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800">
                    <AlertCircle className="w-10 h-10 text-amber-500" />
                </div>
                <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Projeto não localizado</h1>
                <p className="text-slate-400 text-center max-w-md mb-8 leading-relaxed">
                    {isPreviewMode
                        ? 'Este ID de aceitação não possui projetos vinculados (Tráfego, LP ou Site).'
                        : <>Não encontramos nenhum projeto ativo vinculado ao email <span className="text-white font-medium">{email}</span>.</>
                    }
                </p>
                <button
                    onClick={() => isPreviewMode ? navigate(-1) : handleLogout()}
                    className="px-8 py-3 bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 rounded-xl transition-all border border-slate-600 font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                    {isPreviewMode ? 'Voltar para Propostas' : 'Encerrar Sessão'}
                </button>
            </div>
        );
    }

    // Use the first project's acceptance for the header name if available, or generic
    const firstProject = allProjects[0];
    const clientName = firstProject.acceptance?.company_name || firstProject.acceptance?.name || 'Cliente';

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans flex relative overflow-hidden">
            {/* Preview Banner */}
            {isPreviewMode && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 px-4 shadow-lg flex items-center justify-between text-xs md:text-sm font-medium">
                    <div className="flex items-center gap-2">
                        <Eye size={16} className="animate-pulse" />
                        <span className="truncate">Visualizando como: <strong>{firstProject.acceptance?.name}</strong></span>
                    </div>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex-shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors border border-white/10"
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
                fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 
                transform transition-transform duration-300 ease-in-out md:translate-x-0 flex flex-col shadow-2xl md:shadow-none
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                ${isPreviewMode ? 'pt-16 md:pt-0' : ''}
            `}>
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                            <div className="w-8 h-8 bg-brand-coral rounded-lg flex items-center justify-center text-slate-900">C4</div>
                            Marketing
                        </h2>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
                    <button
                        onClick={() => { setActiveTab('overview'); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all group ${activeTab === 'overview'
                            ? 'bg-slate-800 text-brand-coral border border-slate-700'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                            }`}
                    >
                        <LayoutDashboard size={18} className={`transition-transform duration-300 ${activeTab === 'overview' ? '' : 'group-hover:scale-105'}`} />
                        <span className="font-semibold text-sm">Visão Geral</span>
                    </button>

                    <button
                        onClick={() => { setActiveTab('reports'); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all group ${activeTab === 'reports'
                            ? 'bg-slate-800 text-brand-coral border border-slate-700'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                            }`}
                    >
                        <BarChart3 size={18} className={`transition-transform duration-300 ${activeTab === 'reports' ? '' : 'group-hover:scale-105'}`} />
                        <span className="font-semibold text-sm">Relatórios</span>
                    </button>

                    <button
                        onClick={() => { setActiveTab('finance'); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all group ${activeTab === 'finance'
                            ? 'bg-slate-800 text-brand-coral border border-slate-700'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                            }`}
                    >
                        <Wallet size={18} className={`transition-transform duration-300 ${activeTab === 'finance' ? '' : 'group-hover:scale-105'}`} />
                        <span className="font-semibold text-sm">Financeiro</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-slate-800 bg-slate-900">
                    <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-slate-800 rounded-lg border border-slate-700">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white border border-slate-600">
                            {(isPreviewMode ? firstProject.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-bold truncate text-white">{isPreviewMode ? firstProject.acceptance?.name : (fullName || 'Cliente')}</p>
                            <p className="text-slate-500 text-[10px] truncate">{isPreviewMode ? firstProject.acceptance?.email : email}</p>
                        </div>
                    </div>
                    {!isPreviewMode && (
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-500/20"
                        >
                            <LogOut size={14} />
                            Encerrar Sessão
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`flex-1 overflow-y-auto bg-slate-950 relative w-full ${isPreviewMode ? 'pt-14 md:pt-0' : ''}`}>

                {/* Mobile Header */}
                <div className="md:hidden sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 bg-slate-900 rounded-lg text-brand-coral border border-slate-800 active:scale-95 transition-transform"
                        >
                            <Menu size={24} />
                        </button>
                        <span className="font-bold text-lg tracking-tight">C4 Marketing</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <span className="text-xs font-bold text-brand-coral">
                            {(isPreviewMode ? firstProject.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </span>
                    </div>
                </div>

                <div className="p-6 md:p-10 max-w-7xl mx-auto">

                    {/* Header Section */}
                    <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-800/50">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                                    {activeTab === 'overview' && clientName}
                                    {activeTab === 'reports' && 'Relatórios de Performance'}
                                    {activeTab === 'finance' && 'Painel Financeiro'}
                                </h1>
                            </div>
                            <p className="text-slate-400 flex items-center gap-2 text-sm md:text-base">
                                <span className={`w-2.5 h-2.5 rounded-full ${activeTab === 'overview' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></span>
                                {activeTab === 'overview' ? `Projeto Ativo` : 'Dados atualizados em tempo real'}
                            </p>
                        </div>
                        {activeTab === 'overview' && (
                            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800 text-xs text-slate-400">
                                <Clock size={14} className="text-brand-coral" />
                                <span>Próxima atualização: {timeUntilUpdate}</span>
                            </div>
                        )}
                    </header>

                    {/* Content Switcher */}
                    {activeTab === 'overview' && (
                        <div className="space-y-12">
                            {allProjects.map(project => (
                                <div key={project.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                    {project.type === 'traffic' && (
                                        <TrafficProjectView project={project.data} campaigns={project.subItems} />
                                    )}
                                    {project.type === 'landing_page' && (
                                        <LandingPageProjectView project={project.data} pages={project.subItems} />
                                    )}
                                    {project.type === 'website' && (
                                        <WebsiteProjectView project={project.data} websites={project.subItems} />
                                    )}

                                    {/* Horizontal Divider between projects if there are multiple */}
                                    {allProjects.length > 1 && allProjects[allProjects.length - 1].id !== project.id && (
                                        <div className="h-px bg-slate-800/50 my-12" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[400px] flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30 p-12 text-center">
                            <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 shadow-xl border border-slate-700/50">
                                <BarChart3 className="text-brand-coral/50" size={48} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Relatórios em Construção</h2>
                            <p className="text-slate-400 max-w-md mx-auto mb-8">
                                Estamos processando os dados das suas campanhas para gerar insights valiosos. Em breve você terá acesso a métricas detalhadas aqui.
                            </p>
                            <button onClick={() => setActiveTab('overview')} className="text-brand-coral font-bold hover:text-red-400 hover:underline">
                                Voltar para Visão Geral
                            </button>
                        </div>
                    )}

                    {activeTab === 'finance' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[400px] flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30 p-12 text-center">
                            <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 shadow-xl border border-slate-700/50">
                                <Wallet className="text-blue-500/50" size={48} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Painel Financeiro</h2>
                            <p className="text-slate-400 max-w-md mx-auto mb-8">
                                O histórico de faturas e pagamentos estará disponível nesta seção em breve.
                            </p>
                            <button onClick={() => setActiveTab('overview')} className="text-brand-coral font-bold hover:text-red-400 hover:underline">
                                Voltar para Visão Geral
                            </button>
                        </div>
                    )}

                    <footer className="mt-20 border-t border-slate-800 pt-8 text-center text-slate-600 text-sm">
                        <p>© {new Date().getFullYear()} C4 Marketing. Todos os direitos reservados.</p>
                        <p className="mt-2 text-xs">Precisa de ajuda? Entre em contato com seu gerente de conta.</p>
                    </footer>
                </div>
            </main>
        </div>
    );
};

export default ClientDashboard;
