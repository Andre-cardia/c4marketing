import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { ArrowLeft, BarChart, Send, CheckCircle, Settings, Users, Plus, Play, FileText, Layers, TrendingUp, Flag, Trash2, Calendar, ChevronDown, ChevronUp, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SurveyAnswersModal from './traffic/SurveyAnswersModal';
import AccessAnswersModal from './traffic/AccessAnswersModal';
import TaskModal from '../../components/projects/TaskModal';

const STEP_CONFIG = {
    planning: { label: 'Planejamento', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
    creatives: { label: 'Criativos', icon: Layers, color: 'text-purple-500', bg: 'bg-purple-50' },
    execution: { label: 'Execução', icon: Play, color: 'text-green-500', bg: 'bg-green-50' },
    optimization: { label: 'Análise e Otimização', icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-50' },
    finalization: { label: 'Finalização', icon: Flag, color: 'text-red-500', bg: 'bg-red-50' }
};

const PLANNING_CHECKLIST_ITEMS = [
    "Seleção de Palavras Chaves",
    "Definição de Títulos",
    "Definição de Descrições",
    "Ajuste de Logos e Imagens",
    "Criação de Site Links",
    "Extensões de Anúncio",
    "Orçamento"
];

const META_ADS_PLANNING_CHECKLIST_ITEMS = [
    "Análise geral da conta",
    "Verificar possibilidade de importação de compradores anteriores",
    "Definir regiões",
    "Definição de público/persona",
    "Definição de copy",
    "Criativo do anúncio",
    "Destino do anúncio"
];

const CREATIVES_CHECKLIST_ITEMS = [
    "Criativos Estáticos",
    "Criativos Animados (Video/Motion)",
    "Logo"
];

const EXECUTION_CHECKLIST_ITEMS = [
    "Configuração das Campanhas",
    "Aprovação pela Plataforma de Anúncios"
];

const OPTIMIZATION_CHECKLIST_ITEMS = [
    "Análise de Campanhas",
    "Otimização de Campanhas"
];

interface TrafficProject {
    id: string;
    acceptance_id: string;
    survey_status: 'pending' | 'completed';
    account_setup_status: 'pending' | 'completed';
    strategy_meeting_notes: string | null;
    survey_data?: any;
    access_data?: any;
}

interface Campaign {
    id: string;
    name: string;
    platform: 'google_ads' | 'meta_ads' | 'linkedin_ads' | 'tiktok_ads';
    status: 'active' | 'paused' | 'ended';
    created_at?: string;
}

interface TimelineStep {
    id: string;
    campaign_id: string;
    step_key: 'planning' | 'creatives' | 'execution' | 'optimization' | 'finalization';
    status: 'pending' | 'in_progress' | 'completed';
    start_date: string | null;
    end_date: string | null;
    responsible_id: string | null;
    observations: string | null;
    checklist_data?: Record<string, boolean>;
    order_index: number;
}

interface AppUser {
    id: string;
    full_name: string | null;
    email?: string;
    role?: string;
}

const TrafficManagement: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [companyName, setCompanyName] = useState<string>('');
    const [trafficProject, setTrafficProject] = useState<TrafficProject | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCampaignModal, setShowCampaignModal] = useState(false);
    const [showSurveyModal, setShowSurveyModal] = useState(false);
    const [showAccessModal, setShowAccessModal] = useState(false);
    const [newCampaignPlatform, setNewCampaignPlatform] = useState<Campaign['platform']>('google_ads');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Timeline State
    const [timelineSteps, setTimelineSteps] = useState<Record<string, TimelineStep[]>>({});
    const [expandedStep, setExpandedStep] = useState<string | null>(null); // Format: "campaignId-stepKey"
    const [appUsers, setAppUsers] = useState<AppUser[]>([]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [taskContext, setTaskContext] = useState<{ campaignName: string, stepLabel: string } | null>(null);

    // Shared Fetch Function
    const loadProjectData = async () => {
        if (!id) return;
        try {
            // 0. Get Users (Filtered by role: gestor or operacional)
            const { data: userData } = await supabase
                .from('app_users')
                .select('id, full_name, email, role');

            console.log('User Data Raw:', userData); // Debug

            if (userData) {
                const filteredUsers = userData.filter(u => u.role === 'gestor' || u.role === 'operacional');
                console.log('Filtered Users:', filteredUsers); // Debug
                setAppUsers(filteredUsers);

                if (filteredUsers.length === 0 && userData.length > 0) {
                    console.warn('No users matching role filter! Showing all for fallback.');
                    // Optional: setAppUsers(userData); // Uncomment if we want to fallback
                }
            }

            // 1. Get Company Name
            const { data: acceptance } = await supabase
                .from('acceptances')
                .select('company_name')
                .eq('id', id)
                .single();

            if (acceptance) setCompanyName(acceptance.company_name);

            // 2. Get Traffic Project
            const { data: tpData } = await supabase
                .from('traffic_projects')
                .select('*')
                .eq('acceptance_id', id)
                .single();

            if (tpData) {
                setTrafficProject(tpData);
                // 3. Fetch Campaigns
                const { data: campData } = await supabase
                    .from('traffic_campaigns')
                    .select('*')
                    .eq('traffic_project_id', tpData.id)
                    .order('created_at', { ascending: false });

                if (campData) {
                    setCampaigns(campData);

                    // 4. Fetch Timeline Steps
                    const campaignIds = campData.map(c => c.id);
                    if (campaignIds.length > 0) {
                        const { data: steps } = await supabase
                            .from('traffic_campaign_timeline')
                            .select('*')
                            .in('campaign_id', campaignIds)
                            .order('order_index', { ascending: true });

                        if (steps) {
                            const stepsMap: Record<string, TimelineStep[]> = {};
                            steps.forEach(step => {
                                if (!stepsMap[step.campaign_id]) stepsMap[step.campaign_id] = [];
                                stepsMap[step.campaign_id].push(step as any);
                            });
                            setTimelineSteps(stepsMap);
                        }
                    }
                }

            } else {
                // Create default project if not exists
                const { data: newTp } = await supabase
                    .from('traffic_projects')
                    .insert([{ acceptance_id: id }])
                    .select()
                    .single();

                if (newTp) setTrafficProject(newTp);
            }

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Initial Load
    useEffect(() => {
        loadProjectData();
    }, [id]);

    // Handler to refresh data when opening modal
    const handleOpenSurveyModal = async () => {
        await loadProjectData(); // Refresh data first
        setShowSurveyModal(true);
    };

    const handleOpenAccessModal = async () => {
        await loadProjectData();
        setShowAccessModal(true);
    };

    // Handlers
    const handleUpdateStatus = async (field: 'survey_status' | 'account_setup_status', status: 'pending' | 'completed') => {
        if (!trafficProject) return;

        const { error } = await supabase
            .from('traffic_projects')
            .update({ [field]: status })
            .eq('id', trafficProject.id);

        if (!error) {
            setTrafficProject(prev => prev ? { ...prev, [field]: status } : null);
            if (field === 'survey_status') setShowSurveyModal(false);
            if (field === 'account_setup_status') setShowAccessModal(false);
        }
    };

    const handleDeleteCampaign = async (campaignId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;

        const { error } = await supabase
            .from('traffic_campaigns')
            .delete()
            .eq('id', campaignId);

        if (!error) {
            setCampaigns(prev => prev.filter(c => c.id !== campaignId));
            const newSteps = { ...timelineSteps };
            delete newSteps[campaignId];
            setTimelineSteps(newSteps);
        }
    };

    const handleCreateCampaign = async () => {
        if (!trafficProject || isCreating) return;
        if (!newCampaignName.trim()) {
            alert('Por favor, informe o nome da campanha.');
            return;
        }

        setIsCreating(true);
        const { data: campaignData, error: campaignError } = await supabase
            .from('traffic_campaigns')
            .insert([{
                traffic_project_id: trafficProject.id,
                platform: newCampaignPlatform,
                name: newCampaignName
            }])
            .select()
            .single();

        if (campaignData) {
            setCampaigns([campaignData, ...campaigns]);
            setShowCampaignModal(false);
            setNewCampaignName('');
            // Wait for DB trigger to finish and refresh state
            setTimeout(() => {
                loadProjectData();
                setIsCreating(false);
            }, 1000);
        } else {
            setIsCreating(false);
            if (campaignError) alert(`Erro ao criar campanha: ${campaignError.message}`);
        }
    };

    const formatPlatform = (p: string) => {
        switch (p) {
            case 'google_ads': return 'Google Ads';
            case 'meta_ads': return 'Meta Ads';
            case 'linkedin_ads': return 'LinkedIn Ads';
            case 'tiktok_ads': return 'TikTok Ads';
            default: return p;
        }
    };

    const handleUpdateTimelineStep = async (stepId: string, updates: Partial<TimelineStep>) => {
        // Fix: Convert empty string to null for UUID fields
        if ('responsible_id' in updates && updates.responsible_id === '') {
            updates.responsible_id = null;
        }

        const { error } = await supabase
            .from('traffic_campaign_timeline')
            .update(updates)
            .eq('id', stepId);

        if (error) {
            console.error('Error updating timeline step:', error);
            alert(`Erro ao atualizar: ${error.message}`);
            return;
        }

        if (!error) {
            setTimelineSteps(prev => {
                const newSteps = { ...prev };
                for (const campaignId in newSteps) {
                    newSteps[campaignId] = newSteps[campaignId].map(step =>
                        step.id === stepId ? { ...step, ...updates } : step
                    );
                }
                return newSteps;
            });
        }
    };

    const handleToggleChecklist = async (stepId: string, item: string, currentData: Record<string, boolean> = {}) => {
        const newData = { ...currentData, [item]: !currentData[item] };
        await handleUpdateTimelineStep(stepId, { checklist_data: newData });
    };

    const handleCompleteStep = async (step: TimelineStep, campaignId: string) => {
        const now = new Date().toISOString();

        // 1. Complete current step
        await handleUpdateTimelineStep(step.id, {
            status: 'completed',
            end_date: now
        });

        // 2. Activate next step
        const nextStep = timelineSteps[campaignId]?.find(s => s.order_index === step.order_index + 1);
        if (nextStep) {
            await handleUpdateTimelineStep(nextStep.id, {
                status: 'in_progress',
                start_date: now
            });
        }

        // 3. If Finalization, complete campaign
        if (step.step_key === 'finalization') {
            const { error } = await supabase
                .from('traffic_campaigns')
                .update({ status: 'ended' })
                .eq('id', campaignId);

            if (!error) {
                setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'ended' } : c));
            }
        }
    };

    const handleUndoStep = async (step: TimelineStep, campaignId: string) => {
        // 1. Revert current step
        await handleUpdateTimelineStep(step.id, {
            status: 'in_progress',
            end_date: null
        });

        // 2. Reset next step if it was auto-started (only if in_progress)
        const nextStep = timelineSteps[campaignId]?.find(s => s.order_index === step.order_index + 1);
        if (nextStep && nextStep.status === 'in_progress') {
            await handleUpdateTimelineStep(nextStep.id, {
                status: 'pending',
                start_date: null
            });
        }

        // 3. If it was finalized, reopen campaign
        if (step.step_key === 'finalization') {
            const { error } = await supabase
                .from('traffic_campaigns')
                .update({ status: 'active' })
                .eq('id', campaignId);

            if (!error) {
                setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'active' } : c));
            }
        }
    };

    const handleInitializeTimeline = async (campaignId: string) => {
        // Prevent manual initialization if stages already exist for this campaign
        if (timelineSteps[campaignId] && timelineSteps[campaignId].length > 0) {
            return;
        }

        const steps = [
            { campaign_id: campaignId, step_key: 'planning', order_index: 0, status: 'in_progress', start_date: new Date().toISOString() },
            { campaign_id: campaignId, step_key: 'creatives', order_index: 1, status: 'pending' },
            { campaign_id: campaignId, step_key: 'execution', order_index: 2, status: 'pending' },
            { campaign_id: campaignId, step_key: 'optimization', order_index: 3, status: 'pending' },
            { campaign_id: campaignId, step_key: 'finalization', order_index: 4, status: 'pending' },
        ];

        const { data, error } = await supabase.from('traffic_campaign_timeline').insert(steps).select();

        if (data) {
            setTimelineSteps(prev => ({
                ...prev,
                [campaignId]: data as any
            }));
        }
    };

    const getPlatformColor = (p: string) => {
        switch (p) {
            case 'google_ads': return 'border-blue-500 text-blue-700 bg-blue-50';
            case 'meta_ads': return 'border-indigo-500 text-indigo-700 bg-indigo-50';
            case 'linkedin_ads': return 'border-sky-600 text-sky-800 bg-sky-50';
            case 'tiktok_ads': return 'border-pink-500 text-pink-700 bg-pink-50';
            default: return 'border-slate-500 text-slate-700 bg-slate-50';
        }
    };

    const isOnboardingComplete = trafficProject?.survey_status === 'completed' && trafficProject?.account_setup_status === 'completed';

    // Renders
    if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">Carregando...</div>;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            <Header />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                        <button
                            onClick={() => navigate('/projects')}
                            className="flex items-center gap-2 text-slate-500 hover:text-brand-coral mb-4 transition-colors group"
                        >
                            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                            Voltar para Projetos
                        </button>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <BarChart className="w-8 h-8 text-blue-500" />
                            Gestão de Tráfego
                        </h1>
                        <p className="text-xl text-slate-600 dark:text-slate-400 mt-2 font-medium">
                            {companyName}
                        </p>
                    </div>
                </div>

                {/* Onboarding Section - Corporate Look */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    {/* 1. Survey - Dark Corporate Style */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="flex flex-col h-full justify-between relative z-10">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-slate-800 rounded-lg">
                                        <Send className="w-6 h-6 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Pesquisa Inicial</h3>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/external/traffic-survey/${trafficProject?.id}`;
                                        navigator.clipboard.writeText(url);
                                        alert('Link copiado para a área de transferência!');
                                    }}
                                    className="w-full py-2.5 px-4 bg-transparent border border-brand-coral text-brand-coral hover:bg-brand-coral/10 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
                                >
                                    <Send size={16} />
                                    Enviar Pesquisa
                                </button>

                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">STATUS</span>
                                        {trafficProject?.survey_status === 'completed' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-emerald-400 bg-emerald-400/10 text-xs font-bold border border-emerald-400/20">
                                                <CheckCircle size={12} /> Validado
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-amber-400 bg-amber-400/10 text-xs font-bold border border-amber-400/20">
                                                Pendente
                                            </span>
                                        )}
                                    </div>

                                    {trafficProject?.survey_data ? (
                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={handleOpenSurveyModal}
                                                className="w-full py-2 text-xs font-medium text-slate-300 hover:text-white bg-transparent border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
                                            >
                                                Ver Respostas Recebidas
                                            </button>

                                            {trafficProject.survey_status !== 'completed' ? (
                                                <button
                                                    onClick={() => handleUpdateStatus('survey_status', 'completed')}
                                                    className="w-full py-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                >
                                                    Validar Formulário
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleUpdateStatus('survey_status', 'pending')}
                                                    className="flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:text-slate-400 transition-colors mt-1"
                                                >
                                                    <ArrowLeft size={10} /> Desvalidar Formulário
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-center text-slate-600 py-2">
                                            Aguardando envio...
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Account Setup - Dark Corporate Style */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="flex flex-col h-full justify-between relative z-10">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-slate-800 rounded-lg">
                                        <Settings className="w-6 h-6 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Configuração</h3>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/external/traffic-access/${trafficProject?.id}`;
                                        navigator.clipboard.writeText(url);
                                        alert('Link copiado para a área de transferência!');
                                    }}
                                    className="w-full py-2.5 px-4 bg-transparent border border-brand-coral text-brand-coral hover:bg-brand-coral/10 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
                                >
                                    <Settings size={16} />
                                    Enviar Formulário
                                </button>

                                <div className="pt-4 border-t border-slate-800">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">STATUS</span>
                                        {trafficProject?.account_setup_status === 'completed' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-emerald-400 bg-emerald-400/10 text-xs font-bold border border-emerald-400/20">
                                                <CheckCircle size={12} /> Contas Vinculadas
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-amber-400 bg-amber-400/10 text-xs font-bold border border-amber-400/20">
                                                Pendente
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={handleOpenAccessModal}
                                            className="w-full py-2 text-xs font-medium text-slate-300 hover:text-white bg-transparent border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
                                        >
                                            Ver Respostas Recebidas
                                        </button>

                                        {trafficProject?.account_setup_status !== 'completed' ? (
                                            <button
                                                onClick={() => handleUpdateStatus('account_setup_status', 'completed')}
                                                className="w-full py-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                            >
                                                Validar Configuração
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleUpdateStatus('account_setup_status', 'pending')}
                                                className="flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:text-slate-400 transition-colors mt-1"
                                            >
                                                <ArrowLeft size={10} /> Desvalidar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Strategy Meeting - Dark Corporate Style */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group flex flex-col">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-slate-800 rounded-lg">
                                    <Users className="w-6 h-6 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Reunião Estratégica</h3>
                            </div>
                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                                Registre os objetivos, KPIs e público-alvo para as campanhas. Defina a rota estratégica.
                            </p>
                        </div>

                        <div>
                            <button
                                onClick={() => navigate(`/projects/${id}/traffic/strategy`)}
                                className="w-full py-3 px-4 bg-transparent border border-brand-coral text-brand-coral hover:bg-brand-coral/10 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
                            >
                                Acessar Pauta <ArrowLeft className="rotate-180 w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* 4. New Campaign - Dashed Outline Style */}
                    <div className="flex items-center justify-center h-full">
                        <button
                            onClick={() => setShowCampaignModal(true)}
                            disabled={!isOnboardingComplete}
                            className={`w-full h-full min-h-[280px] rounded-2xl border border-dashed flex flex-col items-center justify-center gap-4 transition-all group
                            ${isOnboardingComplete
                                    ? 'border-slate-700 hover:border-brand-coral/50 bg-slate-900/50 hover:bg-slate-900 cursor-pointer'
                                    : 'border-slate-800 bg-slate-900/20 opacity-50 cursor-not-allowed'}`}
                        >
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isOnboardingComplete ? 'bg-slate-800 text-slate-400 group-hover:bg-brand-coral group-hover:text-white' : 'bg-slate-800 text-slate-600'}`}>
                                <Plus size={24} />
                            </div>
                            <span className={`text-xs font-bold tracking-widest uppercase ${isOnboardingComplete ? 'text-slate-400 group-hover:text-white' : 'text-slate-600'}`}>
                                Nova Campanha
                            </span>
                        </button>
                    </div>
                </div>

                {/* Campaigns List */}
                <div className="space-y-8">
                    <div className="flex items-center gap-3 mb-6 border-l-4 border-brand-coral pl-4">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Campanhas Ativas</h2>
                    </div>

                    {campaigns.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
                            <p className="text-slate-500 mb-4">Nenhuma campanha criada ainda.</p>
                            <button
                                onClick={() => setShowCampaignModal(true)}
                                className="text-brand-coral font-bold hover:underline"
                            >
                                Criar primeira campanha
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {campaigns.map(campaign => (
                                <div key={campaign.id} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                                    {/* Campaign Header - Dark & Clean */}
                                    <div className="px-8 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                                        <div className="flex items-center gap-4">
                                            <span className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest border bg-transparent ${campaign.platform === 'google_ads' ? 'border-blue-500/30 text-blue-400' :
                                                campaign.platform === 'meta_ads' ? 'border-indigo-500/30 text-indigo-400' :
                                                    campaign.platform === 'linkedin_ads' ? 'border-sky-500/30 text-sky-400' :
                                                        'border-pink-500/30 text-pink-400'
                                                }`}>
                                                {formatPlatform(campaign.platform)}
                                            </span>
                                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                                {campaign.name}
                                                {campaign.status === 'ended' && (
                                                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded border border-emerald-500/20 flex items-center gap-1 uppercase tracking-wider">
                                                        <CheckCircle size={10} /> Finalizada
                                                    </span>
                                                )}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs font-mono text-slate-500">CRIADO EM: {new Date(campaign.created_at || new Date()).toLocaleDateString()}</span>
                                            <button
                                                onClick={() => handleDeleteCampaign(campaign.id)}
                                                className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Excluir Campanha"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="p-8 bg-slate-900">
                                        {!timelineSteps[campaign.id] || timelineSteps[campaign.id].length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-12 bg-slate-800/30 border border-dashed border-slate-700 rounded-xl">
                                                <p className="text-slate-400 mb-6 text-center text-sm">Esta campanha não possui etapas definidas.</p>
                                                <button
                                                    onClick={() => handleInitializeTimeline(campaign.id)}
                                                    className="px-6 py-3 bg-brand-coral text-white rounded-xl font-bold text-sm hover:bg-brand-coral/90 shadow-lg shadow-brand-coral/20 transition-all transform hover:-translate-y-0.5"
                                                >
                                                    Iniciar Timeline
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-4">
                                                {timelineSteps[campaign.id]
                                                    .sort((a, b) => a.order_index - b.order_index)
                                                    .map((step) => {
                                                        const config = STEP_CONFIG[step.step_key] || { label: step.step_key, icon: FileText, color: 'text-slate-500', bg: 'bg-slate-50' };
                                                        const isExpanded = expandedStep === `${campaign.id}-${step.step_key}`;
                                                        const isActive = step.status === 'in_progress';
                                                        const isCompleted = step.status === 'completed';

                                                        // Determine which checklist to use
                                                        const currentPlanningChecklist = campaign.platform === 'meta_ads'
                                                            ? META_ADS_PLANNING_CHECKLIST_ITEMS
                                                            : PLANNING_CHECKLIST_ITEMS;

                                                        // Progress Bar Calculation for Planning
                                                        const completedCount = currentPlanningChecklist.filter(i => step.checklist_data?.[i]).length;
                                                        const totalCount = currentPlanningChecklist.length;
                                                        const progress = Math.round((completedCount / totalCount) * 100);

                                                        // Progress Bar Calculation for Creatives
                                                        const creativesCompletedCount = CREATIVES_CHECKLIST_ITEMS.filter(i => step.checklist_data?.[i]).length;
                                                        const creativesTotalCount = CREATIVES_CHECKLIST_ITEMS.length;
                                                        const creativesProgress = Math.round((creativesCompletedCount / creativesTotalCount) * 100);

                                                        // Progress Bar Calculation for Execution
                                                        const executionCompletedCount = EXECUTION_CHECKLIST_ITEMS.filter(i => step.checklist_data?.[i]).length;
                                                        const executionTotalCount = EXECUTION_CHECKLIST_ITEMS.length;
                                                        const executionProgress = Math.round((executionCompletedCount / executionTotalCount) * 100);

                                                        // Progress Bar Calculation for Optimization
                                                        const optimizationCompletedCount = OPTIMIZATION_CHECKLIST_ITEMS.filter(i => step.checklist_data?.[i]).length;
                                                        const optimizationTotalCount = OPTIMIZATION_CHECKLIST_ITEMS.length;
                                                        const optimizationProgress = Math.round((optimizationCompletedCount / optimizationTotalCount) * 100);

                                                        return (
                                                            <div
                                                                key={step.id}
                                                                className={`rounded-xl transition-all duration-300 overflow-hidden border
                                                                ${isActive
                                                                        ? 'border-brand-coral/30 bg-slate-800/80 shadow-lg shadow-black/20'
                                                                        : isCompleted
                                                                            ? 'border-emerald-500/20 bg-emerald-500/5'
                                                                            : 'border-slate-800 bg-slate-900/50 opacity-60 hover:opacity-100 hover:bg-slate-800/50'}`}
                                                            >
                                                                {/* Step Header */}
                                                                <div
                                                                    onClick={() => setExpandedStep(isExpanded ? null : `${campaign.id}-${step.step_key}`)}
                                                                    className="px-6 py-5 flex items-center justify-between cursor-pointer select-none group"
                                                                >
                                                                    <div className="flex items-center gap-5">
                                                                        {/* Icon Box */}
                                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                                                                            ${isActive ? 'bg-brand-coral text-white shadow-lg shadow-brand-coral/30' :
                                                                                isCompleted ? 'bg-emerald-500/20 text-emerald-400' :
                                                                                    'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'}`}>
                                                                            {isCompleted ? <CheckCircle size={20} /> : <config.icon size={20} />}
                                                                        </div>

                                                                        <div>
                                                                            <h4 className={`text-sm font-bold uppercase tracking-wider ${isActive ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                                                {config.label}
                                                                            </h4>

                                                                            <div className="flex items-center gap-3 mt-1.5">
                                                                                {isActive && (
                                                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-coral/10 text-brand-coral border border-brand-coral/20">
                                                                                        Em Andamento
                                                                                    </span>
                                                                                )}
                                                                                {isCompleted && (
                                                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                                        Concluído
                                                                                    </span>
                                                                                )}
                                                                                {!isActive && !isCompleted && (
                                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                                                        Pendente
                                                                                    </span>
                                                                                )}

                                                                                {step.end_date && (isActive || isCompleted) && (
                                                                                    <span className="text-[10px] font-medium text-slate-500">
                                                                                        PREVISÃO: {new Date(step.end_date).toLocaleDateString()}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-4">
                                                                        {/* Mini Progress Bar in Header (optional, only if expanded is false maybe?) */}
                                                                        {step.step_key === 'planning' && (isActive || isCompleted) && !isExpanded && (
                                                                            <div className="flex flex-col items-end gap-1 mr-4">
                                                                                <span className="text-[10px] font-bold text-slate-400">{progress}%</span>
                                                                                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                                    <div
                                                                                        className="h-full bg-brand-coral transition-all duration-500"
                                                                                        style={{ width: `${progress}%` }}
                                                                                    ></div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {step.step_key === 'creatives' && (isActive || isCompleted) && !isExpanded && (
                                                                            <div className="flex flex-col items-end gap-1 mr-4">
                                                                                <span className="text-[10px] font-bold text-slate-400">{creativesProgress}%</span>
                                                                                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                                    <div
                                                                                        className="h-full bg-brand-coral transition-all duration-500"
                                                                                        style={{ width: `${creativesProgress}%` }}
                                                                                    ></div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {step.step_key === 'execution' && (isActive || isCompleted) && !isExpanded && (
                                                                            <div className="flex flex-col items-end gap-1 mr-4">
                                                                                <span className="text-[10px] font-bold text-slate-400">{executionProgress}%</span>
                                                                                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                                    <div
                                                                                        className="h-full bg-brand-coral transition-all duration-500"
                                                                                        style={{ width: `${executionProgress}%` }}
                                                                                    ></div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {step.step_key === 'optimization' && (isActive || isCompleted) && !isExpanded && (
                                                                            <div className="flex flex-col items-end gap-1 mr-4">
                                                                                <span className="text-[10px] font-bold text-slate-400">{optimizationProgress}%</span>
                                                                                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                                    <div
                                                                                        className="h-full bg-brand-coral transition-all duration-500"
                                                                                        style={{ width: `${optimizationProgress}%` }}
                                                                                    ></div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                            <ChevronDown className="text-slate-500 w-5 h-5" />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Step Body */}
                                                                {isExpanded && (
                                                                    <div className="px-6 pb-8 pt-2 border-t border-slate-800/50 bg-slate-900/50 animate-in slide-in-from-top-2 p-6">
                                                                        {/* Top Row: Dates & Responsible */}
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                                                            <div className="grid grid-cols-2 gap-4">
                                                                                <div>
                                                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Início</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={step.start_date ? step.start_date.split('T')[0] : ''}
                                                                                        disabled={!isActive}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { start_date: e.target.value })}
                                                                                        className="w-full text-sm py-2.5 px-3 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral focus:border-brand-coral outline-none transition-colors"
                                                                                    />
                                                                                </div>
                                                                                {/* Removed End Date Input from prominent view as per 'Previsão' concept, but keeping it in state */}
                                                                                <div>
                                                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Fim Previsto</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={step.end_date ? step.end_date.split('T')[0] : ''}
                                                                                        disabled={!isActive}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { end_date: e.target.value })}
                                                                                        className="w-full text-sm py-2.5 px-3 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral focus:border-brand-coral outline-none transition-colors"
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            <div>
                                                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Responsável</label>
                                                                                <div className="relative">
                                                                                    <select
                                                                                        value={step.responsible_id || ''}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { responsible_id: e.target.value })}
                                                                                        disabled={!isActive && !isCompleted}
                                                                                        className="w-full text-sm py-2.5 pl-10 pr-4 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral focus:border-brand-coral outline-none appearance-none transition-colors cursor-pointer"
                                                                                    >
                                                                                        <option value="">Selecione...</option>
                                                                                        {appUsers.map(u => (
                                                                                            <option key={u.id} value={u.id}>{u.full_name || u.email || 'Usuário Sem Nome'}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <User className="absolute left-3 top-3 text-slate-500 w-4 h-4 pointer-events-none" />
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Planning Specific Layout */}
                                                                        {step.step_key === 'planning' ? (
                                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                                                {/* Left Column: Checklist */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <div className="flex items-center justify-between mb-4">
                                                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Checklist de Atividades</label>
                                                                                        <span className="text-[10px] font-bold text-brand-coral">{progress}% Concluído</span>
                                                                                    </div>

                                                                                    {/* Progress Bar */}
                                                                                    <div className="w-full h-2 bg-slate-800 rounded-full mb-6 overflow-hidden">
                                                                                        <div
                                                                                            className="h-full bg-gradient-to-r from-brand-coral to-red-500 shadow-[0_0_10px_rgba(255,107,107,0.5)] transition-all duration-500 ease-out"
                                                                                            style={{ width: `${progress}%` }}
                                                                                        ></div>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        {currentPlanningChecklist.map((item) => {
                                                                                            const isChecked = step.checklist_data?.[item] || false;
                                                                                            return (
                                                                                                <label key={item} className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border
                                                                                                    ${isChecked
                                                                                                        ? 'bg-brand-coral/10 border-brand-coral/30'
                                                                                                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                                                                                                    <div className="relative flex items-center justify-center">
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            checked={isChecked}
                                                                                                            disabled={!isActive}
                                                                                                            onChange={() => handleToggleChecklist(step.id, item, step.checklist_data)}
                                                                                                            className="appearance-none w-5 h-5 rounded border-2 border-slate-500 checked:bg-brand-coral checked:border-brand-coral transition-all cursor-pointer"
                                                                                                        />
                                                                                                        {isChecked && <CheckCircle size={12} className="absolute text-white pointer-events-none" />}
                                                                                                    </div>
                                                                                                    <span className={`text-sm ${isChecked ? 'text-white font-semibold' : 'text-slate-400'}`}>
                                                                                                        {item}
                                                                                                    </span>
                                                                                                </label>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Right Column: Observations */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-wider">Observações</label>
                                                                                    <textarea
                                                                                        rows={12}
                                                                                        value={step.observations || ''}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { observations: e.target.value })}
                                                                                        disabled={!isActive && !isCompleted}
                                                                                        placeholder="Adicione notas estratégicas..."
                                                                                        className="flex-1 w-full text-sm p-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral outline-none resize-none placeholder:text-slate-600"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        ) : step.step_key === 'creatives' ? (
                                                                            /* Creatives Layout - Same pattern as Planning */
                                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                                                {/* Left Column: Checklist */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <div className="flex items-center justify-between mb-4">
                                                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Checklist de Atividades</label>
                                                                                        <span className="text-[10px] font-bold text-brand-coral">{creativesProgress}% Concluído</span>
                                                                                    </div>

                                                                                    {/* Progress Bar */}
                                                                                    <div className="w-full h-2 bg-slate-800 rounded-full mb-6 overflow-hidden">
                                                                                        <div
                                                                                            className="h-full bg-gradient-to-r from-brand-coral to-red-500 shadow-[0_0_10px_rgba(255,107,107,0.5)] transition-all duration-500 ease-out"
                                                                                            style={{ width: `${creativesProgress}%` }}
                                                                                        ></div>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        {CREATIVES_CHECKLIST_ITEMS.map((item) => {
                                                                                            const isChecked = step.checklist_data?.[item] || false;
                                                                                            return (
                                                                                                <label key={item} className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border
                                                                                                    ${isChecked
                                                                                                        ? 'bg-brand-coral/10 border-brand-coral/30'
                                                                                                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                                                                                                    <div className="relative flex items-center justify-center">
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            checked={isChecked}
                                                                                                            disabled={!isActive}
                                                                                                            onChange={() => handleToggleChecklist(step.id, item, step.checklist_data)}
                                                                                                            className="appearance-none w-5 h-5 rounded border-2 border-slate-500 checked:bg-brand-coral checked:border-brand-coral transition-all cursor-pointer"
                                                                                                        />
                                                                                                        {isChecked && <CheckCircle size={12} className="absolute text-white pointer-events-none" />}
                                                                                                    </div>
                                                                                                    <span className={`text-sm ${isChecked ? 'text-white font-semibold' : 'text-slate-400'}`}>
                                                                                                        {item}
                                                                                                    </span>
                                                                                                </label>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Right Column: Observations */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-wider">Observações</label>
                                                                                    <textarea
                                                                                        rows={12}
                                                                                        value={step.observations || ''}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { observations: e.target.value })}
                                                                                        disabled={!isActive && !isCompleted}
                                                                                        placeholder="Adicione notas estratégicas..."
                                                                                        className="flex-1 w-full text-sm p-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral outline-none resize-none placeholder:text-slate-600"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        ) : step.step_key === 'execution' ? (
                                                                            /* Execution Layout - Same pattern as Planning */
                                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                                                {/* Left Column: Checklist */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <div className="flex items-center justify-between mb-4">
                                                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Checklist de Atividades</label>
                                                                                        <span className="text-[10px] font-bold text-brand-coral">{executionProgress}% Concluído</span>
                                                                                    </div>

                                                                                    {/* Progress Bar */}
                                                                                    <div className="w-full h-2 bg-slate-800 rounded-full mb-6 overflow-hidden">
                                                                                        <div
                                                                                            className="h-full bg-gradient-to-r from-brand-coral to-red-500 shadow-[0_0_10px_rgba(255,107,107,0.5)] transition-all duration-500 ease-out"
                                                                                            style={{ width: `${executionProgress}%` }}
                                                                                        ></div>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        {EXECUTION_CHECKLIST_ITEMS.map((item) => {
                                                                                            const isChecked = step.checklist_data?.[item] || false;
                                                                                            return (
                                                                                                <label key={item} className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border
                                                                                                    ${isChecked
                                                                                                        ? 'bg-brand-coral/10 border-brand-coral/30'
                                                                                                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                                                                                                    <div className="relative flex items-center justify-center">
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            checked={isChecked}
                                                                                                            disabled={!isActive}
                                                                                                            onChange={() => handleToggleChecklist(step.id, item, step.checklist_data)}
                                                                                                            className="appearance-none w-5 h-5 rounded border-2 border-slate-500 checked:bg-brand-coral checked:border-brand-coral transition-all cursor-pointer"
                                                                                                        />
                                                                                                        {isChecked && <CheckCircle size={12} className="absolute text-white pointer-events-none" />}
                                                                                                    </div>
                                                                                                    <span className={`text-sm ${isChecked ? 'text-white font-semibold' : 'text-slate-400'}`}>
                                                                                                        {item}
                                                                                                    </span>
                                                                                                </label>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Right Column: Observations */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-wider">Observações</label>
                                                                                    <textarea
                                                                                        rows={12}
                                                                                        value={step.observations || ''}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { observations: e.target.value })}
                                                                                        disabled={!isActive && !isCompleted}
                                                                                        placeholder="Adicione notas estratégicas..."
                                                                                        className="flex-1 w-full text-sm p-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral outline-none resize-none placeholder:text-slate-600"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        ) : step.step_key === 'optimization' ? (
                                                                            /* Optimization Layout - Same pattern as Planning */
                                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                                                {/* Left Column: Checklist */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <div className="flex items-center justify-between mb-4">
                                                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Checklist de Atividades</label>
                                                                                        <span className="text-[10px] font-bold text-brand-coral">{optimizationProgress}% Concluído</span>
                                                                                    </div>

                                                                                    {/* Progress Bar */}
                                                                                    <div className="w-full h-2 bg-slate-800 rounded-full mb-6 overflow-hidden">
                                                                                        <div
                                                                                            className="h-full bg-gradient-to-r from-brand-coral to-red-500 shadow-[0_0_10px_rgba(255,107,107,0.5)] transition-all duration-500 ease-out"
                                                                                            style={{ width: `${optimizationProgress}%` }}
                                                                                        ></div>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        {OPTIMIZATION_CHECKLIST_ITEMS.map((item) => {
                                                                                            const isChecked = step.checklist_data?.[item] || false;
                                                                                            return (
                                                                                                <label key={item} className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border
                                                                                                    ${isChecked
                                                                                                        ? 'bg-brand-coral/10 border-brand-coral/30'
                                                                                                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                                                                                                    <div className="relative flex items-center justify-center">
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            checked={isChecked}
                                                                                                            disabled={!isActive}
                                                                                                            onChange={() => handleToggleChecklist(step.id, item, step.checklist_data)}
                                                                                                            className="appearance-none w-5 h-5 rounded border-2 border-slate-500 checked:bg-brand-coral checked:border-brand-coral transition-all cursor-pointer"
                                                                                                        />
                                                                                                        {isChecked && <CheckCircle size={12} className="absolute text-white pointer-events-none" />}
                                                                                                    </div>
                                                                                                    <span className={`text-sm ${isChecked ? 'text-white font-semibold' : 'text-slate-400'}`}>
                                                                                                        {item}
                                                                                                    </span>
                                                                                                </label>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Right Column: Observations */}
                                                                                <div className="flex flex-col h-full">
                                                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-4 tracking-wider">Observações</label>
                                                                                    <textarea
                                                                                        rows={12}
                                                                                        value={step.observations || ''}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { observations: e.target.value })}
                                                                                        disabled={!isActive && !isCompleted}
                                                                                        placeholder="Adicione notas estratégicas..."
                                                                                        className="flex-1 w-full text-sm p-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral outline-none resize-none placeholder:text-slate-600"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            /* Standard View for other steps */
                                                                            <div>
                                                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-wider">Observações</label>
                                                                                <textarea
                                                                                    rows={4}
                                                                                    value={step.observations || ''}
                                                                                    onChange={(e) => handleUpdateTimelineStep(step.id, { observations: e.target.value })}
                                                                                    disabled={!isActive && !isCompleted}
                                                                                    placeholder="Adicione notas sobre esta etapa..."
                                                                                    className="w-full text-sm p-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 focus:ring-1 focus:ring-brand-coral outline-none resize-none placeholder:text-slate-600"
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {/* Footer Actions - Corporate Style */}
                                                                        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800/50">
                                                                            <div>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setTaskContext({ campaignName: campaign.name || '', stepLabel: config.label });
                                                                                        setShowTaskModal(true);
                                                                                    }}
                                                                                    className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                                                                                >
                                                                                    <Plus size={16} />
                                                                                    Nova Tarefa
                                                                                </button>
                                                                            </div>

                                                                            <div className="flex gap-3">
                                                                                {isCompleted && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleUndoStep(step, campaign.id);
                                                                                        }}
                                                                                        className="px-6 py-2.5 border border-slate-600 text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-800 hover:text-white transition-colors"
                                                                                    >
                                                                                        Reabrir Etapa
                                                                                    </button>
                                                                                )}

                                                                                {isActive && step.step_key !== 'finalization' && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleCompleteStep(step, campaign.id);
                                                                                        }}
                                                                                        className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 transform hover:-translate-y-0.5"
                                                                                    >
                                                                                        <CheckCircle size={16} />
                                                                                        Concluir Etapa
                                                                                    </button>
                                                                                )}

                                                                                {isActive && step.step_key === 'finalization' && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            if (confirm('Tem certeza que deseja concluir este projeto? A campanha será marcada como finalizada.')) {
                                                                                                handleCompleteStep(step, campaign.id);
                                                                                            }
                                                                                        }}
                                                                                        className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-brand-coral to-red-500 text-white rounded-xl font-bold text-sm hover:from-red-500 hover:to-brand-coral transition-all shadow-lg shadow-brand-coral/30 transform hover:-translate-y-0.5"
                                                                                    >
                                                                                        <Flag size={16} />
                                                                                        Concluir Projeto
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* New Campaign Modal */}
            {showCampaignModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in duration-300">
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Nova Campanha</h3>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Nome da Campanha <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={newCampaignName}
                                onChange={(e) => setNewCampaignName(e.target.value)}
                                placeholder="Ex: Black Friday 2026 - Captação"
                                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none transition-all"
                                autoFocus
                            />
                        </div>

                        <p className="text-slate-500 mb-4 font-medium">Selecione a Plataforma</p>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            {[
                                { id: 'google_ads', label: 'Google Ads', color: 'bg-blue-50 hover:border-blue-500 text-blue-700' },
                                { id: 'meta_ads', label: 'Meta Ads', color: 'bg-indigo-50 hover:border-indigo-500 text-indigo-700' },
                                { id: 'linkedin_ads', label: 'LinkedIn Ads', color: 'bg-sky-50 hover:border-sky-500 text-sky-700' },
                                { id: 'tiktok_ads', label: 'TikTok Ads', color: 'bg-pink-50 hover:border-pink-500 text-pink-700' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setNewCampaignPlatform(opt.id as any)}
                                    className={`p-4 rounded-xl border-2 transition-all font-bold ${newCampaignPlatform === opt.id
                                        ? 'border-brand-coral ring-1 ring-brand-coral'
                                        : 'border-transparent'
                                        } ${opt.color}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowCampaignModal(false);
                                    setNewCampaignName('');
                                }}
                                className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateCampaign}
                                disabled={isCreating || !newCampaignName.trim()}
                                className="w-full py-3 bg-brand-coral text-white rounded-xl font-bold hover:bg-red-500 shadow-lg shadow-brand-coral/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isCreating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Criando...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={20} />
                                        Criar Campanha
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Survey Modal */}
            <SurveyAnswersModal
                isOpen={showSurveyModal}
                onClose={() => setShowSurveyModal(false)}
                surveyData={trafficProject?.survey_data || {}}
                isCompleted={trafficProject?.survey_status === 'completed'}
                onValidate={() => handleUpdateStatus('survey_status', 'completed')}
                onReopen={() => handleUpdateStatus('survey_status', 'pending')}
            />

            {/* Access Modal */}
            <AccessAnswersModal
                isOpen={showAccessModal}
                onClose={() => setShowAccessModal(false)}
                accessData={trafficProject?.access_data || {}}
                isCompleted={trafficProject?.account_setup_status === 'completed'}
                onValidate={() => handleUpdateStatus('account_setup_status', 'completed')}
                onReopen={() => handleUpdateStatus('account_setup_status', 'pending')}
                projectId={trafficProject?.id}
            />
            {/* Task Modal */}
            <TaskModal
                isOpen={showTaskModal}
                onClose={() => {
                    setShowTaskModal(false);
                    setTaskContext(null);
                }}
                projectId={Number(id)}
                projectName={taskContext ? `[Tráfego] ${taskContext.campaignName} - ${taskContext.stepLabel}` : companyName}
                onSave={() => {
                    alert('Tarefa criada com sucesso! Ela já está disponível no Kanban do projeto.');
                }}
            />
        </div>
    );
};

export default TrafficManagement;
