import React from 'react';
import { Layout, CheckCircle2, Clock, CheckCircle, File, LayoutTemplate, MessageSquare, Settings, TrendingUp } from 'lucide-react';

interface LandingPageProjectViewProps {
    project: any;
    pages: any[];
}

export const LandingPageProjectView: React.FC<LandingPageProjectViewProps> = ({ project, pages }) => {

    const STATUS_FLOW = [
        { id: 'content_received', label: 'Recebimento de Conteúdos', icon: File },
        { id: 'design', label: 'Design e Template', icon: LayoutTemplate },
        { id: 'approval', label: 'Aprovação', icon: MessageSquare },
        { id: 'adjustments', label: 'Ajustes', icon: Settings },
        { id: 'delivered', label: 'Entrega', icon: CheckCircle }
    ];

    const getStatusIndex = (status: string) => STATUS_FLOW.findIndex(s => s.id === status);

    return (
        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-[#1E293B] rounded-2xl p-6 md:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden group transition-colors duration-300">
            {/* Decorative Background Element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#F06C6C]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="p-2 bg-[#F06C6C]/10 rounded-lg border border-[#F06C6C]/20">
                    <Layout className="text-[#F06C6C] w-6 h-6" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-montserrat">Gestão de Landing Pages</h2>
            </div>

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <CheckCircle2 size={80} className="text-green-500 transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Status do Projeto</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                                    <CheckCircle2 className="text-green-500 w-4 h-4" />
                                </div>
                                {project.briefing_status === 'completed' ? 'Em Desenvolvimento' : 'Aguardando Briefing'}
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <TrendingUp size={12} className="text-green-500" />
                            <span>Progresso na linha do tempo</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Layout size={80} className="text-[#F06C6C] transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Páginas em Produção</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#F06C6C]/10 flex items-center justify-center">
                                    <Layout className="text-[#F06C6C] w-4 h-4" />
                                </div>
                                {pages.length}
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <TrendingUp size={12} className="text-[#F06C6C]" />
                            <span>Landing Pages</span>
                        </div>
                    </div>
                </div>

                {/* Pages List */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest font-montserrat px-1">Páginas</h3>

                    <div className="space-y-6">
                        {pages.length === 0 ? (
                            <div className="p-12 border border-dashed border-slate-300 dark:border-[#1E293B] rounded-xl text-center bg-slate-50 dark:bg-[#0F172A]/50">
                                <div className="w-16 h-16 bg-slate-200 dark:bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Layout className="text-slate-500 dark:text-slate-600" size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 font-montserrat">Nenhuma Landing Page encontrada</h3>
                                <p className="text-slate-500">Estamos preparando suas páginas. Em breve aparecerão aqui.</p>
                            </div>
                        ) : (
                            pages.map(page => (
                                <div key={page.id} className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-0 rounded-2xl shadow-lg relative overflow-hidden">
                                    {/* Page Header */}
                                    <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1E293B] flex items-center justify-between bg-slate-100 dark:bg-[#1E293B]/30">
                                        <div className="flex items-center gap-3">
                                            <span className="p-2 bg-[#F06C6C]/10 text-[#F06C6C] rounded-lg border border-[#F06C6C]/20">
                                                <Layout size={20} />
                                            </span>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-montserrat">{page.name}</h3>
                                        </div>
                                        <span className="text-xs font-mono text-slate-500">{new Date(page.created_at).toLocaleDateString()}</span>
                                    </div>

                                    {/* Status Flow */}
                                    <div className="p-6">
                                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                            {STATUS_FLOW.map((step, idx) => {
                                                const currentIndex = getStatusIndex(page.status);
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
                                                            ${isCurrent ? 'text-[#F06C6C]' : isCompleted ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}
                                                        `}>
                                                            <step.icon size={28} />
                                                        </div>
                                                        <span className={`text-sm font-bold text-center
                                                            ${isCurrent ? 'text-[#F06C6C]' : isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}
                                                        `}>
                                                            {step.label}
                                                        </span>

                                                        {isCurrent && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#F06C6C]"></div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
