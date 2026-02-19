import React from 'react';
import { Globe, CheckCircle2, Layout, File, LayoutTemplate, MessageSquare, Settings, TrendingUp, CheckCircle } from 'lucide-react';

interface WebsiteProjectViewProps {
    project: any;
    websites: any[];
}

export const WebsiteProjectView: React.FC<WebsiteProjectViewProps> = ({ project, websites }) => {

    // Define the specific timeline flow for Websites (matching the screenshot)
    const STATUS_FLOW = [
        { id: 'content_received', label: 'Recebimento de Conteúdos', icon: File },
        { id: 'design', label: 'Design e Template', icon: LayoutTemplate },
        { id: 'approval', label: 'Aprovação', icon: MessageSquare },
        { id: 'adjustments', label: 'Ajustes', icon: Settings },
        { id: 'delivered', label: 'Entrega', icon: CheckCircle }
    ];

    // Helper to determine active step based on status
    const getStatusIndex = (status: string) => {
        // Map database status to flow index
        // If status is not found, default to -1 (nothing started) or 0 (first step) depending on logic
        const index = STATUS_FLOW.findIndex(s => s.id === status);
        if (index !== -1) return index;

        // Fallback mapping if DB uses different strings
        if (status === 'completed') return STATUS_FLOW.length - 1;
        if (status === 'in_progress') return 1; // Assuming design phase
        return 0; // Default start
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
                            <LayoutTemplate size={80} className="text-[#F06C6C] transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Semanas de Desenvolvimento</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#F06C6C]/10 flex items-center justify-center">
                                    <LayoutTemplate className="text-[#F06C6C] w-4 h-4" />
                                </div>
                                {/* Simple calculation for dev weeks */}
                                {Math.floor((Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1}
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <TrendingUp size={12} className="text-[#F06C6C]" />
                            <span>Progresso do Projeto</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Globe size={80} className="text-blue-500 transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Sites em Produção</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                    <Globe className="text-blue-500 w-4 h-4" />
                                </div>
                                {websites.length}
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <TrendingUp size={12} className="text-blue-500" />
                            <span>Domínios Ativos</span>
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
                                return (
                                    <div key={site.id} className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-0 rounded-2xl shadow-lg relative overflow-hidden transition-all">

                                        {/* Site Header */}
                                        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1E293B] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-100 dark:bg-[#1E293B]/30">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-[#F06C6C]/10 text-[#F06C6C] rounded-lg border border-[#F06C6C]/20">
                                                    <Globe size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white font-montserrat">{site.domain || 'Dominio Pendente'}</h3>
                                                    {site.domain && (
                                                        <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F06C6C] hover:underline flex items-center gap-1">
                                                            {site.domain}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-xs font-mono text-slate-500 self-start md:self-center">{new Date(site.created_at).toLocaleDateString()}</span>
                                        </div>

                                        {/* Status Timeline */}
                                        <div className="p-6">
                                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                                {STATUS_FLOW.map((step, idx) => {
                                                    const currentIndex = getStatusIndex(site.status);
                                                    const isCompleted = idx <= currentIndex;
                                                    const isCurrent = idx === currentIndex;

                                                    return (
                                                        <div
                                                            key={step.id}
                                                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all group relative overflow-hidden
                                                                ${isCurrent
                                                                    ? 'border-[#F06C6C]/50 bg-[#F06C6C]/10'
                                                                    : isCompleted
                                                                        ? 'border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5'
                                                                        : 'border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#0B1221]/50 opacity-60'
                                                                }
                                                            `}
                                                        >
                                                            <div className={`mb-3 transition-transform 
                                                                ${isCurrent ? 'text-[#F06C6C] scale-110' : isCompleted ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}
                                                            `}>
                                                                <step.icon size={28} />
                                                            </div>
                                                            <span className={`text-xs font-bold text-center uppercase tracking-wide
                                                                ${isCurrent ? 'text-[#F06C6C]' : isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}
                                                            `}>
                                                                {step.label}
                                                            </span>

                                                            {isCurrent && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#F06C6C] animate-pulse"></div>}
                                                        </div>
                                                    );
                                                })}
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
