import React, { useState } from 'react';
import { analyzeSystem } from '../lib/ai-agent';
import { Bot, Loader2, Play, RefreshCw, AlertTriangle } from 'lucide-react';
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
        <div className="p-8 max-w-7xl mx-auto">
            <header className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                        <Bot className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Gerente Geral IA</h1>
                        <p className="text-slate-500 dark:text-slate-400">Monitoramento inteligente e análise estratégica do sistema</p>
                    </div>
                </div>

                <button
                    onClick={runAnalysis}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analisando...
                        </>
                    ) : (
                        <>
                            <Play className="w-5 h-5 fill-current" />
                            Executar Análise
                        </>
                    )}
                </button>
            </header>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {!analysis && !loading && !error && (
                <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <Bot className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-slate-700 dark:text-slate-300">Pronto para iniciar</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
                        O Gerente Geral está aguardando para analisar os dados do sistema.
                        Clique em "Executar Análise" para gerar um relatório completo.
                    </p>
                </div>
            )}

            {loading && !analysis && (
                <div className="animate-pulse space-y-4 p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                    <div className="space-y-3">
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/5"></div>
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
                    </div>
                </div>
            )}

            {analysis && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 p-4 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            Relatório gerado em: {lastRun}
                        </span>
                        <button
                            onClick={runAnalysis}
                            disabled={loading}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                            title="Atualizar"
                        >
                            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="p-8 prose prose-slate dark:prose-invert max-w-none">
                        <ReactMarkdown>{analysis}</ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
}
