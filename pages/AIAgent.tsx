import React, { useState } from 'react';
import Header from '../components/Header';
import { analyzeSystem, AgentReport } from '../lib/ai-agent';
import { Bot, Loader2, AlertTriangle, Sparkles, CheckCircle, TrendingUp, Users, Calendar, Clock, ChevronRight } from 'lucide-react';

export default function AIAgent() {
    const [report, setReport] = useState<AgentReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await analyzeSystem();
            console.log('analysis result:', result);
            setReport(result);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Falha ao executar a análise da IA.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 transition-colors duration-200 selection:bg-brand-coral/30">
            <Header />

            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-brand-coral/5 rounded-full blur-[128px]" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[128px]" />
            </div>

            <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">

                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 shadow-lg ring-1 ring-white/5">
                            <Bot className="w-8 h-8 text-brand-coral drop-shadow-[0_0_8px_rgba(255,100,100,0.5)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-light text-white tracking-tight">AI Manager</h1>
                            <p className="text-slate-400 text-sm font-light tracking-wide">Monitoramento inteligente e análise estratégica</p>
                        </div>
                    </div>

                    <button
                        onClick={runAnalysis}
                        disabled={loading}
                        className="group relative flex items-center gap-3 px-8 py-3 bg-brand-coral/10 hover:bg-brand-coral/20 text-brand-coral rounded-full font-medium transition-all shadow-[0_0_20px_rgba(255,100,100,0.1)] hover:shadow-[0_0_30px_rgba(255,100,100,0.2)] disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-md border border-brand-coral/20 hover:border-brand-coral/40"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="tracking-wide">ANALISANDO...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 text-brand-coral group-hover:scale-110 transition-transform duration-500" />
                                <span className="tracking-wide">NOVA ANÁLISE</span>
                            </>
                        )}
                        <div className="absolute inset-0 rounded-full ring-1 ring-white/5 group-hover:ring-brand-coral/20 transition-all pointer-events-none" />
                    </button>
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-8 p-4 bg-red-500/10 backdrop-blur-md border border-red-500/20 rounded-2xl flex items-start gap-3 shadow-[0_0_30px_rgba(220,38,38,0.1)]">
                        <div className="p-2 bg-red-500/20 rounded-full">
                            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                        </div>
                        <div>
                            <h3 className="font-bold text-red-400 text-sm tracking-wide uppercase">Erro na Análise</h3>
                            <p className="text-red-300/80 text-sm mt-1 font-light leading-relaxed">{error}</p>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!report && !loading && !error && (
                    <div className="flex flex-col items-center justify-center py-32 bg-white/5 backdrop-blur-sm rounded-[2.5rem] border border-white/5 border-dashed text-center px-6 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:via-brand-coral/20 transition-all duration-700" />

                        <div className="w-24 h-24 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-md rounded-full flex items-center justify-center mb-8 border border-white/5 shadow-2xl ring-1 ring-white/5 group-hover:scale-110 transition-transform duration-700 ease-out">
                            <Bot className="w-10 h-10 text-slate-500 group-hover:text-brand-coral transition-colors duration-500" />
                        </div>
                        <h3 className="text-2xl font-light text-white tracking-wide">Pronto para iniciar</h3>
                        <p className="text-slate-400 mt-3 max-w-md mx-auto text-sm font-light leading-relaxed">
                            O Gerente Geral está aguardando para analisar as tarefas, propostas e atividades recentes do sistema.
                        </p>
                    </div>
                )}

                {/* Loading Skeleton */}
                {loading && !report && (
                    <div className="space-y-6 animate-pulse">
                        <div className="h-40 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 p-8"></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="h-32 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5"></div>
                            <div className="h-32 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5"></div>
                            <div className="h-32 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5"></div>
                        </div>
                        <div className="h-96 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5"></div>
                    </div>
                )}

                {/* Analysis Report UI */}
                {report && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

                        {/* Executive Summary Card */}
                        <div className="relative bg-slate-900/40 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl ring-1 ring-white/5 overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-coral/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-brand-coral/10 transition-all duration-700" />

                            <h2 className="text-sm font-bold text-brand-coral mb-4 flex items-center gap-2 uppercase tracking-widest relative z-10">
                                <Sparkles className="w-4 h-4" />
                                Resumo Executivo
                            </h2>
                            <p className="text-slate-200 text-sm leading-relaxed font-light relative z-10">
                                {report.executiveSummary}
                            </p>
                            <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-medium relative z-10">
                                <Clock className="w-3 h-3" />
                                Atualizado: {new Date(report.timestamp).toLocaleString()}
                            </div>
                        </div>

                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Proposals KPI */}
                            <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/5 shadow-lg ring-1 ring-white/5 flex flex-col justify-between group hover:bg-white/10 transition-all duration-500">
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Vendas</span>
                                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                                        <TrendingUp className="w-4 h-4" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-light text-white tracking-tight">{report.proposals.totalValue}</h3>
                                    <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">Estimado (Mês)</p>
                                </div>
                                <div className="mt-6 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                                    <p className="text-xs text-emerald-400/80 italic font-light">"{report.proposals.celebrationMessage}"</p>
                                </div>
                            </div>

                            {/* Tasks KPI */}
                            <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/5 shadow-lg ring-1 ring-white/5 flex flex-col justify-between group hover:bg-white/10 transition-all duration-500">
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Operacional</span>
                                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
                                        <Calendar className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-3xl font-light text-white tracking-tight">{report.tasks.inProgress.length}</h3>
                                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Em curso</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-lg font-bold text-slate-400">{report.tasks.backlog.length}</span>
                                        <span className="text-xs text-slate-600 font-medium uppercase tracking-wide">Fila</span>
                                    </div>
                                </div>
                                <p className="mt-4 text-xs text-slate-500 border-t border-white/5 pt-3 line-clamp-2 font-light">
                                    {report.tasks.analysis}
                                </p>
                            </div>

                            {/* Users KPI */}
                            <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/5 shadow-lg ring-1 ring-white/5 flex flex-col justify-between group hover:bg-white/10 transition-all duration-500">
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Equipe</span>
                                    <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 border border-purple-500/20 group-hover:scale-110 transition-transform">
                                        <Users className="w-4 h-4" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-light text-white tracking-tight">{report.users.totalActive}</h3>
                                    <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">Ativos</p>
                                </div>
                                <div className="mt-6 flex -space-x-2">
                                    {report.users.newUsers.slice(0, 4).map((u, i) => (
                                        <div key={i} className="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 ring-2 ring-slate-800" title={u.name}>
                                            {u.name.substring(0, 1)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                            {/* Tasks Column */}
                            <div className="space-y-6">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Prioridades
                                </h3>

                                <div className="space-y-3">
                                    {report.tasks.inProgress.map((task, i) => (
                                        <div key={i} className="group bg-white/5 backdrop-blur-sm p-5 rounded-2xl border border-white/5 flex items-start justify-between hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-sm hover:shadow-lg">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor] ${task.priority.toLowerCase().includes('alta') ? 'text-red-500 bg-red-500' : 'text-blue-500 bg-blue-500'}`}></span>
                                                    <h4 className="font-medium text-slate-200 text-sm group-hover:text-white transition-colors">{task.name}</h4>
                                                </div>
                                                <p className="text-xs text-slate-500 ml-4.5 font-light">{task.assignee}</p>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-500 px-2 py-1 bg-black/20 rounded border border-white/5 tracking-wider uppercase">
                                                {task.priority || 'Normal'}
                                            </span>
                                        </div>
                                    ))}

                                    {report.tasks.backlog.slice(0, 3).map((task, i) => (
                                        <div key={i} className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/5 flex items-center justify-between opacity-50 hover:opacity-80 transition-opacity">
                                            <div className="flex items-center gap-3">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                                                <h4 className="font-medium text-slate-400 text-xs">{task.name}</h4>
                                            </div>
                                            <span className="text-[10px] text-slate-600 border border-white/5 px-2 py-0.5 rounded uppercase tracking-wider">Backlog</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recommendations Column */}
                            <div className="space-y-6">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Estratégia
                                </h3>

                                <div className="bg-slate-900/30 backdrop-blur-md rounded-3xl p-6 border border-white/5 space-y-5 shadow-xl ring-1 ring-white/5">
                                    {report.recommendations.map((rec, i) => (
                                        <div key={i} className="flex gap-4 group">
                                            <div className="w-6 h-6 rounded-full bg-white/5 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-white/5 group-hover:border-brand-coral/30 group-hover:text-brand-coral transition-colors">
                                                {i + 1}
                                            </div>
                                            <p className="text-slate-300 text-sm leading-relaxed font-light group-hover:text-slate-200 transition-colors">
                                                {rec}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/5 shadow-lg">
                                    <h4 className="font-bold text-white mb-4 text-[10px] uppercase tracking-widest flex items-center justify-between opacity-70">
                                        Últimas Vendas <span className="opacity-50 font-normal normal-case">Este mês</span>
                                    </h4>
                                    <div className="space-y-1">
                                        {report.proposals.recentWon.length > 0 ? report.proposals.recentWon.map((prop, i) => (
                                            <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 hover:bg-white/5 px-3 -mx-3 rounded-xl transition-all group cursor-default">
                                                <div>
                                                    <p className="font-medium text-slate-300 text-xs group-hover:text-white transition-colors">{prop.client}</p>
                                                    <p className="text-[10px] text-slate-500 font-light">{prop.service}</p>
                                                </div>
                                                <span className="font-mono font-medium text-emerald-400 text-xs bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">{prop.value}</span>
                                            </div>
                                        )) : (
                                            <p className="text-xs text-slate-500 italic text-center py-2">Nenhuma venda recente.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
