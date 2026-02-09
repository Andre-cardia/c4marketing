import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { ArrowLeft, BarChart, Send, CheckCircle, Settings, Users, Plus, Play, FileText, Layers, TrendingUp, Flag, Trash2, Calendar, ChevronDown, ChevronUp, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SurveyAnswersModal from './traffic/SurveyAnswersModal';
import AccessAnswersModal from './traffic/AccessAnswersModal';

const STEP_CONFIG = {
    planning: { label: 'Planejamento', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
    creatives: { label: 'Criativos', icon: Layers, color: 'text-purple-500', bg: 'bg-purple-50' },
    execution: { label: 'Execução', icon: Play, color: 'text-green-500', bg: 'bg-green-50' },
    optimization: { label: 'Análise e Otimização', icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-50' },
    finalization: { label: 'Finalização', icon: Flag, color: 'text-red-500', bg: 'bg-red-50' }
};

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

    // Timeline State
    const [timelineSteps, setTimelineSteps] = useState<Record<string, TimelineStep[]>>({});
    const [expandedStep, setExpandedStep] = useState<string | null>(null); // Format: "campaignId-stepKey"
    const [appUsers, setAppUsers] = useState<AppUser[]>([]);

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
        if (!trafficProject) return;
        if (!newCampaignName.trim()) {
            alert('Por favor, informe o nome da campanha.');
            return;
        }

        const { data, error } = await supabase
            .from('traffic_campaigns')
            .insert([{
                traffic_project_id: trafficProject.id,
                platform: newCampaignPlatform,
                name: newCampaignName // Use user provided name
            }])
            .select()
            .single();

        if (data) {
            setCampaigns([data, ...campaigns]);
            setShowCampaignModal(false);
            setNewCampaignName('');
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

                {/* Onboarding Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    {/* 1. Survey */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Send className="w-5 h-5 text-blue-500" />
                            Pesquisa Inicial
                        </h3>

                        {/* Content */}
                        <div className="space-y-4 relative z-10">
                            {/* Always visible: Send Link */}
                            <button
                                onClick={() => {
                                    const url = `${window.location.origin}/external/traffic-survey/${trafficProject?.id}`;
                                    navigator.clipboard.writeText(url);
                                    alert('Link copiado para a área de transferência!');
                                }}
                                className="w-full py-2.5 px-4 bg-brand-coral text-white rounded-xl font-bold text-sm hover:bg-red-500 shadow-md shadow-brand-coral/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Send size={16} />
                                Enviar Pesquisa
                            </button>

                            {/* Visibility Logic for Responses & Validation */}
                            {trafficProject?.survey_data && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                                        {trafficProject.survey_status === 'completed' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                                <CheckCircle size={12} /> Validado
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                                Pendente
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleOpenSurveyModal}
                                        className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                    >
                                        Ver Respostas Recebidas
                                    </button>

                                    {trafficProject.survey_status !== 'completed' && (
                                        <button
                                            onClick={() => handleUpdateStatus('survey_status', 'completed')}
                                            className="w-full py-2 text-sm font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle size={16} />
                                            Validar & Concluir
                                        </button>
                                    )}

                                    {trafficProject.survey_status === 'completed' && (
                                        <button
                                            onClick={() => handleUpdateStatus('survey_status', 'pending')}
                                            className="w-full py-2 text-sm font-bold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            <ArrowLeft size={16} />
                                            Desvalidar Formulário
                                        </button>
                                    )}
                                </div>
                            )}

                            {!trafficProject?.survey_data && (
                                <p className="text-xs text-center text-slate-400">
                                    Aguardando resposta do cliente...
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 2. Account Setup / Access Config */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 dark:bg-purple-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-purple-500" />
                            Configuração
                        </h3>

                        <div className="space-y-4 relative z-10">
                            {/* always visible: Send Link (Red button style like Pesquisa Inicial) */}
                            <button
                                onClick={() => {
                                    const url = `${window.location.origin}/external/traffic-access/${trafficProject?.id}`;
                                    navigator.clipboard.writeText(url);
                                    alert('Link copiado para a área de transferência!');
                                }}
                                className="w-full py-2.5 px-4 bg-brand-coral text-white rounded-xl font-bold text-sm hover:bg-red-500 shadow-md shadow-brand-coral/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Settings size={16} />
                                Enviar Formulário
                            </button>

                            {/* Visibility Logic for Responses & Validation - Always visible as requested */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                                    {trafficProject?.account_setup_status === 'completed' ? (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                            <CheckCircle size={12} /> Contas Vinculadas
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                            Pendente
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={handleOpenAccessModal}
                                    className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                >
                                    Ver Respostas Recebidas
                                </button>

                                {trafficProject?.account_setup_status !== 'completed' && (
                                    <button
                                        onClick={() => handleUpdateStatus('account_setup_status', 'completed')}
                                        className="w-full py-2 text-sm font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={16} />
                                        Validar & Concluir
                                    </button>
                                )}

                                {trafficProject?.account_setup_status === 'completed' && (
                                    <button
                                        onClick={() => handleUpdateStatus('account_setup_status', 'pending')}
                                        className="w-full py-2 text-sm font-bold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <ArrowLeft size={16} />
                                        Desvalidar Formulário
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. Strategy Meeting */}
                    <div
                        onClick={() => navigate(`/projects/${id}/traffic/strategy`)}
                        className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors cursor-pointer"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 dark:bg-amber-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Users className="w-5 h-5 text-amber-500" />
                            Reunião Estratégica
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 relative z-10">
                            Registre os objetivos, KPIs e público-alvo definidos.
                        </p>
                        <span className="text-sm font-bold text-amber-600 flex items-center gap-1 relative z-10">
                            Acessar Pauta <ArrowLeft className="rotate-180 w-4 h-4" />
                        </span>
                    </div>

                    {/* 4. Action: New Campaign */}
                    <div className="flex items-center justify-center">
                        <button
                            onClick={() => setShowCampaignModal(true)}
                            disabled={!isOnboardingComplete}
                            className={`w-full h-full min-h-[160px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all
                            ${isOnboardingComplete
                                    ? 'border-brand-coral bg-brand-coral/5 hover:bg-brand-coral/10 text-brand-coral cursor-pointer'
                                    : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-70'}`}
                        >
                            <div className={`p-3 rounded-full ${isOnboardingComplete ? 'bg-brand-coral text-white shadow-lg shadow-brand-coral/30' : 'bg-slate-200 text-slate-400'}`}>
                                <Plus size={24} />
                            </div>
                            <span className="font-bold text-lg">Nova Campanha</span>
                            {!isOnboardingComplete && <span className="text-xs">Conclua o onboarding acima</span>}
                        </button>
                    </div>
                </div>

                {/* Campaigns List */}
                <div className="space-y-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white border-l-4 border-brand-coral pl-4">Campanhas Ativas</h2>

                    {campaigns.length === 0 ? (
                        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <p className="text-slate-500">Nenhuma campanha criada ainda.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {campaigns.map(campaign => (
                                <div key={campaign.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                    {/* Campaign Header */}
                                    <div className={`px-6 py-4 border-b flex items-center justify-between ${getPlatformColor(campaign.platform)} bg-opacity-10`}>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${getPlatformColor(campaign.platform)} bg-white`}>
                                                {formatPlatform(campaign.platform)}
                                            </span>
                                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                                {campaign.name}
                                                {campaign.status === 'ended' && (
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full border border-green-200 flex items-center gap-1">
                                                        <CheckCircle size={10} /> Finalizada
                                                    </span>
                                                )}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-mono text-slate-500">{new Date(campaign.created_at || new Date()).toLocaleDateString()}</span>
                                            <button
                                                onClick={() => handleDeleteCampaign(campaign.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Excluir Campanha"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="p-6">
                                        {!timelineSteps[campaign.id] || timelineSteps[campaign.id].length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                                                <p className="text-slate-500 mb-4 text-center text-sm">Esta campanha não possui timeline ativa.</p>
                                                <button
                                                    onClick={() => handleInitializeTimeline(campaign.id)}
                                                    className="px-4 py-2 bg-brand-coral text-white rounded-lg font-bold text-sm hover:bg-red-600 transition-colors"
                                                >
                                                    Ativar Timeline da Campanha
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {timelineSteps[campaign.id]
                                                    .sort((a, b) => a.order_index - b.order_index)
                                                    .map((step) => {
                                                        const config = STEP_CONFIG[step.step_key] || { label: step.step_key, icon: FileText, color: 'text-slate-500', bg: 'bg-slate-50' };
                                                        const isExpanded = expandedStep === `${campaign.id}-${step.step_key}`;
                                                        const isActive = step.status === 'in_progress';
                                                        const isCompleted = step.status === 'completed';

                                                        return (
                                                            <div
                                                                key={step.id}
                                                                className={`border rounded-xl transition-all duration-300 overflow-hidden
                                                                ${isActive ? 'border-brand-coral bg-white dark:bg-slate-800 shadow-md ring-1 ring-brand-coral/20'
                                                                        : isCompleted ? 'border-green-200 bg-green-50/30 dark:bg-green-900/10 dark:border-green-900/30'
                                                                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-70 hover:opacity-100 hover:bg-white dark:hover:bg-slate-800'}`}
                                                            >
                                                                {/* Step Header */}
                                                                <div
                                                                    onClick={() => setExpandedStep(isExpanded ? null : `${campaign.id}-${step.step_key}`)}
                                                                    className="px-6 py-4 flex items-center justify-between cursor-pointer"
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <div className={`p-2 rounded-lg ${isActive || isCompleted ? config.bg.replace('50', '100') : 'bg-slate-100 dark:bg-slate-700'}`}>
                                                                            <config.icon className={`w-5 h-5 ${isActive || isCompleted ? config.color : 'text-slate-400 dark:text-slate-500'}`} />
                                                                        </div>
                                                                        <div>
                                                                            <h4 className={`font-bold ${isActive ? 'text-slate-900 dark:text-white' : isCompleted ? 'text-green-800 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                                                {config.label}
                                                                            </h4>
                                                                            <div className="flex items-center gap-3 text-xs mt-1">
                                                                                <span className={`font-semibold ${isActive ? 'text-brand-coral' :
                                                                                    isCompleted ? 'text-green-600 dark:text-green-400' :
                                                                                        'text-slate-400'
                                                                                    }`}>
                                                                                    {isActive ? 'Em Andamento' : isCompleted ? 'Concluído' : 'Pendente'}
                                                                                </span>
                                                                                {step.start_date && (
                                                                                    <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                                                                        <Calendar size={12} /> {new Date(step.start_date).toLocaleDateString()}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-3">
                                                                        {isCompleted && <CheckCircle className="text-green-500 dark:text-green-400 w-5 h-5" />}
                                                                        {isExpanded ? <ChevronUp className="text-slate-400 dark:text-slate-500 w-4 h-4" /> : <ChevronDown className="text-slate-400 dark:text-slate-500 w-4 h-4" />}
                                                                    </div>
                                                                </div>

                                                                {/* Step Body */}
                                                                {isExpanded && (
                                                                    <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 animate-in slide-in-from-top-2">
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                                            {/* Dates */}
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Período</label>
                                                                                <div className="flex gap-2">
                                                                                    <div className="flex-1">
                                                                                        <span className="text-xs text-slate-400 dark:text-slate-500 block mb-1">Início</span>
                                                                                        <input
                                                                                            type="date"
                                                                                            value={step.start_date ? step.start_date.split('T')[0] : ''}
                                                                                            disabled={!isActive}
                                                                                            onChange={(e) => handleUpdateTimelineStep(step.id, { start_date: e.target.value })}
                                                                                            className="w-full text-sm p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex-1">
                                                                                        <span className="text-xs text-slate-400 dark:text-slate-500 block mb-1">Fim Previsto</span>
                                                                                        <input
                                                                                            type="date"
                                                                                            value={step.end_date ? step.end_date.split('T')[0] : ''}
                                                                                            disabled={!isActive && !isCompleted}
                                                                                            onChange={(e) => handleUpdateTimelineStep(step.id, { end_date: e.target.value })}
                                                                                            className="w-full text-sm p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            {/* Responsible */}
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Responsável</label>
                                                                                <div className="relative">
                                                                                    <select
                                                                                        value={step.responsible_id || ''}
                                                                                        onChange={(e) => handleUpdateTimelineStep(step.id, { responsible_id: e.target.value })}
                                                                                        disabled={!isActive && !isCompleted}
                                                                                        className="w-full text-sm p-2 pl-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none appearance-none"
                                                                                    >
                                                                                        <option value="">Selecione...</option>
                                                                                        {appUsers.map(u => (
                                                                                            <option key={u.id} value={u.id}>{u.full_name || u.email || 'Usuário Sem Nome'}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <User className="absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500 w-4 h-4 pointer-events-none" />
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Observations */}
                                                                        <div className="mb-6">
                                                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Observações</label>
                                                                            <textarea
                                                                                rows={3}
                                                                                value={step.observations || ''}
                                                                                onChange={(e) => handleUpdateTimelineStep(step.id, { observations: e.target.value })}
                                                                                disabled={!isActive && !isCompleted}
                                                                                placeholder="Adicione notas sobre esta etapa..."
                                                                                className="w-full text-sm p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none resize-none"
                                                                            />
                                                                        </div>

                                                                        {/* Action Buttons */}
                                                                        <div className="flex justify-end gap-3">
                                                                            {isCompleted && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleUndoStep(step, campaign.id);
                                                                                    }}
                                                                                    className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                                                >
                                                                                    Desfazer / Reabrir
                                                                                </button>
                                                                            )}

                                                                            {isActive && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleCompleteStep(step, campaign.id);
                                                                                    }}
                                                                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-md shadow-green-200 dark:shadow-none"
                                                                                >
                                                                                    <CheckCircle size={16} />
                                                                                    Concluir Etapa
                                                                                </button>
                                                                            )}
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
                                disabled={!newCampaignName.trim()}
                                className={`flex-1 py-3 font-bold rounded-xl shadow-lg transition-all
                                    ${!newCampaignName.trim()
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-brand-coral text-white hover:bg-red-500 shadow-brand-coral/20'}`}
                            >
                                Criar Campanha
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
        </div>
    );
};

export default TrafficManagement;
