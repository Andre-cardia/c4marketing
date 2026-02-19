import React, { useState } from 'react';
import { BarChart3, CheckCircle2, Clock, ChevronDown, Rocket, TrendingUp, Calendar, PieChart, Activity } from 'lucide-react';

interface TrafficProjectViewProps {
    project: any;
    campaigns: any[];
}

export const TrafficProjectView: React.FC<TrafficProjectViewProps> = ({ project, campaigns }) => {
    const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});

    const toggleCampaign = (campaignId: string) => {
        setExpandedCampaigns(prev => ({
            ...prev,
            [campaignId]: !prev[campaignId]
        }));
    };

    return (
        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-[#1E293B] rounded-2xl p-6 md:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden group transition-colors duration-300">
            {/* Decorative Background Element */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#F06C6C]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="p-2 bg-[#F06C6C]/10 rounded-lg border border-[#F06C6C]/20">
                    <Rocket className="text-[#F06C6C] w-6 h-6" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-montserrat">Gestão de Tráfego</h2>
            </div>

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Activity size={80} className="text-[#F06C6C] transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Status do Projeto</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#F06C6C]/10 flex items-center justify-center">
                                    <Activity className="text-[#F06C6C] w-4 h-4" />
                                </div>
                                Em Execução
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <TrendingUp size={12} className="text-[#F06C6C]" />
                            <span>Tudo operando normalmente</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <PieChart size={80} className="text-blue-500 transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Campanhas Ativas</p>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                    <PieChart className="text-blue-500 w-4 h-4" />
                                </div>
                                {campaigns.filter(c => c.status === 'active').length}
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <TrendingUp size={12} className="text-blue-500" />
                            <span>Estratégias em andamento</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] p-5 rounded-xl relative overflow-hidden group hover:border-[#334155] transition-all">
                        <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Calendar size={80} className="text-purple-500 transform translate-x-4 -translate-y-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider font-montserrat">Próxima Reunião</p>
                            <div className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                                    <Calendar className="text-purple-500 w-4 h-4" />
                                </div>
                                <span className="truncate">A definir</span>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#1E293B] text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <Clock size={12} className="text-purple-500" />
                            <span>Agendamento pendente</span>
                        </div>
                    </div>
                </div>

                {/* Campaigns List */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest font-montserrat px-1">Campanhas</h3>

                    <div className="space-y-4">
                        {campaigns.length === 0 ? (
                            <div className="p-12 border border-dashed border-slate-300 dark:border-[#1E293B] rounded-xl text-center bg-slate-50 dark:bg-[#0F172A]/50">
                                <div className="w-16 h-16 bg-slate-200 dark:bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <BarChart3 className="text-slate-500 dark:text-slate-600" size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 font-montserrat">Nenhuma campanha encontrada</h3>
                                <p className="text-slate-500">Aguarde enquanto nossa equipe configura seus primeiros projetos.</p>
                            </div>
                        ) : (
                            campaigns.map((campaign) => {
                                // Standard phases definition
                                const STANDARD_PHASES = [
                                    { id: 'planning', title: 'Planejamento' },
                                    { id: 'creatives', title: 'Criativos' },
                                    { id: 'execution', title: 'Execução' },
                                    { id: 'analysis', title: 'Análise e Otimização' },
                                    { id: 'finalization', title: 'Finalização' }
                                ];

                                // Determine active phase based on DB timeline or default to Planning
                                let activePhaseIndex = 0;

                                if (campaign.timeline && Array.isArray(campaign.timeline) && campaign.timeline.length > 0) {
                                    const normalize = (s: any) => (typeof s === 'string' ? s : '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                                    campaign.timeline.forEach((dbStep: any) => {
                                        if (!dbStep || !dbStep.title) return;

                                        const matchIndex = STANDARD_PHASES.findIndex(p => normalize(p.title) === normalize(dbStep.title));
                                        if (matchIndex !== -1) {
                                            if (dbStep.status === 'completed' && matchIndex >= activePhaseIndex) {
                                                activePhaseIndex = Math.min(matchIndex + 1, STANDARD_PHASES.length - 1);
                                            } else if (dbStep.status === 'in_progress' && matchIndex >= activePhaseIndex) {
                                                activePhaseIndex = matchIndex;
                                            }
                                        }
                                    });
                                }

                                const activePhase = STANDARD_PHASES[activePhaseIndex] || STANDARD_PHASES[0];

                                // Determine Campaign Status Label
                                let statusLabel = 'NÃO VEICULADO';
                                let statusColorClass = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
                                let statusDotClass = 'bg-slate-400 dark:bg-slate-500';

                                if (activePhase.title === 'Execução') {
                                    statusLabel = 'EM VEICULAÇÃO';
                                    statusColorClass = 'bg-[#F06C6C]/10 text-[#F06C6C] border-[#F06C6C]/20';
                                    statusDotClass = 'bg-[#F06C6C] animate-pulse';
                                } else if (activePhase.title === 'Análise e Otimização') {
                                    statusLabel = 'EM REVISÃO';
                                    statusColorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                                    statusDotClass = 'bg-blue-400 animate-pulse';
                                }

                                const isExpanded = expandedCampaigns[campaign.id];

                                return (
                                    <div key={campaign.id} className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-xl overflow-hidden hover:border-slate-300 dark:hover:border-[#334155] transition-colors">
                                        <div
                                            className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#1E293B]/50 transition-colors"
                                            onClick={() => toggleCampaign(campaign.id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white dark:bg-[#1E293B] rounded-lg flex items-center justify-center border border-slate-200 dark:border-[#334155]">
                                                    <BarChart3 className="text-[#F06C6C] w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white tracking-tight font-montserrat">{campaign.name}</h3>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-white dark:bg-[#1E293B] rounded border border-slate-200 dark:border-[#334155]">{campaign.platform}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 self-start md:self-auto">
                                                <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold border uppercase tracking-widest flex items-center gap-2 ${statusColorClass}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`}></span>
                                                    {statusLabel}
                                                </div>
                                                <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                            <div className="overflow-hidden">
                                                <div className="p-6 pt-0 border-t border-slate-200 dark:border-[#1E293B]/50">
                                                    <h4 className="text-xs font-bold text-slate-500 mb-6 mt-6 uppercase tracking-widest flex items-center gap-2">
                                                        <Clock size={14} />
                                                        Linha do Tempo
                                                    </h4>
                                                    <div className="space-y-0 relative pl-2">
                                                        {/* Vertical Line */}
                                                        <div className="absolute left-[27px] top-2 bottom-4 w-px bg-slate-200 dark:bg-[#1E293B]"></div>

                                                        {STANDARD_PHASES.map((phase, index) => {
                                                            let stepStatus = 'pending';
                                                            if (index < activePhaseIndex) stepStatus = 'completed';
                                                            else if (index === activePhaseIndex) stepStatus = 'in_progress';

                                                            return (
                                                                <div key={phase.id} className="relative flex gap-5 pb-6 last:pb-0 group">
                                                                    <div className="relative z-10 flex-shrink-0">
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${stepStatus === 'completed'
                                                                            ? 'bg-slate-50 dark:bg-[#0F172A] border-[#F06C6C]'
                                                                            : stepStatus === 'in_progress'
                                                                                ? 'bg-slate-50 dark:bg-[#0F172A] border-[#F06C6C]'
                                                                                : 'bg-slate-50 dark:bg-[#0F172A] border-slate-200 dark:border-[#1E293B]'
                                                                            }`}>
                                                                            {stepStatus === 'completed' && <CheckCircle2 size={14} className="text-[#F06C6C]" />}
                                                                            {stepStatus === 'in_progress' && <div className="w-2.5 h-2.5 bg-[#F06C6C] rounded-full animate-pulse" />}
                                                                            {stepStatus === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />}
                                                                        </div>
                                                                    </div>
                                                                    <div className="pt-1 flex-grow flex items-center justify-between">
                                                                        <p className={`text-sm font-semibold transition-colors ${stepStatus === 'completed' ? 'text-slate-900 dark:text-white' :
                                                                            stepStatus === 'in_progress' ? 'text-slate-900 dark:text-white' :
                                                                                'text-slate-400 dark:text-slate-600'
                                                                            }`}>
                                                                            {phase.title}
                                                                        </p>

                                                                        {stepStatus === 'in_progress' && (
                                                                            <span className="text-[10px] font-bold text-[#F06C6C] uppercase tracking-wider">
                                                                                EM ANDAMENTO
                                                                            </span>
                                                                        )}
                                                                        {stepStatus === 'completed' && (
                                                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-600 uppercase tracking-wider">
                                                                                CONCLUÍDO
                                                                            </span>
                                                                        )}
                                                                        {stepStatus === 'pending' && (
                                                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-700 uppercase tracking-wider">
                                                                                AGUARDANDO
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
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
