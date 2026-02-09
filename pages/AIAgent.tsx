import React, { useState } from 'react';
import Header from '../components/Header';
import { analyzeSystem } from '../lib/ai-agent';
import { Bot, Loader2, Play, RefreshCw, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function AIAgent() {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRun, setLastRun] = useState<string | null>(null);

    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await analyzeSystem();
            setAnalysis(result.analysis);
            setLastRun(new Date(result.timestamp).toLocaleString());
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
                    <div className="mb-8 p-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-3xl flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
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
                {!analysis && !loading && !error && (
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
                {loading && !analysis && (
                    <div className="space-y-6 animate-pulse">
                        <div className="h-40 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 space-y-4">
                            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/3"></div>
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-full"></div>
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-2/3"></div>
                        </div>
                        <div className="h-96 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
                            <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/4 mb-8"></div>
                            <div className="space-y-4">
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-full"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-full"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-3/4"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Analysis Result */}
                {analysis && (
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Report Header */}
                        <div className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 dark:text-white">Relatório Gerado com Sucesso</h3>
                                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400 block">
                                        Atualizado em: {lastRun}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={runAnalysis}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-brand-coral dark:hover:border-brand-coral text-slate-600 dark:text-slate-300 rounded-lg font-medium transition-all text-sm group"
                                title="Atualizar"
                            >
                                <RefreshCw className={`w-4 h-4 text-slate-400 group-hover:text-brand-coral transition-colors ${loading ? 'animate-spin' : ''}`} />
                                Recalcular
                            </button>
                        </div>

                        {/* Markdown Content */}
                        <div className="p-8 md:p-12 prose prose-slate max-w-none 
              prose-headings:font-bold prose-headings:text-slate-800 dark:prose-headings:text-white
              prose-p:text-slate-700 
              prose-strong:text-slate-900 
              prose-li:text-slate-700
              prose-a:text-indigo-600 
              dark:[&]:text-slate-100
              dark:[&_p]:!text-slate-100
              dark:[&_li]:!text-slate-100
              dark:[&_ul]:!text-slate-100
              dark:[&_ol]:!text-slate-100
              dark:[&_strong]:!text-amber-400
              dark:[&_h1]:!text-white
              dark:[&_h2]:!text-white
              dark:[&_h3]:!text-white
              dark:[&_h4]:!text-white
              dark:[&_a]:!text-indigo-300">
                            <ReactMarkdown>{analysis}</ReactMarkdown>
                        </div>

                        {/* Footer decoration */}
                        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-brand-coral"></div>
                    </div>
                )}
            </main>
        </div>
    );
}
