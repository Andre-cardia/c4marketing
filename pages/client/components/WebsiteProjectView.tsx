import React from 'react';
import { Globe, CheckCircle2, Clock, CheckCircle, File, LayoutTemplate, MessageSquare, Settings, TrendingUp } from 'lucide-react';

interface WebsiteProjectViewProps {
    project: any;
    websites: any[];
}

export const WebsiteProjectView: React.FC<WebsiteProjectViewProps> = ({ project, websites }) => {

    const STATUS_FLOW = [
        { id: 'content_received', label: 'Recebimento de Conteúdos', icon: File },
        { id: 'design', label: 'Design e Template', icon: LayoutTemplate },
        { id: 'approval', label: 'Aprovação', icon: MessageSquare },
        { id: 'adjustments', label: 'Ajustes', icon: Settings },
        { id: 'delivered', label: 'Entrega', icon: CheckCircle }
    ];

    const getStatusIndex = (status: string) => STATUS_FLOW.findIndex(s => s.id === status);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CheckCircle2 size={80} className="text-cyan-500 transform translate-x-4 -translate-y-4" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Status do Projeto</p>
                        <div className="text-2xl font-bold text-white flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
                                <CheckCircle2 className="text-cyan-500 w-4 h-4" />
                            </div>
                            {project.briefing_status === 'completed' ? 'Em Desenvolvimento' : 'Aguardando Briefing'}
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                        <TrendingUp size={12} className="text-cyan-500" />
                        <span>Progresso na linha do tempo</span>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Globe size={80} className="text-cyan-500 transform translate-x-4 -translate-y-4" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Sites em Produção</p>
                        <div className="text-2xl font-bold text-white flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
                                <Globe className="text-cyan-500 w-4 h-4" />
                            </div>
                            {websites.length}
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                        <TrendingUp size={12} className="text-cyan-500" />
                        <span>Web Sites</span>
                    </div>
                </div>
            </div>

            {/* Sites List */}
            <div>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-3 text-white">
                        <Globe className="text-cyan-500 w-5 h-5" />
                        Gestão de Web Sites
                    </h2>
                </div>

                <div className="space-y-6">
                    {websites.length === 0 ? (
                        <div className="p-12 border border-dashed border-slate-800 rounded-3xl text-center bg-slate-900/30">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Globe className="text-slate-600" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Nenhum Site encontrado</h3>
                            <p className="text-slate-500">Estamos preparando seus sites. Em breve aparecerão aqui.</p>
                        </div>
                    ) : (
                        websites.map(site => (
                            <div key={site.id} className="bg-slate-900 border border-slate-800 p-0 rounded-2xl shadow-lg relative overflow-hidden">
                                {/* Page Header */}
                                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                                            <Globe size={20} />
                                        </span>
                                        <h3 className="text-lg font-bold text-white">{site.name}</h3>
                                    </div>
                                    <span className="text-xs font-mono text-slate-500">{new Date(site.created_at).toLocaleDateString()}</span>
                                </div>

                                {/* Status Flow */}
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
                                                            ? 'border-brand-coral/50 bg-brand-coral/10'
                                                            : isCompleted
                                                                ? 'border-emerald-500/20 bg-emerald-500/5'
                                                                : 'border-slate-800 bg-slate-900/50 opacity-60'
                                                        }
                                                    `}
                                                >
                                                    <div className={`mb-3 transition-transform 
                                                        ${isCurrent ? 'text-brand-coral' : isCompleted ? 'text-emerald-400' : 'text-slate-500'}
                                                    `}>
                                                        <step.icon size={28} />
                                                    </div>
                                                    <span className={`text-sm font-bold text-center
                                                        ${isCurrent ? 'text-brand-coral' : isCompleted ? 'text-emerald-400' : 'text-slate-500'}
                                                    `}>
                                                        {step.label}
                                                    </span>

                                                    {isCurrent && <div className="absolute bottom-0 left-0 w-full h-1 bg-brand-coral"></div>}
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
    );
};
