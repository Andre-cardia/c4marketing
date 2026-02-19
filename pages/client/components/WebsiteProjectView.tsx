import React from 'react';
import { Globe, Code, PenTool, Search, Layout, AppWindow } from 'lucide-react';

interface WebsiteProjectViewProps {
    project: any;
    websites: any[];
}

export const WebsiteProjectView: React.FC<WebsiteProjectViewProps> = ({ project, websites }) => {

    // Example status mapping - adapt as needed
    const getStatusInfo = (status: string) => {
        switch (status) {
            case 'completed': return { label: 'Concluído', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
            case 'in_progress': return { label: 'Em Desenvolvimento', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
            default: return { label: 'Pendente', color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
        }
    };

    return (
        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-[#1E293B] rounded-2xl p-6 md:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden group transition-colors duration-300">
            {/* Decorative Background Element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#F06C6C]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="p-2 bg-[#F06C6C]/10 rounded-lg border border-[#F06C6C]/20">
                    <Globe className="text-[#F06C6C] w-6 h-6" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-montserrat">Desenvolvimento de Sites</h2>
            </div>

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Code size={80} className="text-[#F06C6C] transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Semanas de Desenvolvimento</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#F06C6C]/10 flex items-center justify-center">
                                    <Code className="text-[#F06C6C] w-4 h-4" />
                                </div>
                                {Math.floor((Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1}
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <AppWindow size={12} className="text-[#F06C6C]" />
                            <span>Progresso contínuo</span>
                        </div>
                    </div>
                </div>

                {/* Websites List */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest font-montserrat px-1">Projetos Web</h3>
                    <div className="space-y-6">
                        {websites.length === 0 ? (
                            <div className="p-12 border border-dashed border-slate-300 dark:border-[#1E293B] rounded-xl text-center bg-slate-50 dark:bg-[#0F172A]/50">
                                <div className="w-16 h-16 bg-slate-200 dark:bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Globe className="text-slate-500 dark:text-slate-600" size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 font-montserrat">Nenhum site em desenvolvimento</h3>
                                <p className="text-slate-500">Seus projetos de website aparecerão aqui assim que iniciados.</p>
                            </div>
                        ) : (
                            websites.map((site) => {
                                const status = getStatusInfo(site.status || 'in_progress');
                                return (
                                    <div key={site.id} className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-6 rounded-xl hover:border-slate-300 dark:hover:border-[#334155] transition-all">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-white dark:bg-[#1E293B] rounded-xl flex items-center justify-center border border-slate-200 dark:border-[#334155]">
                                                    <Globe className="text-[#F06C6C] w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white font-montserrat">{site.domain || 'Dominio Pendente'}</h3>
                                                    <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F06C6C] hover:underline flex items-center gap-1 mt-1">
                                                        Acessar site <Search size={10} />
                                                    </a>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full md:w-auto">
                                                <div className="flex flex-col items-center p-3 bg-white dark:bg-[#1E293B]/50 rounded-lg border border-slate-200 dark:border-[#1E293B]">
                                                    <span className="text-xs text-slate-500 font-bold uppercase mb-1">Design</span>
                                                    <PenTool size={16} className="text-[#F06C6C]" />
                                                </div>
                                                <div className="flex flex-col items-center p-3 bg-white dark:bg-[#1E293B]/50 rounded-lg border border-slate-200 dark:border-[#1E293B]">
                                                    <span className="text-xs text-slate-500 font-bold uppercase mb-1">Conteúdo</span>
                                                    <Layout size={16} className="text-[#F06C6C]" />
                                                </div>
                                                <div className="flex flex-col items-center p-3 bg-white dark:bg-[#1E293B]/50 rounded-lg border border-slate-200 dark:border-[#1E293B]">
                                                    <span className="text-xs text-slate-500 font-bold uppercase mb-1">Dev</span>
                                                    <Code size={16} className="text-[#F06C6C]" />
                                                </div>
                                                <div className={`flex flex-col items-center p-3 rounded-lg border ${status.bg} ${status.border}`}>
                                                    <span className="text-xs text-slate-500 font-bold uppercase mb-1">Status</span>
                                                    <span className={`text-xs font-bold ${status.color}`}>{status.label}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
