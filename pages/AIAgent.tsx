import React, { useState } from 'react';
import Header from '../components/Header';
import { analyzeSystem, AgentReport } from '../lib/ai-agent';
import { Bot, Loader2, RefreshCw, AlertTriangle, Sparkles, CheckCircle2, TrendingUp, Users, Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';

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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/20">
                            <Bot className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Gerente Geral IA</h1>
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Monitoramento inteligente e análise estratégica</p>
                        </div>
                    </div>

                    <button
                        onClick={runAnalysis}
                        disabled={loading}
                        className="group relative flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold transition-all shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-10 dark:group-hover:opacity-20 transition-opacity"></div>
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Analisando Sistema...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 text-yellow-400 dark:text-yellow-600 fill-current" />
                                <span>Executar Análise</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-8 p-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-3xl flex items-start gap-4">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full shrink-0">
                            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-red-700 dark:text-red-300">Erro na Análise</h3>
                            <p className="text-red-600 dark:text-red-400 mt-1">{error}</p>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!report && !loading && !error && (
                    <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-700 text-center px-4">
                        <div className="w-24 h-24 bg-slate-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-6">
                            <Bot className="w-12 h-12 text-slate-300 dark:text-slate-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200">Pronto para iniciar</h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-lg mx-auto text-lg">
                            O Gerente Geral está aguardando para analisar as tarefas, propostas e atividades recentes do sistema.
                        </p>
                    </div>
                )}

                {/* Loading Skeleton */}
                {loading && !report && (
                    <div className="space-y-6 animate-pulse">
                        <div className="h-40 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8"></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="h-32 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700"></div>
                            <div className="h-32 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700"></div>
                            <div className="h-32 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700"></div>
                        </div>
                        <div className="h-96 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700"></div>
                    </div>
                )}

                {/* Analysis Report UI */}
                {report && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* Executive Summary Card */}
                        <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-black/20 position-relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-brand-coral"></div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-3">
                                <Sparkles className="w-6 h-6 text-brand-coral" />
                                Resumo Executivo
                            </h2>
                            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                                {report.executiveSummary}
                            </p>
                            <div className="mt-4 flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                                <Clock className="w-4 h-4" />
                                Atualizado em: {new Date(report.timestamp).toLocaleString()}
                            </div>
                        </div>

                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Proposals KPI */}
                            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                <div className="flex items-start justify-between">
                                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl text-green-600 dark:text-green-400">
                                        <TrendingUp className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-bold px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full">Vendas</span>
                                </div>
                                <div className="mt-4">
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{report.proposals.totalValue}</h3>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Valor Estimado Recente</p>
                                </div>
                                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                                    <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{report.proposals.celebrationMessage}"</p>
                                </div>
                            </div>

                            {/* Tasks KPI */}
                            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                <div className="flex items-start justify-between">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                                        <Calendar className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-bold px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full">Operacional</span>
                                </div>
                                <div className="mt-4">
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{report.tasks.inProgress.length}</h3>
                                        <span className="text-sm text-slate-500">Em andamento</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <h3 className="text-xl font-bold text-slate-400 dark:text-slate-500">{report.tasks.backlog.length}</h3>
                                        <span className="text-sm text-slate-500">No backlog</span>
                                    </div>
                                </div>
                                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700 pt-3">
                                    {report.tasks.analysis}
                                </p>
                            </div>

                            {/* Users KPI */}
                            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                <div className="flex items-start justify-between">
                                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-bold px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full">Equipe</span>
                                </div>
                                <div className="mt-4">
                                    <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{report.users.totalActive}</h3>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Usuários Ativos</p>
                                </div>
                                <div className="mt-4 flex -space-x-2 overflow-hidden">
                                    {report.users.newUsers.slice(0, 4).map((u, i) => (
                                        <div key={i} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300" title={u.name}>
                                            {u.name.substring(0, 1)}
                                        </div>
                                    ))}
                                    {report.users.newUsers.length > 4 && (
                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">
                                            +{report.users.newUsers.length - 4}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                            {/* Tasks Column */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-indigo-500" />
                                    Tarefas e Prioridades
                                </h3>

                                <div className="space-y-4">
                                    {report.tasks.inProgress.map((task, i) => (
                                        <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">{task.name}</h4>
                                                </div>
                                                <p className="text-xs text-slate-500 ml-4">Responsável: {task.assignee}</p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${task.priority.toLowerCase().includes('alta') || task.priority.toLowerCase().includes('high')
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                                }`}>
                                                {task.priority || 'Normal'}
                                            </span>
                                        </div>
                                    ))}

                                    {report.tasks.backlog.slice(0, 3).map((task, i) => (
                                        <div key={i} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/50 flex items-start justify-between opacity-80">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{task.name}</h4>
                                                </div>
                                                <p className="text-xs text-slate-500 ml-4">Prazo: {task.deadline || 'N/A'}</p>
                                            </div>
                                            <span className="text-xs text-slate-400 font-medium">Backlog</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recommendations Column */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Bot className="w-5 h-5 text-brand-coral" />
                                    Recomendações Estratégicas
                                </h3>

                                <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl p-6 border border-indigo-100 dark:border-indigo-800/30 space-y-4">
                                    {report.recommendations.map((rec, i) => (
                                        <div key={i} className="flex gap-4">
                                            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                                {i + 1}
                                            </div>
                                            <p className="text-indigo-900 dark:text-indigo-200 text-sm leading-relaxed font-medium">
                                                {rec}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700">
                                    <h4 className="font-bold text-slate-800 dark:text-white mb-4 text-sm uppercase tracking-wider">Últimas Vendas</h4>
                                    <div className="space-y-3">
                                        {report.proposals.recentWon.length > 0 ? report.proposals.recentWon.map((prop, i) => (
                                            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                                <div>
                                                    <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">{prop.client}</p>
                                                    <p className="text-xs text-slate-500">{prop.service}</p>
                                                </div>
                                                <span className="font-mono font-bold text-green-600 dark:text-green-400 text-sm">{prop.value}</span>
                                            </div>
                                        )) : (
                                            <p className="text-sm text-slate-500 italic">Nenhuma venda recente encontrada.</p>
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
