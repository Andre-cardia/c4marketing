import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { ArrowLeft, Layout, Send, CheckCircle, Settings, Users, Plus, Edit, Eye, MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SurveyAnswersModal from './lp/SurveyAnswersModal';

interface LandingPageProject {
    id: string;
    acceptance_id: string;
    survey_status: 'pending' | 'completed';
    account_setup_status: 'pending' | 'completed';
    briefing_status: 'pending' | 'completed';
    survey_data?: any;
}

interface LandingPage {
    id: string;
    name: string;
    status: 'content_received' | 'design' | 'approval' | 'adjustments' | 'delivered';
    created_at: string;
}

const LandingPageManagement: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [companyName, setCompanyName] = useState<string>('');
    const [lpProject, setLpProject] = useState<LandingPageProject | null>(null);
    const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSurveyModal, setShowSurveyModal] = useState(false);

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

            // 2. Get Landing Page Project
            const { data: lpData } = await supabase
                .from('landing_page_projects')
                .select('*')
                .eq('acceptance_id', id)
                .single();

            if (lpData) {
                setLpProject(lpData);
                // 3. Fetch Landing Pages
                const { data: pagesData } = await supabase
                    .from('landing_pages')
                    .select('*')
                    .eq('landing_page_project_id', lpData.id)
                    .order('created_at', { ascending: false });

                if (pagesData) setLandingPages(pagesData);

            } else {
                // Create default project if not exists
                const { data: newLp } = await supabase
                    .from('landing_page_projects')
                    .insert([{ acceptance_id: id }])
                    .select()
                    .single();

                if (newLp) setLpProject(newLp);
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

    const handleUpdateStatus = async (field: 'survey_status' | 'account_setup_status' | 'briefing_status', value: 'completed' | 'pending') => {
        if (!lpProject) return;

        const { error } = await supabase
            .from('landing_page_projects')
            .update({ [field]: value })
            .eq('id', lpProject.id);

        if (!error) {
            setLpProject({ ...lpProject, [field]: value });
        }
    };

    const handleCreateLandingPage = async () => {
        if (!lpProject) return;

        const pageName = prompt("Nome da Nova Landing Page (ex: LP Black Friday):");
        if (!pageName) return;

        const { data, error } = await supabase
            .from('landing_pages')
            .insert([{
                landing_page_project_id: lpProject.id,
                name: pageName,
                status: 'content_received'
            }])
            .select()
            .single();

        if (data) {
            setLandingPages([data, ...landingPages]);
        }
    };

    const handleUpdatePageStatus = async (pageId: string, newStatus: LandingPage['status']) => {
        const { error } = await supabase
            .from('landing_pages')
            .update({ status: newStatus })
            .eq('id', pageId);

        if (!error) {
            setLandingPages(landingPages.map(p => p.id === pageId ? { ...p, status: newStatus } : p));
        }
    };

    const handleDeletePage = async (pageId: string) => {
        if (!confirm('Tem certeza que deseja apagar esta Landing Page?')) return;

        const { error } = await supabase.from('landing_pages').delete().eq('id', pageId);
        if (!error) {
            setLandingPages(landingPages.filter(p => p.id !== pageId));
        }
    }

    const STATUS_FLOW = [
        { id: 'content_received', label: 'Recebimento de Conteúdos', icon: File },
        { id: 'design', label: 'Design e Template', icon: PenTool }, // Using PenTool as icon placeholder
        { id: 'approval', label: 'Aprovação', icon: MessagesSquare }, // Using MessagesSquare as approval placeholder
        { id: 'adjustments', label: 'Ajustes', icon: Settings },
        { id: 'delivered', label: 'Entrega', icon: CheckCircle }
    ];

    // Helper to get status index
    const getStatusIndex = (status: string) => STATUS_FLOW.findIndex(s => s.id === status);

    const isSetupComplete = lpProject?.account_setup_status === 'completed' && lpProject?.briefing_status === 'completed';

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
                            <Layout className="w-8 h-8 text-green-500" />
                            Gestão de Landing Pages
                        </h1>
                        <p className="text-xl text-slate-600 dark:text-slate-400 mt-2 font-medium">
                            {companyName}
                            <span className="ml-4 text-xs font-mono text-slate-400">CNPJ: (Carregado do contrato)</span>
                        </p>
                    </div>
                </div>

                {/* Top Section - Account Level */}
                <div className="flex flex-wrap gap-4 mb-12">
                    {/* 1. Send Survey */}
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1 min-w-[250px]">
                        <button
                            onClick={() => {
                                const url = `${window.location.origin}/external/lp-survey/${lpProject?.id}`;
                                navigator.clipboard.writeText(url);
                                alert('Link da pesquisa copiado!');
                            }}
                            className="w-full py-2.5 px-4 bg-white border-2 border-brand-coral text-brand-coral rounded-xl font-bold text-sm hover:bg-brand-coral hover:text-white transition-all flex items-center justify-center gap-2 mb-2"
                        >
                            <Send size={16} /> Enviar Pesquisa
                        </button>

                        {lpProject?.survey_data && (
                            <button
                                onClick={handleOpenSurveyModal}
                                className="w-full py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 flex items-center justify-center gap-2"
                            >
                                <Eye size={16} /> Ver Resposta da Pesquisa
                            </button>
                        )}
                        {!lpProject?.survey_data && (
                            <div className="text-center text-xs text-slate-400 py-2">
                                Aguardando resposta...
                            </div>
                        )}
                    </div>

                    {/* 2. Account Setup */}
                    <div className={`p-4 rounded-2xl border flex-1 min-w-[250px] flex flex-col justify-center items-center gap-2 transition-all ${lpProject?.account_setup_status === 'completed' ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                        <h3 className={`font-bold ${lpProject?.account_setup_status === 'completed' ? 'text-blue-700' : 'text-slate-700'}`}>Configuração de Conta</h3>
                        {lpProject?.account_setup_status === 'completed' ? (
                            <CheckCircle className="text-blue-500" size={24} />
                        ) : (
                            <button
                                onClick={() => handleUpdateStatus('account_setup_status', 'completed')}
                                className="text-xs px-3 py-1 bg-slate-100 rounded-full hover:bg-slate-200"
                            >
                                Marcar como Feito
                            </button>
                        )}
                    </div>

                    {/* 3. Briefing Meeting */}
                    <div className={`p-4 rounded-2xl border flex-1 min-w-[250px] flex flex-col justify-center items-center gap-2 transition-all ${lpProject?.briefing_status === 'completed' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                        <h3 className={`font-bold ${lpProject?.briefing_status === 'completed' ? 'text-amber-700' : 'text-slate-700'}`}>Reunião de Briefing</h3>
                        {lpProject?.briefing_status === 'completed' ? (
                            <CheckCircle className="text-amber-500" size={24} />
                        ) : (
                            <button
                                onClick={() => handleUpdateStatus('briefing_status', 'completed')}
                                className="text-xs px-3 py-1 bg-slate-100 rounded-full hover:bg-slate-200"
                            >
                                Marcar como Feito
                            </button>
                        )}
                    </div>

                    {/* 4. New LP Button */}
                    <button
                        onClick={handleCreateLandingPage}
                        className="flex-1 min-w-[250px] p-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-coral hover:bg-brand-coral/5 transition-all flex items-center justify-center gap-2 text-slate-500 hover:text-brand-coral group"
                    >
                        <Plus className="group-hover:scale-110 transition-transform" />
                        <span className="font-bold">Nova Landing Page +</span>
                    </button>
                </div>

                {/* Landing Pages List */}
                <div className="space-y-6">
                    {landingPages.map(page => (
                        <div key={page.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative pr-12">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 border-b pb-2">{page.name}</h3>

                            {/* Delete Button */}
                            <button
                                onClick={() => handleDeletePage(page.id)}
                                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                title="Apagar Landing Page"
                            >
                                <Trash2 size={18} />
                            </button>

                            {/* Status Flow */}
                            <div className="flex flex-wrap gap-4 justify-between">
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
                                            className={`flex-1 min-w-[140px] p-4 rounded-xl border transition-all flex flex-col items-center gap-2 text-center relative
                                                ${isCurrent
                                                    ? 'border-brand-coral bg-brand-coral text-white ring-2 ring-brand-coral ring-offset-2'
                                                    : isCompleted
                                                        ? 'border-green-200 bg-green-50 text-green-700'
                                                        : 'border-slate-100 bg-slate-50 text-slate-300 cursor-default'
                                                }
                                                ${isNext ? 'hover:border-brand-coral hover:bg-white hover:text-brand-coral cursor-pointer border-dashed' : ''}
                                            `}
                                        >
                                            {/* We need some icons here, but I'll use placeholders for now or import generic ones */}
                                            {/* Using generic logic for icons for now */}
                                            <div className="font-bold text-sm">
                                                {step.label}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {landingPages.length === 0 && (
                        <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <p className="text-slate-400 font-medium">Nenhuma Landing Page criada.</p>
                            <p className="text-slate-400 text-sm">Clique em "Nova Landing Page +" para começar.</p>
                        </div>
                    )}
                </div>

            </main>

            {/* Survey Modal */}
            <SurveyAnswersModal
                isOpen={showSurveyModal}
                onClose={() => setShowSurveyModal(false)}
                surveyData={lpProject?.survey_data || {}}
                isCompleted={lpProject?.survey_status === 'completed'}
                onValidate={() => handleUpdateStatus('survey_status', 'completed')}
                onReopen={() => handleUpdateStatus('survey_status', 'pending')}
            />
        </div>
    );
};

// Simple Icon Placeholders to avoid missing imports
const File = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>;
const PenTool = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>;
const MessagesSquare = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" /></svg>;

export default LandingPageManagement;
