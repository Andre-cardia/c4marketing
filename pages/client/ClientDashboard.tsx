import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';
import { LogOut, LayoutDashboard, BarChart3, PieChart, AlertCircle, FileText, CheckCircle2, Clock, ArrowLeft, Eye, Menu, X, Wallet, TrendingUp, Calendar, ChevronDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const ClientDashboard: React.FC = () => {
    const { acceptanceId } = useParams<{ acceptanceId?: string }>();
    const { email, fullName, userRole } = useUserRole();
    const navigate = useNavigate();
    const [project, setProject] = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
    const [timeUntilUpdate, setTimeUntilUpdate] = useState('24h');

    const toggleCampaign = (campaignId: string) => {
        setExpandedCampaigns(prev => ({
            ...prev,
            [campaignId]: !prev[campaignId]
        }));
    };

    useEffect(() => {
        if (!project?.created_at) return;

        const updateClock = () => {
            const now = new Date();
            const createdAt = new Date(project.created_at);
            // Calculate next update time (assuming 24h cycles from creation)
            const cycleMs = 24 * 60 * 60 * 1000;
            const timeSinceCreation = now.getTime() - createdAt.getTime();
            const msIntoCycle = timeSinceCreation % cycleMs;
            const msUntilNextUpdate = cycleMs - msIntoCycle;

            const hours = Math.floor(msUntilNextUpdate / (1000 * 60 * 60));
            const minutes = Math.floor((msUntilNextUpdate % (1000 * 60 * 60)) / (1000 * 60));

            setTimeUntilUpdate(`${hours}h ${minutes}m`);
        };

        const timer = setInterval(updateClock, 60000); // Update every minute
        updateClock(); // Initial call

        return () => clearInterval(timer);
    }, [project?.created_at]);

    // Preview mode: gestor viewing a specific project as if they were the client
    const isPreviewMode = !!acceptanceId && (userRole === 'gestor' || userRole === 'admin');

    useEffect(() => {
        if (isPreviewMode) {
            fetchByAcceptanceId(Number(acceptanceId));
        } else if (email) {
            fetchClientProject();
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

            // Get traffic project
            const { data: projectData, error: projErr } = await supabase
                .from('traffic_projects')
                .select('*')
                .eq('acceptance_id', accId)
                .limit(1)
                .single();

            if (projErr || !projectData) {
                console.error('No traffic project found:', projErr);
                setLoading(false);
                return;
            }

            setProject({ ...projectData, acceptance });

            // Get campaigns
            const { data: campaignsData } = await supabase
                .from('traffic_campaigns')
                .select(`*, timeline:traffic_campaign_timeline (*)`)
                .eq('traffic_project_id', projectData.id)
                .order('created_at', { ascending: false });

            if (campaignsData) setCampaigns(campaignsData);
        } catch (error) {
            console.error('Error in fetchByAcceptanceId:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchClientProject = async () => {
        try {
            setLoading(true);

            const { data: acceptance, error: accErr } = await supabase
                .from('acceptances')
                .select('id, name, email, company_name, timestamp')
                .eq('email', email)
                .limit(1)
                .single();

            if (accErr || !acceptance) {
                console.error('No acceptance found for email:', email, accErr);
                setLoading(false);
                return;
            }

            const { data: projectData, error: projErr } = await supabase
                .from('traffic_projects')
                .select('*')
                .eq('acceptance_id', acceptance.id)
                .limit(1)
                .single();

            if (projErr || !projectData) {
                console.error('No traffic project found:', projErr);
                setLoading(false);
                return;
            }

            setProject({ ...projectData, acceptance });

            const { data: campaignsData } = await supabase
                .from('traffic_campaigns')
                .select(`*, timeline:traffic_campaign_timeline (*)`)
                .eq('traffic_project_id', projectData.id)
                .order('created_at', { ascending: false });

            if (campaignsData) setCampaigns(campaignsData);
        } catch (error) {
            console.error('Error in fetchClientProject:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    if (loading) {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 animate-pulse">Carregando escritório virtual...</div>;
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
                <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800">
                    <AlertCircle className="w-10 h-10 text-amber-500" />
                </div>
                <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Projeto não localizado</h1>
                <p className="text-slate-400 text-center max-w-md mb-8 leading-relaxed">
                    {isPreviewMode
                        ? 'Este projeto ainda não possui dados de tráfego configurados para visualização.'
                        : <>Não encontramos um projeto ativo vinculado ao email <span className="text-white font-medium">{email}</span>.</>
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

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans flex relative overflow-hidden">
            {/* Preview Banner */}
            {isPreviewMode && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 px-4 shadow-lg flex items-center justify-between text-xs md:text-sm font-medium">
                    <div className="flex items-center gap-2">
                        <Eye size={16} className="animate-pulse" />
                        <span className="truncate">Visualizando como: <strong>{project.acceptance?.name}</strong></span>
                    </div>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex-shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors border border-white/10"
                    >
                        <ArrowLeft size={14} />
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
                            {(isPreviewMode ? project.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-bold truncate text-white">{isPreviewMode ? project.acceptance?.name : (fullName || 'Cliente')}</p>
                            <p className="text-[10px] text-slate-500 truncate">{isPreviewMode ? project.acceptance?.email : email}</p>
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
                            {(isPreviewMode ? project.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </span>
                    </div>
                </div>

                <div className="p-6 md:p-10 max-w-7xl mx-auto">

                    {/* Header Section */}
                    <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-800/50">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                                    {activeTab === 'overview' && (project.acceptance?.company_name || project.acceptance?.name || 'Seu Projeto')}
                                    {activeTab === 'reports' && 'Relatórios de Performance'}
                                    {activeTab === 'finance' && 'Painel Financeiro'}
                                </h1>
                            </div>
                            <p className="text-slate-400 flex items-center gap-2 text-sm md:text-base">
                                <span className={`w-2.5 h-2.5 rounded-full ${activeTab === 'overview' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></span>
                                {activeTab === 'overview' ? `Projeto Ativo desde ${new Date(project.created_at).toLocaleDateString('pt-BR')}` : 'Dados atualizados em tempo real'}
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
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <CheckCircle2 size={80} className="text-green-500 transform translate-x-4 -translate-y-4" />
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Status do Projeto</p>
                                        <div className="text-2xl font-bold text-white flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                                                <CheckCircle2 className="text-green-500 w-4 h-4" />
                                            </div>
                                            Em Execução
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                                        <TrendingUp size={12} className="text-green-500" />
                                        <span>Tudo operando normalmente</span>
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <PieChart size={80} className="text-brand-coral transform translate-x-4 -translate-y-4" />
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Campanhas Ativas</p>
                                        <div className="text-2xl font-bold text-white flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-brand-coral/10 flex items-center justify-center">
                                                <PieChart className="text-brand-coral w-4 h-4" />
                                            </div>
                                            {campaigns.filter(c => c.status === 'active').length}
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                                        <TrendingUp size={12} className="text-brand-coral" />
                                        <span>Estratégias em andamento</span>
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Calendar size={80} className="text-blue-500 transform translate-x-4 -translate-y-4" />
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Próxima Reunião</p>
                                        <div className="text-xl font-bold text-white flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                                <Calendar className="text-blue-500 w-4 h-4" />
                                            </div>
                                            <span className="truncate">A definir</span>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                                        <Clock size={12} className="text-blue-500" />
                                        <span>Agendamento pendente</span>
                                    </div>
                                </div>
                            </div>

                            {/* Campaigns List */}
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <div className="p-2 bg-brand-coral/10 rounded-lg">
                                        <LayoutDashboard className="text-brand-coral w-6 h-6" />
                                    </div>
                                    Minhas Campanhas
                                </h2>
                            </div>

                            <div className="space-y-6">
                                {campaigns.length === 0 ? (
                                    <div className="p-12 border border-dashed border-slate-800 rounded-3xl text-center bg-slate-900/30">
                                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <LayoutDashboard className="text-slate-600" size={32} />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">Nenhuma campanha encontrada</h3>
                                        <p className="text-slate-500">Aguarde enquanto nossa equipe configura seus primeiros projetos.</p>
                                    </div>
                                ) : (
                                    campaigns.map((campaign) => {
                                        // Standard phases definition
                                        const STANDARD_PHASES = [
                                            { id: 'planning', title: 'Planejamento' },
                                            { id: 'creatives', title: 'Criativos' },
                                            { id: 'execution', title: 'Execução' },
                                            { id: 'analysis', title: 'Análise e Otimização' },
                                            { id: 'finalization', title: 'Finalização' }
                                        ];

                                        // Determine active phase based on DB timeline or default to Planning
                                        let activePhaseIndex = 0;

                                        if (campaign.timeline && Array.isArray(campaign.timeline) && campaign.timeline.length > 0) {
                                            const normalize = (s: any) => (typeof s === 'string' ? s : '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                                            campaign.timeline.forEach((dbStep: any) => {
                                                if (!dbStep || !dbStep.title) return;

                                                const matchIndex = STANDARD_PHASES.findIndex(p => normalize(p.title) === normalize(dbStep.title));
                                                if (matchIndex !== -1) {
                                                    if (dbStep.status === 'completed' && matchIndex >= activePhaseIndex) {
                                                        activePhaseIndex = Math.min(matchIndex + 1, STANDARD_PHASES.length - 1);
                                                    } else if (dbStep.status === 'in_progress' && matchIndex >= activePhaseIndex) {
                                                        activePhaseIndex = matchIndex;
                                                    }
                                                }
                                            });
                                        }

                                        const activePhase = STANDARD_PHASES[activePhaseIndex] || STANDARD_PHASES[0];

                                        // Determine Campaign Status Label
                                        let statusLabel = 'NÃO VEICULADO';
                                        let statusColorClass = 'bg-slate-800 text-slate-400 border-slate-700';
                                        let statusDotClass = 'bg-slate-500';

                                        if (activePhase.title === 'Execução') {
                                            statusLabel = 'EM VEICULAÇÃO';
                                            statusColorClass = 'bg-green-500/10 text-green-400 border-green-500/20';
                                            statusDotClass = 'bg-green-500 animate-pulse';
                                        } else if (activePhase.title === 'Análise e Otimização') {
                                            statusLabel = 'EM REVISÃO';
                                            statusColorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                                            statusDotClass = 'bg-blue-400 animate-pulse';
                                        }

                                        const isExpanded = expandedCampaigns[campaign.id];

                                        return (
                                            <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors">
                                                <div
                                                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                                                    onClick={() => toggleCampaign(campaign.id)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
                                                            <BarChart3 className="text-brand-coral w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-lg text-white tracking-tight">{campaign.name}</h3>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-slate-800 rounded border border-slate-700">{campaign.platform}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 self-start md:self-auto">
                                                        <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold border uppercase tracking-widest flex items-center gap-2 ${statusColorClass}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`}></span>
                                                            {statusLabel}
                                                        </div>
                                                        <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </div>

                                                {/* Expanded Content */}
                                                <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                                    <div className="overflow-hidden">
                                                        <div className="p-6 pt-0 border-t border-slate-800/50">
                                                            <h4 className="text-xs font-bold text-slate-500 mb-6 mt-6 uppercase tracking-widest flex items-center gap-2">
                                                                <Clock size={14} />
                                                                Linha do Tempo
                                                            </h4>
                                                            <div className="space-y-0 relative pl-2">
                                                                {/* Vertical Line */}
                                                                <div className="absolute left-[27px] top-2 bottom-4 w-px bg-slate-800"></div>

                                                                {STANDARD_PHASES.map((phase, index) => {
                                                                    let stepStatus = 'pending';
                                                                    if (index < activePhaseIndex) stepStatus = 'completed';
                                                                    else if (index === activePhaseIndex) stepStatus = 'in_progress';

                                                                    return (
                                                                        <div key={phase.id} className="relative flex gap-5 pb-6 last:pb-0 group">
                                                                            <div className="relative z-10 flex-shrink-0">
                                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${stepStatus === 'completed'
                                                                                    ? 'bg-slate-900 border-brand-coral'
                                                                                    : stepStatus === 'in_progress'
                                                                                        ? 'bg-slate-900 border-brand-coral'
                                                                                        : 'bg-slate-900 border-slate-800'
                                                                                    }`}>
                                                                                    {stepStatus === 'completed' && <CheckCircle2 size={14} className="text-brand-coral" />}
                                                                                    {stepStatus === 'in_progress' && <div className="w-2.5 h-2.5 bg-brand-coral rounded-full animate-pulse" />}
                                                                                    {stepStatus === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />}
                                                                                </div>
                                                                            </div>
                                                                            <div className="pt-1 flex-grow flex items-center justify-between">
                                                                                <p className={`text-sm font-semibold transition-colors ${stepStatus === 'completed' ? 'text-white' :
                                                                                    stepStatus === 'in_progress' ? 'text-white' :
                                                                                        'text-slate-600'
                                                                                    }`}>
                                                                                    {phase.title}
                                                                                </p>

                                                                                {stepStatus === 'in_progress' && (
                                                                                    <span className="text-[10px] font-bold text-brand-coral uppercase tracking-wider">
                                                                                        EM ANDAMENTO
                                                                                    </span>
                                                                                )}
                                                                                {stepStatus === 'completed' && (
                                                                                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                                                                        CONCLUÍDO
                                                                                    </span>
                                                                                )}
                                                                                {stepStatus === 'pending' && (
                                                                                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                                                                        AGUARDANDO
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
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
