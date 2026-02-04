import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Plus, Folder, ExternalLink, Activity, Globe, ShoppingCart, BarChart, Server, Layout } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';

interface Project {
    id: number;
    proposal_id: number;
    company_name: string;
    responsible_name: string;
    status: string;
    services: any[]; // Can be string[] or object[] depending on legacy/new
    created_at: string;
    slug: string;
}

const Projects: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            // Fetch acceptances with status 'Ativo'
            const { data: acceptances, error } = await supabase
                .from('acceptances')
                .select('*')
                .eq('status', 'Ativo')
                .order('timestamp', { ascending: false });

            if (error) throw error;

            if (!acceptances) {
                setProjects([]);
                return;
            }

            // Enrich with proposal data (services, slug, etc)
            const projectsData: Project[] = [];

            for (const acc of acceptances) {
                let services: any[] = [];
                let slug = '';

                // Try to get data from snapshot first (more reliable for history)
                if (acc.contract_snapshot && acc.contract_snapshot.proposal) {
                    services = acc.contract_snapshot.proposal.services || [];
                    slug = acc.contract_snapshot.proposal.slug || '';
                } 
                // Fallback to live proposal if linked
                else if (acc.proposal_id) {
                    const { data: proposal } = await supabase
                        .from('proposals')
                        .select('services, slug')
                        .eq('id', acc.proposal_id)
                        .single();
                    
                    if (proposal) {
                        services = proposal.services || [];
                        slug = proposal.slug || '';
                    }
                }

                projectsData.push({
                    id: acc.id,
                    proposal_id: acc.proposal_id,
                    company_name: acc.company_name,
                    responsible_name: acc.name,
                    status: acc.status,
                    services: services,
                    created_at: acc.timestamp,
                    slug: slug
                });
            }

            setProjects(projectsData);

        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const getServiceIcon = (serviceId: string) => {
        switch (serviceId) {
            case 'traffic_management': return <BarChart className="w-5 h-5 text-blue-500" />;
            case 'hosting': return <Server className="w-5 h-5 text-purple-500" />;
            case 'landing_page': return <Layout className="w-5 h-5 text-green-500" />;
            case 'website': return <Globe className="w-5 h-5 text-cyan-500" />;
            case 'ecommerce': return <ShoppingCart className="w-5 h-5 text-orange-500" />;
            case 'consulting': return <Activity className="w-5 h-5 text-red-500" />;
            default: return <Folder className="w-5 h-5 text-slate-400" />;
        }
    };

    const getServiceLabel = (serviceId: string) => {
        switch (serviceId) {
            case 'traffic_management': return 'Gestão de Tráfego';
            case 'hosting': return 'Hospedagem';
            case 'landing_page': return 'Landing Page';
            case 'website': return 'Website';
            case 'ecommerce': return 'E-commerce';
            case 'consulting': return 'Consultoria';
            default: return 'Serviço';
        }
    };

    const getServiceRoute = (serviceId: string, projectId: number) => {
        // Map service IDs to specific management routes
        switch (serviceId) {
            case 'traffic_management': return `/projects/${projectId}/traffic`;
            case 'hosting': return `/projects/${projectId}/hosting`;
            case 'landing_page': return `/projects/${projectId}/lp`;
            case 'website': return `/projects/${projectId}/website`;
            case 'ecommerce': return `/projects/${projectId}/ecommerce`;
            case 'consulting': return `/projects/${projectId}/consulting`;
            default: return `/projects/${projectId}`;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Projetos Ativos</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Gerencie os serviços contratados pelos seus clientes.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400">Carregando projetos...</div>
                ) : projects.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
                        <Folder className="w-12 h-12 mb-4 mx-auto opacity-20" />
                        <p>Nenhum projeto ativo encontrado.</p>
                        <p className="text-xs mt-2">Certifique-se de que os contratos foram aceitos e marcados como 'Ativo' na aba de Propostas.</p>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => (
                            <div key={project.id} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{project.company_name}</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Desde {new Date(project.created_at).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                        Ativo
                                    </span>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Serviços Contratados</p>
                                    
                                    {project.services && project.services.length > 0 ? (
                                        project.services.map((service: any, index: number) => {
                                            const serviceId = typeof service === 'string' ? service : service.id;
                                            return (
                                                <button 
                                                    key={index}
                                                    onClick={() => navigate(getServiceRoute(serviceId, project.id))}
                                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-600 transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {getServiceIcon(serviceId)}
                                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{getServiceLabel(serviceId)}</span>
                                                    </div>
                                                    <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-brand-coral transition-colors" />
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <div className="text-sm text-slate-400 italic">Sem serviços identificados</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Projects;
