import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { ArrowLeft, BarChart, Send, CheckCircle, Settings, Users, Plus, Play, FileText, Layers, TrendingUp, Flag, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SurveyAnswersModal from './traffic/SurveyAnswersModal';

interface TrafficProject {
    id: string;
    acceptance_id: string;
    survey_status: 'pending' | 'completed';
    account_setup_status: 'pending' | 'completed';
    strategy_meeting_notes: string | null;
    survey_data?: any;
}

interface Campaign {
    id: string;
    name: string;
    platform: 'google_ads' | 'meta_ads' | 'linkedin_ads' | 'tiktok_ads';
    status: 'active' | 'paused' | 'ended';
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
    const [newCampaignPlatform, setNewCampaignPlatform] = useState<Campaign['platform']>('google_ads');

    // Fetch Data
    useEffect(() => {
        const loadPageData = async () => {
            if (!id) return;
            try {
                // 1. Get Company Name & CNPJ from Acceptance
                const { data: acceptance, error: accError } = await supabase
                    .from('acceptances')
                    .select('company_name')
                    .eq('id', id)
                    .single();

                if (acceptance) setCompanyName(acceptance.company_name);

                // 2. Get or Create Traffic Project
                const { data: tpData, error: tpError } = await supabase
                    .from('traffic_projects')
                    .select('*')
                    .eq('acceptance_id', id)
                    .single();

                if (tpData) {
                    setTrafficProject(tpData);
                    // 3. Fetch Campaigns if project exists
                    const { data: campData } = await supabase
                        .from('traffic_campaigns')
                        .select('*')
                        .eq('traffic_project_id', tpData.id)
                        .order('created_at', { ascending: false });

                    if (campData) setCampaigns(campData);

                } else {
                    // Create default project
                    const { data: newTp, error: createError } = await supabase
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

        loadPageData();
    }, [id]);

    // Handlers
    const handleUpdateStatus = async (field: 'survey_status' | 'account_setup_status', value: 'completed') => {
        if (!trafficProject) return;

        const { error } = await supabase
            .from('traffic_projects')
            .update({ [field]: value })
            .eq('id', trafficProject.id);

        if (!error) {
            setTrafficProject({ ...trafficProject, [field]: value });
        }
    };

    const handleDeleteCampaign = async (campaignId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;

        const { error } = await supabase
            .from('traffic_campaigns')
            .delete()
            .eq('id', campaignId);

        if (!error) {
            setCampaigns(campaigns.filter(c => c.id !== campaignId));
        }
    };

    const handleCreateCampaign = async () => {
        if (!trafficProject) return;

        const { data, error } = await supabase
            .from('traffic_campaigns')
            .insert([{
                traffic_project_id: trafficProject.id,
                platform: newCampaignPlatform,
                name: `Campanha 0${campaigns.length + 1} - ${formatPlatform(newCampaignPlatform)}`
            }])
            .select()
            .single();

        if (data) {
            setCampaigns([data, ...campaigns]);
            setShowCampaignModal(false);
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
                                        onClick={() => setShowSurveyModal(true)}
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
                                </div>
                            )}

                            {!trafficProject?.survey_data && (
                                <p className="text-xs text-center text-slate-400">
                                    Aguardando resposta do cliente...
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 2. Account Setup */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 dark:bg-purple-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-purple-500" />
                            Configuração
                        </h3>
                        {trafficProject?.account_setup_status === 'completed' ? (
                            <div className="relative z-10">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold ring-1 ring-green-500/20">
                                    <CheckCircle size={14} /> Contas Vinculadas
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-3 relative z-10">
                                <button className="w-full py-2.5 px-4 bg-white border-2 border-purple-500 text-purple-600 rounded-xl font-bold text-sm hover:bg-purple-50 transition-colors">
                                    Enviar Guia
                                </button>
                                <button
                                    onClick={() => handleUpdateStatus('account_setup_status', 'completed')}
                                    className="w-full text-xs text-slate-400 hover:text-slate-600 underline"
                                >
                                    Marcar como Feito (Dev)
                                </button>
                            </div>
                        )}
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
                                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">{campaign.name}</h3>
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

                                    {/* Campaign Track */}
                                    <div className="p-6">
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                            {[
                                                { label: 'Planejamento', icon: FileText, color: 'text-blue-500', id: 'planning' },
                                                { label: 'Criativos', icon: Layers, color: 'text-purple-500', id: 'creatives' },
                                                { label: 'Execução', icon: Play, color: 'text-green-500', id: 'execution' },
                                                { label: 'Análise e Otimização', icon: TrendingUp, color: 'text-amber-500', id: 'optimization' },
                                                { label: 'Finalização', icon: Flag, color: 'text-red-500', id: 'finalization' },
                                            ].map((stage, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => navigate(`/projects/${id}/traffic/campaign/${campaign.id}/${stage.id}`)}
                                                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-white hover:shadow-md hover:border-brand-coral/30 transition-all group"
                                                >
                                                    <stage.icon className={`w-8 h-8 mb-3 ${stage.color} opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all`} />
                                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white text-center">
                                                        {stage.label}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
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
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Selecione a Plataforma</h3>
                        <p className="text-slate-500 mb-6">Qual será o canal principal desta campanha?</p>

                        <div className="grid grid-cols-2 gap-4 mb-6">
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
                                onClick={() => setShowCampaignModal(false)}
                                className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateCampaign}
                                className="flex-1 py-3 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 shadow-lg shadow-brand-coral/20"
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
            />
        </div>
    );
};

export default TrafficManagement;
