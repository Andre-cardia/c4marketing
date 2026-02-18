import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';
import { LogOut, LayoutDashboard, BarChart3, PieChart, AlertCircle, FileText, CheckCircle2, Clock, ArrowLeft, Eye } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const ClientDashboard: React.FC = () => {
    const { acceptanceId } = useParams<{ acceptanceId?: string }>();
    const { email, fullName, userRole } = useUserRole();
    const navigate = useNavigate();
    const [project, setProject] = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

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

    if (loading) {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Carregando dados do projeto...</div>;
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
                <AlertCircle className="w-16 h-16 text-amber-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Projeto não encontrado</h1>
                <p className="text-slate-400 text-center max-w-md mb-8">
                    {isPreviewMode
                        ? 'Este projeto ainda não possui dados de tráfego para visualização do cliente.'
                        : <>Não encontramos um projeto de Tráfego vinculado ao email <strong>{email}</strong>. Entre em contato com o suporte se acredita que isso é um erro.</>
                    }
                </p>
                <button
                    onClick={() => isPreviewMode ? navigate(-1) : handleLogout()}
                    className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                >
                    {isPreviewMode ? 'Voltar' : 'Sair'}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans flex">
            {/* Preview Mode Banner */}
            {isPreviewMode && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2 px-4 flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                        <Eye size={16} />
                        <span>Modo Preview — Visualizando como o cliente <strong>{project.acceptance?.name}</strong> vê este painel</span>
                    </div>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
                    >
                        <ArrowLeft size={14} />
                        Voltar ao Painel
                    </button>
                </div>
            )}

            {/* Sidebar */}
            <aside className={`w-64 border-r border-slate-800/50 bg-slate-900/50 backdrop-blur-xl fixed h-full z-20 hidden md:flex flex-col ${isPreviewMode ? 'pt-10' : ''}`}>
                <div className="p-6 border-b border-slate-800/50">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                        C4 Marketing
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Área do Cliente</p>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'overview'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                            }`}
                    >
                        <LayoutDashboard size={20} />
                        <span className="font-medium">Visão Geral</span>
                    </button>

                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all opacity-50 cursor-not-allowed" title="Em breve">
                        <BarChart3 size={20} />
                        <span className="font-medium">Relatórios</span>
                    </button>

                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all opacity-50 cursor-not-allowed" title="Em breve">
                        <FileText size={20} />
                        <span className="font-medium">Financeiro</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-slate-800/50">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold">
                            {(isPreviewMode ? project.acceptance?.name : fullName)?.charAt(0) || '?'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate">{isPreviewMode ? project.acceptance?.name : (fullName || 'Cliente')}</p>
                            <p className="text-xs text-slate-500 truncate">{isPreviewMode ? project.acceptance?.email : email}</p>
                        </div>
                    </div>
                    {!isPreviewMode && (
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
                        >
                            <LogOut size={16} />
                            Sair
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 md:ml-64 p-8 ${isPreviewMode ? 'pt-18' : ''}`}>
                <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">{project.acceptance?.company_name || project.acceptance?.name || 'Seu Projeto'}</h1>
                        <p className="text-slate-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Projeto Ativo desde {new Date(project.created_at).toLocaleDateString('pt-BR')}
                        </p>
                    </div>
                </header>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <p className="text-slate-400 text-sm mb-2">Status do Projeto</p>
                        <div className="text-2xl font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="text-green-500" />
                            Em Execução
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <p className="text-slate-400 text-sm mb-2">Campanhas Ativas</p>
                        <div className="text-2xl font-bold text-white flex items-center gap-2">
                            <PieChart className="text-amber-500" />
                            {campaigns.filter(c => c.status === 'active').length}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <p className="text-slate-400 text-sm mb-2">Próxima Reunião</p>
                        <div className="text-xl font-bold text-white flex items-center gap-2">
                            <Clock className="text-blue-500" />
                            A definir
                        </div>
                    </div>
                </div>

                {/* Campaigns List */}
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <LayoutDashboard className="text-amber-500" />
                    Campanhas
                </h2>

                <div className="space-y-6">
                    {campaigns.length === 0 ? (
                        <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-slate-500">
                            Nenhuma campanha encontrada neste projeto.
                        </div>
                    ) : (
                        campaigns.map((campaign) => (
                            <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/20">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-slate-800 rounded-xl">
                                            <BarChart3 className="text-amber-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{campaign.name}</h3>
                                            <p className="text-xs text-slate-400 uppercase tracking-widest">{campaign.platform}</p>
                                        </div>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold border ${campaign.status === 'active'
                                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                        : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>
                                        {campaign.status === 'active' ? 'ATIVA' : 'PAUSADA'}
                                    </div>
                                </div>

                                <div className="p-6">
                                    <h4 className="text-sm font-medium text-slate-400 mb-4">Cronograma de Execução</h4>
                                    <div className="space-y-4">
                                        {campaign.timeline && campaign.timeline.length > 0 ? (
                                            campaign.timeline.map((step: any, index: number) => (
                                                <div key={step.id} className="flex gap-4">
                                                    <div className="flex flex-col items-center">
                                                        <div className={`w-3 h-3 rounded-full mt-1.5 ${step.status === 'completed' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' :
                                                            step.status === 'in_progress' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                                                                'bg-slate-700'
                                                            }`}></div>
                                                        {index < campaign.timeline.length - 1 && (
                                                            <div className="w-0.5 flex-1 bg-slate-800 my-1"></div>
                                                        )}
                                                    </div>
                                                    <div className="pb-6">
                                                        <p className={`text-sm font-medium ${step.status === 'completed' ? 'text-green-400 line-through opacity-70' :
                                                            step.status === 'in_progress' ? 'text-white' :
                                                                'text-slate-500'
                                                            }`}>
                                                            {step.title}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-600 italic">Cronograma não definido.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
};

export default ClientDashboard;
