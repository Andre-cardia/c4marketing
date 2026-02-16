import React, { useState } from 'react';
import Header from '../components/Header';
import { analyzeSystem, AgentReport } from '../lib/ai-agent';
import { Bot, Loader2, AlertTriangle, Sparkles, CheckCircle, TrendingUp, Users, Calendar, Clock } from 'lucide-react';

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
        <div className="min-h-screen bg-slate-950 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                            <Bot className="w-8 h-8 text-brand-coral" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Gerente Geral IA</h1>
                            <p className="text-slate-400 text-sm">Monitoramento inteligente e análise estratégica</p>
                        </div>
                    </div>

                    <button
                        onClick={runAnalysis}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-3 bg-brand-coral hover:bg-brand-coral/90 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-brand-coral/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Analisando...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 text-white/90" />
                                <span>Executar Nova Análise</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-8 p-4 bg-red-950/30 border border-red-900/50 rounded-2xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-red-400 text-sm">Erro na Análise</h3>
                            <p className="text-red-300/80 text-sm mt-1">{error}</p>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!report && !loading && !error && (
                    <div className="flex flex-col items-center justify-center py-24 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed text-center px-4">
                        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800 shadow-xl">
                            <Bot className="w-10 h-10 text-slate-600" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Pronto para iniciar</h3>
                        <p className="text-slate-400 mt-2 max-w-md mx-auto text-sm">
                            O Gerente Geral está aguardando para analisar as tarefas, propostas e atividades recentes do sistema.
                        </p>
                    </div>
                )}

                {/* Loading Skeleton */}
                {loading && !report && (
                    <div className="space-y-6 animate-pulse">
                        <div className="h-32 bg-slate-900/50 rounded-2xl border border-slate-800 p-8"></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="h-28 bg-slate-900/50 rounded-2xl border border-slate-800"></div>
                            <div className="h-28 bg-slate-900/50 rounded-2xl border border-slate-800"></div>
                            <div className="h-28 bg-slate-900/50 rounded-2xl border border-slate-800"></div>
                        </div>
                        <div className="h-96 bg-slate-900/50 rounded-2xl border border-slate-800"></div>
                    </div>
                )}

                {/* Analysis Report UI */}
                {report && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* Executive Summary Card */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-brand-coral" />
                                Resumo Executivo
                            </h2>
                            <p className="text-slate-300 leading-relaxed text-sm">
                                {report.executiveSummary}
                            </p>
                            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="w-3 h-3" />
                                Atualizado em: {new Date(report.timestamp).toLocaleString()}
                            </div>
                        </div>

                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Proposals KPI */}
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-sm flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Vendas</span>
                                    <div className="p-2 bg-slate-800 rounded-lg text-emerald-400">
                                        <TrendingUp className="w-4 h-4" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white">{report.proposals.totalValue}</h3>
                                    <p className="text-xs text-slate-500 mt-1">Valor Estimado (Mês)</p>
                                </div>
                                <div className="mt-4 p-2 bg-slate-950 rounded-lg border border-slate-800/50">
                                    <p className="text-xs text-emerald-400/80 italic">"{report.proposals.celebrationMessage}"</p>
                                </div>
                            </div>

                            {/* Tasks KPI */}
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-sm flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Operacional</span>
                                    <div className="p-2 bg-slate-800 rounded-lg text-blue-400">
                                        <Calendar className="w-4 h-4" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-2xl font-bold text-white">{report.tasks.inProgress.length}</h3>
                                        <span className="text-xs text-slate-500">Em andamento</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-bold text-slate-400">{report.tasks.backlog.length}</span>
                                        <span className="text-xs text-slate-600">No backlog</span>
                                    </div>
                                </div>
                                <p className="mt-3 text-xs text-slate-500 border-t border-slate-800 pt-2 line-clamp-2">
                                    {report.tasks.analysis}
                                </p>
                            </div>

                            {/* Users KPI */}
                            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-sm flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Equipe</span>
                                    <div className="p-2 bg-slate-800 rounded-lg text-purple-400">
                                        <Users className="w-4 h-4" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white">{report.users.totalActive}</h3>
                                    <p className="text-xs text-slate-500 mt-1">Usuários Ativos</p>
                                </div>
                                <div className="mt-4 flex -space-x-2">
                                    {report.users.newUsers.slice(0, 4).map((u, i) => (
                                        <div key={i} className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300" title={u.name}>
                                            {u.name.substring(0, 1)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* Tasks Column */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">
                                    Prioridades
                                </h3>

                                <div className="space-y-3">
                                    {report.tasks.inProgress.map((task, i) => (
                                        <div key={i} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-start justify-between hover:border-slate-700 transition-colors">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${task.priority.toLowerCase().includes('alta') ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-blue-500'}`}></span>
                                                    <h4 className="font-bold text-slate-200 text-sm">{task.name}</h4>
                                                </div>
                                                <p className="text-xs text-slate-500 ml-3.5">{task.assignee}</p>
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-500 px-2 py-1 bg-slate-950 rounded border border-slate-800">
                                                {task.priority || 'Normal'}
                                            </span>
                                        </div>
                                    ))}

                                    {report.tasks.backlog.slice(0, 3).map((task, i) => (
                                        <div key={i} className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/50 flex items-center justify-between opacity-70">
                                            <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                                                <h4 className="font-medium text-slate-400 text-xs">{task.name}</h4>
                                            </div>
                                            <span className="text-[10px] text-slate-600 border border-slate-800 px-1.5 rounded">Backlog</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recommendations Column */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">
                                    Estratégia
                                </h3>

                                <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 space-y-4">
                                    {report.recommendations.map((rec, i) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-slate-700">
                                                {i + 1}
                                            </div>
                                            <p className="text-slate-300 text-sm leading-relaxed">
                                                {rec}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800">
                                    <h4 className="font-bold text-white mb-3 text-xs uppercase tracking-wider flex items-center justify-between">
                                        Últimas Vendas
                                        <span className="text-[10px] text-slate-500 font-normal">Este mês</span>
                                    </h4>
                                    <div className="space-y-2">
                                        {report.proposals.recentWon.length > 0 ? report.proposals.recentWon.map((prop, i) => (
                                            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                                                <div>
                                                    <p className="font-medium text-slate-300 text-xs">{prop.client}</p>
                                                    <p className="text-[10px] text-slate-500">{prop.service}</p>
                                                </div>
                                                <span className="font-mono font-bold text-emerald-400 text-xs">{prop.value}</span>
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
