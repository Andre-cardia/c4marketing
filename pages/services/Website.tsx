import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { ArrowLeft, Globe, Send, CheckCircle, Settings, Users, Plus, Edit, Eye, MessageSquare, Trash2, PenTool, LayoutTemplate, Share2, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SurveyAnswersModal from './website/SurveyAnswersModal';
import AccessGuideModal from '../../components/AccessGuideModal';

interface WebsiteProject {
    id: string;
    acceptance_id: string;
    survey_status: 'pending' | 'completed';
    account_setup_status: 'pending' | 'completed';
    briefing_status: 'pending' | 'completed';
    survey_data?: any;
    access_guide_data?: any;
}

interface Website {
    id: string;
    name: string;
    status: 'content_received' | 'design' | 'approval' | 'adjustments' | 'delivered';
    created_at: string;
}

const WebsiteManagement: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [companyName, setCompanyName] = useState<string>('');
    const [webProject, setWebProject] = useState<WebsiteProject | null>(null);
    const [websites, setWebsites] = useState<Website[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSurveyModal, setShowSurveyModal] = useState(false);
    const [showAccessGuideModal, setShowAccessGuideModal] = useState(false);

    // Shared Fetch Function
    const loadProjectData = async () => {
        if (!id) return;
        try {
            // 1. Get Company Name
            const { data: acceptance } = await supabase
                .from('acceptances')
                .select('company_name')
                .eq('id', id)
                .single();

            if (acceptance) setCompanyName(acceptance.company_name);

            // 2. Get Website Project
            const { data: webData } = await supabase
                .from('website_projects')
                .select('*')
                .eq('acceptance_id', id)
                .single();

            if (webData) {
                setWebProject(webData);
                // 3. Fetch Websites
                const { data: sitesData } = await supabase
                    .from('websites')
                    .select('*')
                    .eq('website_project_id', webData.id)
                    .order('created_at', { ascending: false });

                if (sitesData) setWebsites(sitesData);

            } else {
                // Create default project if not exists
                const { data: newWeb } = await supabase
                    .from('website_projects')
                    .insert([{ acceptance_id: id }])
                    .select()
                    .single();

                if (newWeb) setWebProject(newWeb);
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

    const handleOpenAccessGuideModal = async () => {
        await loadProjectData();
        setShowAccessGuideModal(true);
    };

    const handleUpdateStatus = async (field: 'survey_status' | 'account_setup_status' | 'briefing_status', value: 'completed' | 'pending') => {
        if (!webProject) return;

        const { error } = await supabase
            .from('website_projects')
            .update({ [field]: value })
            .eq('id', webProject.id);

        if (!error) {
            setWebProject({ ...webProject, [field]: value });
        }
    };

    const handleCreateWebsite = async () => {
        if (!webProject) return;

        const pageName = prompt("Nome do Novo Site (ex: Site Institucional):");
        if (!pageName) return;

        const { data, error } = await supabase
            .from('websites')
            .insert([{
                website_project_id: webProject.id,
                name: pageName,
                status: 'content_received'
            }])
            .select()
            .single();

        if (data) {
            setWebsites([data, ...websites]);
        }
    };

    const handleUpdatePageStatus = async (pageId: string, newStatus: Website['status']) => {
        const { error } = await supabase
            .from('websites')
            .update({ status: newStatus })
            .eq('id', pageId);

        if (!error) {
            setWebsites(websites.map(p => p.id === pageId ? { ...p, status: newStatus } : p));
        }
    };

    const handleDeletePage = async (pageId: string) => {
        if (!confirm('Tem certeza que deseja apagar este Site?')) return;

        const { error } = await supabase.from('websites').delete().eq('id', pageId);
        if (!error) {
            setWebsites(websites.filter(p => p.id !== pageId));
        }
    }

    const STATUS_FLOW = [
        { id: 'content_received', label: 'Recebimento de Conteúdos', icon: File },
        { id: 'design', label: 'Design e Template', icon: LayoutTemplate },
        { id: 'approval', label: 'Aprovação', icon: MessageSquare },
        { id: 'adjustments', label: 'Ajustes', icon: Settings },
        { id: 'delivered', label: 'Entrega', icon: CheckCircle }
    ];

    // Helper to get status index
    const getStatusIndex = (status: string) => STATUS_FLOW.findIndex(s => s.id === status);

    const isSetupComplete = webProject?.account_setup_status === 'completed' && webProject?.briefing_status === 'completed';

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
                            <Globe className="w-8 h-8 text-cyan-500" />
                            Gestão de Web Sites
                        </h1>
                        <p className="text-xl text-slate-600 dark:text-slate-400 mt-2 font-medium">
                            {companyName}
                            <span className="ml-4 text-xs font-mono text-slate-400">CNPJ: (Carregado do contrato)</span>
                        </p>
                    </div>
                </div>

                {/* Onboarding Section - Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">

                    {/* 1. Send Survey */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Send className="w-5 h-5 text-blue-500" />
                            Pesquisa Inicial
                        </h3>

                        <div className="space-y-4 relative z-10">
                            {/* Send Button */}
                            <button
                                onClick={() => {
                                    const url = `${window.location.origin}/external/website-survey/${webProject?.id}`;
                                    navigator.clipboard.writeText(url);
                                    alert('Link copiado!');
                                }}
                                className="w-full py-2.5 px-4 bg-brand-coral text-white rounded-xl font-bold text-sm hover:bg-red-500 shadow-md shadow-brand-coral/20 transition-all flex items-center justify-center gap-2"
                            >
                                <Send size={16} /> Enviar Pesquisa
                            </button>

                            {/* Validation Logic */}
                            {webProject?.survey_data && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                                        {webProject.survey_status === 'completed' ? (
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
                                        className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                    >
                                        Ver Respostas
                                    </button>
                                    {webProject.survey_status !== 'completed' && (
                                        <button
                                            onClick={() => handleUpdateStatus('survey_status', 'completed')}
                                            className="w-full py-2 text-sm font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle size={16} /> Validar
                                        </button>
                                    )}
                                </div>
                            )}
                            {!webProject?.survey_data && (
                                <p className="text-xs text-center text-slate-400 italic">
                                    Aguardando resposta do cliente...
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 2. Account Setup */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group hover:border-purple-300 transition-colors">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 dark:bg-purple-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-purple-500" />
                            Configuração
                        </h3>
                        <div className="space-y-3 relative z-10">
                            <button
                                onClick={() => {
                                    // Modified: Link to AccessGuideSurvey with type=website
                                    const url = `${window.location.origin}/external/access-guide/${webProject?.id}?type=website`;
                                    navigator.clipboard.writeText(url);
                                    alert('Link do Guia de Acesso copiado!');
                                }}
                                className="w-full py-2.5 px-4 bg-white border-2 border-purple-500 text-purple-600 rounded-xl font-bold text-sm hover:bg-purple-50 transition-colors"
                            >
                                Enviar Guia de Acesso
                            </button>

                            {webProject?.account_setup_status === 'completed' ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 justify-center text-green-600 font-bold text-sm bg-green-50 py-1 rounded-lg">
                                        <CheckCircle size={16} /> Dados Recebidos
                                    </div>
                                    <button
                                        onClick={handleOpenAccessGuideModal}
                                        className="w-full py-2 text-sm font-medium text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-100"
                                    >
                                        Ver Credenciais
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-center text-slate-400 italic">
                                    Aguardando dados de acesso...
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 3. Briefing Meeting */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 dark:bg-amber-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
                            <Users className="w-5 h-5 text-amber-500" />
                            Reunião de Briefing
                        </h3>
                        {webProject?.briefing_status === 'completed' ? (
                            <div className="relative z-10">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold ring-1 ring-green-500/20">
                                    <CheckCircle size={14} /> Briefing Realizado
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-3 relative z-10">
                                <p className="text-sm text-slate-500">Alinhe as expectativas e o design da página.</p>
                                <button
                                    onClick={() => handleUpdateStatus('briefing_status', 'completed')}
                                    className="w-full py-2 border border-amber-500 text-amber-600 rounded-xl font-bold text-sm hover:bg-amber-50 transition-colors"
                                >
                                    Confirmar Reunião
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 4. Action: New Website Button */}
                    <div className="flex items-center justify-center">
                        <button
                            onClick={handleCreateWebsite}
                            className="w-full h-full min-h-[160px] rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-coral bg-slate-50 dark:bg-slate-800/50 hover:bg-brand-coral/5 transition-all flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-brand-coral group cursor-pointer"
                        >
                            <div className="p-3 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 group-hover:border-brand-coral transition-colors">
                                <Plus size={24} className="group-hover:scale-110 transition-transform" />
                            </div>
                            <span className="font-bold text-lg">Novo Web Site</span>
                        </button>
                    </div>
                </div>

                {/* Websites List */}
                <div className="space-y-8">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white border-l-4 border-cyan-500 pl-4">Sites em Produção</h2>

                    {websites.map(page => (
                        <div key={page.id} className="bg-white dark:bg-slate-800 p-0 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                            {/* Page Header */}
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <span className="p-2 bg-cyan-100 text-cyan-600 rounded-lg">
                                        <Globe size={20} />
                                    </span>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{page.name}</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono text-slate-400">{new Date(page.created_at).toLocaleDateString()}</span>
                                    <button
                                        onClick={() => handleDeletePage(page.id)}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Apagar Site"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Status Flow */}
                            <div className="p-6">
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                    {STATUS_FLOW.map((step, idx) => {
                                        const currentIndex = getStatusIndex(page.status);
                                        const isCompleted = idx <= currentIndex;
                                        const isCurrent = idx === currentIndex;
                                        const isNext = idx === currentIndex + 1;

                                        return (
                                            <button
                                                key={step.id}
                                                disabled={!isNext && !isCompleted}
                                                onClick={() => {
                                                    if (isNext || (isCompleted && idx !== currentIndex)) { // Allow rollback or advance
                                                        handleUpdatePageStatus(page.id, step.id as any);
                                                    }
                                                }}
                                                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all group relative overflow-hidden
                                                    ${isCurrent
                                                        ? 'border-brand-coral/50 bg-gradient-to-br from-brand-coral/10 to-brand-coral/5'
                                                        : isCompleted
                                                            ? 'border-cyan-200 bg-cyan-50 dark:bg-cyan-900/10 dark:border-cyan-900/30'
                                                            : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 opacity-60 cursor-default'
                                                    }
                                                    ${isNext ? 'hover:border-brand-coral hover:bg-white dark:hover:bg-slate-800 hover:text-brand-coral cursor-pointer border-dashed hover:shadow-md' : ''}
                                                `}
                                            >
                                                <div className={`mb-3 transition-transform group-hover:scale-110 
                                                    ${isCurrent ? 'text-brand-coral' : isCompleted ? 'text-cyan-500' : 'text-slate-400'}
                                                `}>
                                                    <step.icon size={28} />
                                                </div>
                                                <span className={`text-sm font-bold text-center
                                                    ${isCurrent ? 'text-brand-coral' : isCompleted ? 'text-cyan-700 dark:text-cyan-400' : 'text-slate-400'}
                                                `}>
                                                    {step.label}
                                                </span>

                                                {isCurrent && <div className="absolute bottom-0 left-0 w-full h-1 bg-brand-coral"></div>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}

                    {websites.length === 0 && (
                        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-slate-400 font-medium mb-2">Nenhum Site criado.</p>
                            <p className="text-slate-500 text-sm">Clique em "Novo Web Site" acima para começar.</p>
                        </div>
                    )}
                </div>

            </main>

            {/* Survey Modal */}
            <SurveyAnswersModal
                isOpen={showSurveyModal}
                onClose={() => setShowSurveyModal(false)}
                surveyData={webProject?.survey_data || {}}
                isCompleted={webProject?.survey_status === 'completed'}
                onValidate={() => handleUpdateStatus('survey_status', 'completed')}
                onReopen={() => handleUpdateStatus('survey_status', 'pending')}
            />

            {/* Access Guide Modal */}
            <AccessGuideModal
                isOpen={showAccessGuideModal}
                onClose={() => setShowAccessGuideModal(false)}
                data={webProject?.access_guide_data || {}}
            />
        </div>
    );
};

// Simple Icon Placeholders
const File = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>;

export default WebsiteManagement;
