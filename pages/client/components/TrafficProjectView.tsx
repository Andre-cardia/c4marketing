import React, { useState } from 'react';
import { BarChart3, CheckCircle2, Clock, ChevronDown, Rocket, TrendingUp, Calendar, PieChart } from 'lucide-react';

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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CheckCircle2 size={80} className="text-green-500 transform translate-x-4 -translate-y-4" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Status do Projeto</p>
                        <div className="text-2xl font-bold text-white flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                                <CheckCircle2 className="text-green-500 w-4 h-4" />
                            </div>
                            Em Execução
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                        <TrendingUp size={12} className="text-green-500" />
                        <span>Tudo operando normalmente</span>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                        <PieChart size={80} className="text-brand-coral transform translate-x-4 -translate-y-4" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Campanhas Ativas</p>
                        <div className="text-2xl font-bold text-white flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-coral/10 flex items-center justify-center">
                                <PieChart className="text-brand-coral w-4 h-4" />
                            </div>
                            {campaigns.filter(c => c.status === 'active').length}
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                        <TrendingUp size={12} className="text-brand-coral" />
                        <span>Estratégias em andamento</span>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 right-0 p-5 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Calendar size={80} className="text-blue-500 transform translate-x-4 -translate-y-4" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Próxima Reunião</p>
                        <div className="text-xl font-bold text-white flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                <Calendar className="text-blue-500 w-4 h-4" />
                            </div>
                            <span className="truncate">A definir</span>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                        <Clock size={12} className="text-blue-500" />
                        <span>Agendamento pendente</span>
                    </div>
                </div>
            </div>

            {/* Campaigns List */}
            <div>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-3 text-white">
                        <Rocket className="text-brand-coral w-5 h-5" />
                        Gestão de Tráfego
                    </h2>
                </div>

                <div className="space-y-6">
                    {campaigns.length === 0 ? (
                        <div className="p-12 border border-dashed border-slate-800 rounded-3xl text-center bg-slate-900/30">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <BarChart3 className="text-slate-600" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Nenhuma campanha encontrada</h3>
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
                            let statusColorClass = 'bg-slate-800 text-slate-400 border-slate-700';
                            let statusDotClass = 'bg-slate-500';

                            if (activePhase.title === 'Execução') {
                                statusLabel = 'EM VEICULAÇÃO';
                                statusColorClass = 'bg-green-500/10 text-green-400 border-green-500/20';
                                statusDotClass = 'bg-green-500 animate-pulse';
                            } else if (activePhase.title === 'Análise e Otimização') {
                                statusLabel = 'EM REVISÃO';
                                statusColorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                                statusDotClass = 'bg-blue-400 animate-pulse';
                            }

                            const isExpanded = expandedCampaigns[campaign.id];

                            return (
                                <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors">
                                    <div
                                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                                        onClick={() => toggleCampaign(campaign.id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
                                                <BarChart3 className="text-brand-coral w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-white tracking-tight">{campaign.name}</h3>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-slate-800 rounded border border-slate-700">{campaign.platform}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 self-start md:self-auto">
                                            <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold border uppercase tracking-widest flex items-center gap-2 ${statusColorClass}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`}></span>
                                                {statusLabel}
                                            </div>
                                            <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
                                    <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                        <div className="overflow-hidden">
                                            <div className="p-6 pt-0 border-t border-slate-800/50">
                                                <h4 className="text-xs font-bold text-slate-500 mb-6 mt-6 uppercase tracking-widest flex items-center gap-2">
                                                    <Clock size={14} />
                                                    Linha do Tempo
                                                </h4>
                                                <div className="space-y-0 relative pl-2">
                                                    {/* Vertical Line */}
                                                    <div className="absolute left-[27px] top-2 bottom-4 w-px bg-slate-800"></div>

                                                    {STANDARD_PHASES.map((phase, index) => {
                                                        let stepStatus = 'pending';
                                                        if (index < activePhaseIndex) stepStatus = 'completed';
                                                        else if (index === activePhaseIndex) stepStatus = 'in_progress';

                                                        return (
                                                            <div key={phase.id} className="relative flex gap-5 pb-6 last:pb-0 group">
                                                                <div className="relative z-10 flex-shrink-0">
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${stepStatus === 'completed'
                                                                        ? 'bg-slate-900 border-brand-coral'
                                                                        : stepStatus === 'in_progress'
                                                                            ? 'bg-slate-900 border-brand-coral'
                                                                            : 'bg-slate-900 border-slate-800'
                                                                        }`}>
                                                                        {stepStatus === 'completed' && <CheckCircle2 size={14} className="text-brand-coral" />}
                                                                        {stepStatus === 'in_progress' && <div className="w-2.5 h-2.5 bg-brand-coral rounded-full animate-pulse" />}
                                                                        {stepStatus === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />}
                                                                    </div>
                                                                </div>
                                                                <div className="pt-1 flex-grow flex items-center justify-between">
                                                                    <p className={`text-sm font-semibold transition-colors ${stepStatus === 'completed' ? 'text-white' :
                                                                        stepStatus === 'in_progress' ? 'text-white' :
                                                                            'text-slate-600'
                                                                        }`}>
                                                                        {phase.title}
                                                                    </p>

                                                                    {stepStatus === 'in_progress' && (
                                                                        <span className="text-[10px] font-bold text-brand-coral uppercase tracking-wider">
                                                                            EM ANDAMENTO
                                                                        </span>
                                                                    )}
                                                                    {stepStatus === 'completed' && (
                                                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                                                            CONCLUÍDO
                                                                        </span>
                                                                    )}
                                                                    {stepStatus === 'pending' && (
                                                                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
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
    );
};
