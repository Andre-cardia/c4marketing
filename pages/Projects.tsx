import React, { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Plus, Folder, ExternalLink, Activity, Globe, ShoppingCart, BarChart, Server, Layout, ArrowUpDown, ArrowUp, ArrowDown, Calendar, User, Search } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';

interface Project {
    id: number;
    proposal_id: number;
    company_name: string;
    responsible_name: string;
    status: string;
    services: any[];
    created_at: string;
    slug: string;
}

type SortKey = 'company_name' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

const Projects: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
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

            const projectsData: Project[] = [];

            for (const acc of acceptances) {
                let services: any[] = [];
                let slug = '';

                if (acc.contract_snapshot && acc.contract_snapshot.proposal) {
                    services = acc.contract_snapshot.proposal.services || [];
                    slug = acc.contract_snapshot.proposal.slug || '';
                } else if (acc.proposal_id) {
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

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedProjects = useMemo(() => {
        let sorted = [...projects];

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            sorted = sorted.filter(p =>
                p.company_name.toLowerCase().includes(lowerTerm) ||
                p.responsible_name.toLowerCase().includes(lowerTerm)
            );
        }

        sorted.sort((a, b) => {
            if (sortConfig.key === 'company_name') {
                return sortConfig.direction === 'asc'
                    ? a.company_name.localeCompare(b.company_name)
                    : b.company_name.localeCompare(a.company_name);
            } else {
                return sortConfig.direction === 'asc'
                    ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });

        return sorted;
    }, [projects, sortConfig, searchTerm]);

    const getSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="w-4 h-4 opacity-30" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4 text-brand-coral" /> : <ArrowDown className="w-4 h-4 text-brand-coral" />;
    };

    const getServiceIcon = (serviceId: string) => {
        switch (serviceId) {
            case 'traffic_management': return <BarChart className="w-4 h-4 text-blue-500" />;
            case 'hosting': return <Server className="w-4 h-4 text-purple-500" />;
            case 'landing_page': return <Layout className="w-4 h-4 text-green-500" />;
            case 'website': return <Globe className="w-4 h-4 text-cyan-500" />;
            case 'ecommerce': return <ShoppingCart className="w-4 h-4 text-orange-500" />;
            case 'consulting': return <Activity className="w-4 h-4 text-red-500" />;
            default: return <Folder className="w-4 h-4 text-slate-400" />;
        }
    };

    const getServiceLabel = (serviceId: string) => {
        switch (serviceId) {
            case 'traffic_management': return 'Tráfego';
            case 'hosting': return 'Hospedagem';
            case 'landing_page': return 'Landing Page';
            case 'website': return 'Website';
            case 'ecommerce': return 'E-commerce';
            case 'consulting': return 'Consultoria';
            default: return 'Serviço';
        }
    };

    const getServiceRoute = (serviceId: string, projectId: number) => {
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
                <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Projetos Ativos</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Gerencie os serviços contratados pelos seus clientes.</p>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar projeto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-coral outline-none transition-all w-64"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400">Carregando projetos...</div>
                ) : projects.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
                        <Folder className="w-12 h-12 mb-4 mx-auto opacity-20" />
                        <p>Nenhum projeto ativo encontrado.</p>
                        <p className="text-xs mt-2">Certifique-se de que os contratos foram aceitos e marcados como 'Ativo'.</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSort('company_name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Empresa
                                                {getSortIcon('company_name')}
                                            </div>
                                        </th>
                                        <th className="p-5 font-bold hidden md:table-cell">Responsável</th>
                                        <th
                                            className="p-5 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                                            onClick={() => handleSort('created_at')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Início
                                                {getSortIcon('created_at')}
                                            </div>
                                        </th>
                                        <th className="p-5 font-bold">Serviços Contratados</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm text-slate-600 dark:text-slate-300">
                                    {sortedProjects.map((project) => (
                                        <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-5">
                                                <div className="font-bold text-slate-800 dark:text-white">{project.company_name}</div>
                                                <div className="md:hidden text-xs text-slate-400">{project.responsible_name}</div>
                                            </td>
                                            <td className="p-5 hidden md:table-cell">
                                                <div className="flex items-center gap-2">
                                                    <User className="w-4 h-4 text-slate-300" />
                                                    {project.responsible_name}
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-slate-300" />
                                                    {new Date(project.created_at).toLocaleDateString('pt-BR')}
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex flex-wrap gap-2">
                                                    {project.services && project.services.length > 0 ? (
                                                        project.services.map((service: any, index: number) => {
                                                            const serviceId = typeof service === 'string' ? service : service.id;
                                                            return (
                                                                <button
                                                                    key={index}
                                                                    onClick={() => navigate(getServiceRoute(serviceId, project.id))}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-white dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 hover:border-brand-coral dark:hover:border-brand-coral transition-all text-xs font-medium group"
                                                                    title={getServiceLabel(serviceId)}
                                                                >
                                                                    {getServiceIcon(serviceId)}
                                                                    <span className="hidden lg:inline">{getServiceLabel(serviceId)}</span>
                                                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-brand-coral" />
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-slate-400 italic text-xs">Nenhum serviço</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Projects;
