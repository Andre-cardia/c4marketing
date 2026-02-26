import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '../lib/UserRoleContext';
import {
    Activity, CheckCircle2, AlertCircle, Clock, Timer, Zap,
    Sparkles, TrendingUp, BarChart2, RefreshCw, AlertTriangle,
    Hash, DollarSign, Bot, CheckSquare, Users, Building2,
    ListChecks, CalendarClock, ShieldAlert, History
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopAction {
    action: string;
    count: number;
    avg_latency_ms: number;
    error_count: number;
    tokens_total: number;
}

interface TokensByAgent {
    agent_name: string;
    tokens_input: number;
    tokens_output: number;
    tokens_total: number;
    cost_est: number;
    executions: number;
}

interface DayEntry {
    date: string;
    total: number;
    successes: number;
    errors: number;
}

interface UsageByModel {
    model_name: string;
    tokens_input: number;
    tokens_output: number;
    tokens_total: number;
    cost: number;
}

interface ActiveProject {
    client_name: string;
    count: number;
}

interface TelemetrySummary {
    period_days: number;
    cutoff_date: string;
    total_executions: number;
    success_count: number;
    error_count: number;
    success_rate: number;
    avg_latency_ms: number;
    tokens_input: number;
    tokens_output: number;
    tokens_total: number;
    cost_total_usd: number;
    top_actions: TopAction[];
    error_rate_by_day: DayEntry[];
    most_active_projects: ActiveProject[];
    tokens_by_agent: TokensByAgent[];
    usage_by_model: UsageByModel[];
}

interface Suggestion {
    type: 'overdue_task' | 'unassigned_backlog' | 'all_tasks_done';
    message: string;
    project_name: string;
    task_title: string | null;
    due_date?: string;
    total_tasks?: number;
}

// ─── Task Telemetry Types ──────────────────────────────────────────────────────

interface TaskSummary {
    total: number;
    open: number;
    done: number;
    paused: number;
    overdue_now: number;
    ever_overdue: number;
    overdue_completed: number;
    overdue_still_open: number;
}

interface MonthlyTrend {
    month: string;
    criadas: number;
    concluidas: number;
    atrasadas: number;
}

interface TaskByAssignee {
    assignee: string;
    total_tasks: number;
    concluidas: number;
    abertas: number;
    ja_atrasadas: number;
    atrasadas_agora: number;
}

interface TaskByClient {
    client: string;
    total_tasks: number;
    concluidas: number;
    abertas: number;
    ja_atrasadas: number;
    atrasadas_agora: number;
}

interface SnapshotHistory {
    month: string;
    total: number;
    concluidas: number;
    abertas: number;
    atrasadas: number;
}

interface StatusDistribution {
    status: string;
    count: number;
}

interface TaskTelemetry {
    summary: TaskSummary;
    monthly_trend: MonthlyTrend[];
    by_assignee: TaskByAssignee[];
    by_client: TaskByClient[];
    snapshot_history: SnapshotHistory[];
    status_distribution: StatusDistribution[];
    has_overdue_tracking?: boolean;
}

type Period = 7 | 30 | 90;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatLatency = (ms: number) =>
    ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

const formatDate = (dateStr: string) => {
    const [, month, day] = dateStr.split('-');
    return `${day}/${month}`;
};

const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
            : String(n);

const formatCostUSD = (usd: number) =>
    usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    iconColor: string;
    bgColor: string;
    sub?: string;
}

const KPICard: React.FC<KPICardProps> = ({ label, value, icon: Icon, iconColor, bgColor, sub }) => (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 flex items-start gap-4">
        <div className={`p-3 rounded-xl ${bgColor}`}>
            <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-white mt-0.5">{value}</p>
            {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 shadow-xl text-xs">
            <p className="font-semibold text-neutral-800 dark:text-white mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.fill }} className="font-medium">
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const BrainTelemetry: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();

    const [days, setDays] = useState<Period>(7);
    const [taskDays, setTaskDays] = useState<Period>(30);
    const [summary, setSummary] = useState<TelemetrySummary | null>(null);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [taskTelemetry, setTaskTelemetry] = useState<TaskTelemetry | null>(null);
    const [loading, setLoading] = useState(true);
    const [taskLoading, setTaskLoading] = useState(false);
    const [taskError, setTaskError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchTaskData = useCallback(async (selectedDays: Period) => {
        setTaskLoading(true);
        setTaskError(null);
        try {
            const { data, error: taskErr } = await supabase.rpc('query_task_telemetry', { p_days: selectedDays });
            if (taskErr) {
                setTaskError(taskErr.message || 'Erro ao carregar dados de tarefas.');
                return;
            }
            if (data) setTaskTelemetry(data as TaskTelemetry);
        } catch (e: any) {
            setTaskError(e?.message || 'Erro inesperado ao carregar tarefas.');
        } finally {
            setTaskLoading(false);
        }
    }, []);

    const fetchData = useCallback(async (selectedDays: Period) => {
        setLoading(true);
        setError(null);
        try {
            const [
                { data: summaryData, error: summaryErr },
                { data: suggestionsData, error: suggestionsErr },
            ] = await Promise.all([
                supabase.rpc('query_telemetry_summary', { p_days: selectedDays }),
                supabase.rpc('query_autonomy_suggestions'),
            ]);

            if (summaryErr) throw summaryErr;
            if (suggestionsErr) throw suggestionsErr;

            setSummary(summaryData as TelemetrySummary);
            setSuggestions((suggestionsData as Suggestion[]) || []);
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar dados de telemetria.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!roleLoading && userRole !== 'gestor') {
            navigate('/dashboard');
        }
    }, [userRole, roleLoading, navigate]);

    useEffect(() => {
        if (userRole === 'gestor') {
            fetchData(days);
        }
    }, [days, userRole, fetchData]);

    useEffect(() => {
        if (userRole === 'gestor') {
            fetchTaskData(taskDays);
        }
    }, [taskDays, userRole, fetchTaskData]);

    if (roleLoading || (loading && !summary)) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-neutral-500">
                    <RefreshCw size={28} className="animate-spin text-brand-coral" />
                    <p className="text-sm">Carregando telemetria...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-red-500">
                    <AlertCircle size={28} />
                    <p className="text-sm">{error}</p>
                    <button
                        onClick={() => fetchData(days)}
                        className="mt-2 px-4 py-2 bg-brand-coral text-white text-sm rounded-xl hover:bg-brand-coral/90 transition"
                    >
                        Tentar novamente
                    </button>
                </div>
            </div>
        );
    }

    // ── Chart data preparation ────────────────────────────────────────────────

    const actionsChartData = (summary?.top_actions || []).slice(0, 8).map((a) => ({
        name: a.action.replace(/execute_|query_/g, '').replace(/_/g, ' '),
        Execuções: a.count,
        Erros: a.error_count,
    }));

    const dailyChartData = (summary?.error_rate_by_day || []).map((d) => ({
        name: formatDate(d.date),
        Sucesso: d.successes,
        Erros: d.errors,
    }));

    const maxProjectCount = Math.max(...(summary?.most_active_projects || []).map((p) => p.count), 1);

    // ── Suggestion badge config ───────────────────────────────────────────────

    const suggestionConfig: Record<Suggestion['type'], { icon: React.ElementType; color: string; bg: string; label: string }> = {
        overdue_task: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', label: 'Tarefa Atrasada' },
        unassigned_backlog: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800', label: 'Sem Responsável' },
        all_tasks_done: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', label: 'Projeto Concluído' },
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-coral/10 rounded-xl">
                        <Activity size={22} className="text-brand-coral" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Telemetria IA</h1>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Execuções dos agentes do Segundo Cérebro
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {([7, 30, 90] as Period[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setDays(p)}
                            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${days === p
                                ? 'bg-brand-coral text-white shadow-md shadow-brand-coral/20'
                                : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:border-brand-coral/50'
                                }`}
                        >
                            {p}d
                        </button>
                    ))}
                    <button
                        onClick={() => fetchData(days)}
                        className="p-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-brand-coral transition-colors"
                        title="Atualizar"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ── KPI Cards — execuções ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    label="Total Execuções"
                    value={summary?.total_executions ?? 0}
                    icon={Zap}
                    iconColor="text-blue-500"
                    bgColor="bg-blue-50 dark:bg-blue-900/20"
                    sub={`últimos ${days} dias`}
                />
                <KPICard
                    label="Taxa de Sucesso"
                    value={`${summary?.success_rate ?? 0}%`}
                    icon={TrendingUp}
                    iconColor="text-green-500"
                    bgColor="bg-green-50 dark:bg-green-900/20"
                    sub={`${summary?.success_count ?? 0} bem-sucedidas`}
                />
                <KPICard
                    label="Erros"
                    value={summary?.error_count ?? 0}
                    icon={AlertTriangle}
                    iconColor="text-red-500"
                    bgColor="bg-red-50 dark:bg-red-900/20"
                    sub={`${summary?.total_executions ? ((summary.error_count / summary.total_executions) * 100).toFixed(1) : 0}% das execuções`}
                />
                <KPICard
                    label="Latência Média"
                    value={formatLatency(summary?.avg_latency_ms ?? 0)}
                    icon={Timer}
                    iconColor="text-orange-500"
                    bgColor="bg-orange-50 dark:bg-orange-900/20"
                    sub="por execução"
                />
            </div>

            {/* ── KPI Cards — tokens ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    label="Tokens Entrada"
                    value={formatTokens(summary?.tokens_input ?? 0)}
                    icon={Hash}
                    iconColor="text-violet-500"
                    bgColor="bg-violet-50 dark:bg-violet-900/20"
                    sub="prompt tokens"
                />
                <KPICard
                    label="Tokens Saída"
                    value={formatTokens(summary?.tokens_output ?? 0)}
                    icon={Hash}
                    iconColor="text-fuchsia-500"
                    bgColor="bg-fuchsia-50 dark:bg-fuchsia-900/20"
                    sub="completion tokens"
                />
                <KPICard
                    label="Total de Tokens"
                    value={formatTokens(summary?.tokens_total ?? 0)}
                    icon={Bot}
                    iconColor="text-indigo-500"
                    bgColor="bg-indigo-50 dark:bg-indigo-900/20"
                    sub={`~${summary?.tokens_total && summary.total_executions ? formatTokens(Math.round(summary.tokens_total / summary.total_executions)) : 0} por execução`}
                />
                <KPICard
                    label="Custo Estimado"
                    value={formatCostUSD(summary?.cost_total_usd ?? 0)}
                    icon={DollarSign}
                    iconColor="text-emerald-500"
                    bgColor="bg-emerald-50 dark:bg-emerald-900/20"
                    sub="Faturamento multi-modelo consolidado"
                />
            </div>

            {/* ── Charts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Ações mais executadas */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart2 size={16} className="text-brand-coral" />
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white">Ações Mais Executadas</h2>
                    </div>
                    {actionsChartData.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                            Nenhum dado no período selecionado
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={actionsChartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-neutral-800" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                                    interval={0}
                                    angle={-20}
                                    textAnchor="end"
                                    height={44}
                                />
                                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <Tooltip content={<CustomBarTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="Execuções" fill="#f97316" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Erros" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Execuções por dia */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity size={16} className="text-brand-coral" />
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white">Execuções por Dia</h2>
                    </div>
                    {dailyChartData.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                            Nenhum dado no período selecionado
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={dailyChartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-neutral-800" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <Tooltip content={<CustomBarTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="Sucesso" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="a" />
                                <Bar dataKey="Erros" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Distribuição de Custos por Modelo */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 lg:col-span-2">
                    <div className="flex items-center gap-2 mb-6">
                        <Sparkles size={16} className="text-brand-coral" />
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white">Detalhamento por Modelo de IA</h2>
                    </div>
                    {summary?.usage_by_model && summary.usage_by_model.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                            <div className="md:col-span-5 h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={summary.usage_by_model.map(m => ({ name: m.model_name, value: m.cost }))}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {summary.usage_by_model.map((entry, index) => (
                                                <Cell key={entry.model_name} fill={entry.model_name.includes('mini') ? '#a855f7' : '#ec4899'} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => formatCostUSD(value)}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="md:col-span-7">
                                <div className="space-y-4">
                                    {summary.usage_by_model.map((m) => (
                                        <div key={m.model_name} className="flex items-center justify-between p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                                            <div>
                                                <p className="text-sm font-bold text-neutral-900 dark:text-white">{m.model_name}</p>
                                                <p className="text-xs text-neutral-500">{formatTokens(m.tokens_total)} tokens totais</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-brand-coral">{formatCostUSD(m.cost)}</p>
                                                <p className="text-xs text-neutral-400">{((m.cost / (summary?.cost_total_usd || 1)) * 100).toFixed(1)}% do total</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                            Dados de quebra por modelo ainda não disponíveis para o período.
                        </div>
                    )}
                </div>
            </div>

            {/* ── Tokens por agente ── */}
            {(summary?.tokens_by_agent || []).length > 0 && (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Bot size={16} className="text-brand-coral" />
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white">Consumo de Tokens por Agente</h2>
                        <span className="ml-auto text-xs text-neutral-400">Entrada · Saída · Total · Custo</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                    <th className="text-left pb-2 font-semibold text-neutral-500 dark:text-neutral-400">Agente</th>
                                    <th className="text-right pb-2 font-semibold text-neutral-500 dark:text-neutral-400">Execuções</th>
                                    <th className="text-right pb-2 font-semibold text-violet-400">Entrada</th>
                                    <th className="text-right pb-2 font-semibold text-fuchsia-400">Saída</th>
                                    <th className="text-right pb-2 font-semibold text-indigo-400">Total</th>
                                    <th className="text-right pb-2 font-semibold text-emerald-400">Custo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                {summary!.tokens_by_agent.map((agent) => (
                                    <tr key={agent.agent_name} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                        <td className="py-2.5 font-medium text-neutral-800 dark:text-neutral-100">
                                            {agent.agent_name.replace('Agent_', '')}
                                        </td>
                                        <td className="py-2.5 text-right text-neutral-500">{agent.executions}</td>
                                        <td className="py-2.5 text-right text-violet-500">{formatTokens(agent.tokens_input)}</td>
                                        <td className="py-2.5 text-right text-fuchsia-500">{formatTokens(agent.tokens_output)}</td>
                                        <td className="py-2.5 text-right text-indigo-500 font-semibold">{formatTokens(agent.tokens_total)}</td>
                                        <td className="py-2.5 text-right text-emerald-500">{formatCostUSD(agent.cost_est)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                ── Task Report Section ──
                ═══════════════════════════════════════════════════════════════ */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6 space-y-6">

                {/* Section header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                            <CheckSquare size={20} className="text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Relatório de Tarefas</h2>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                Histórico permanente · por usuário · por cliente · atrasos registrados mesmo após conclusão
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {([7, 30, 90] as Period[]).map((p) => (
                            <button
                                key={p}
                                onClick={() => setTaskDays(p)}
                                className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${taskDays === p
                                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                                    : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:border-blue-400/50'
                                    }`}
                            >
                                {p}d
                            </button>
                        ))}
                        <button
                            onClick={() => fetchTaskData(taskDays)}
                            className="p-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-blue-500 transition-colors"
                            title="Atualizar tarefas"
                        >
                            <RefreshCw size={16} className={taskLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Status bar: loading / error / tracking active */}
                {taskLoading && (
                    <div className="flex items-center gap-2 text-xs text-blue-500 -mt-2">
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Carregando dados de tarefas...</span>
                    </div>
                )}
                {!taskLoading && taskError && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm">
                        <AlertCircle size={16} className="text-red-500 shrink-0" />
                        <div className="flex-1">
                            <p className="font-semibold text-red-600 dark:text-red-400">Erro ao carregar dados</p>
                            <p className="text-xs text-red-500 mt-0.5">{taskError}</p>
                            <p className="text-xs text-red-400 mt-1">
                                Verifique se as migrations <code>20260226140000</code> e <code>20260226150000/160000</code> foram aplicadas no Supabase.
                            </p>
                        </div>
                        <button
                            onClick={() => fetchTaskData(taskDays)}
                            className="shrink-0 px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition"
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}
                {!taskLoading && !taskError && taskTelemetry && !taskTelemetry.has_overdue_tracking && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-400 -mt-2">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>
                            <strong>Tracking histórico de atrasos não ativo.</strong>{' '}
                            Aplique a migration <code>20260226140000</code> para registrar atrasos permanentemente,
                            mesmo após a conclusão das tarefas.
                        </span>
                    </div>
                )}

                {/* KPI row 1: volume */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard
                        label="Total de Tarefas"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.total ?? 0)}
                        icon={ListChecks}
                        iconColor="text-blue-500"
                        bgColor="bg-blue-50 dark:bg-blue-900/20"
                        sub={`todos os projetos`}
                    />
                    <KPICard
                        label="Em Aberto"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.open ?? 0)}
                        icon={Clock}
                        iconColor="text-yellow-500"
                        bgColor="bg-yellow-50 dark:bg-yellow-900/20"
                        sub="backlog + execução + aprovação"
                    />
                    <KPICard
                        label="Concluídas"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.done ?? 0)}
                        icon={CheckCircle2}
                        iconColor="text-green-500"
                        bgColor="bg-green-50 dark:bg-green-900/20"
                        sub={
                            taskTelemetry?.summary.total
                                ? `${Math.round((taskTelemetry.summary.done / taskTelemetry.summary.total) * 100)}% do total`
                                : '—'
                        }
                    />
                    <KPICard
                        label="Em Atraso Agora"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.overdue_now ?? 0)}
                        icon={AlertCircle}
                        iconColor="text-red-500"
                        bgColor="bg-red-50 dark:bg-red-900/20"
                        sub="prazo vencido e não concluída"
                    />
                </div>

                {/* KPI row 2: overdue history */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <KPICard
                        label="Já Estiveram Atrasadas"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.ever_overdue ?? 0)}
                        icon={History}
                        iconColor="text-orange-500"
                        bgColor="bg-orange-50 dark:bg-orange-900/20"
                        sub={taskTelemetry?.has_overdue_tracking ? 'registro permanente — inclui concluídas' : 'calculado por due_date'}
                    />
                    <KPICard
                        label="Atrasadas → Concluídas"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.overdue_completed ?? 0)}
                        icon={CalendarClock}
                        iconColor="text-teal-500"
                        bgColor="bg-teal-50 dark:bg-teal-900/20"
                        sub={taskTelemetry?.has_overdue_tracking ? 'entregues com atraso' : 'disponível após migration 20260226140000'}
                    />
                    <KPICard
                        label="Atrasadas e Abertas"
                        value={taskLoading ? '…' : (taskTelemetry?.summary.overdue_still_open ?? 0)}
                        icon={ShieldAlert}
                        iconColor="text-red-600"
                        bgColor="bg-red-50 dark:bg-red-900/20"
                        sub="requerem atenção imediata"
                    />
                </div>

                {/* Monthly trend chart */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp size={16} className="text-blue-500" />
                        <h3 className="text-sm font-bold text-neutral-800 dark:text-white">Evolução Mensal de Tarefas</h3>
                        <span className="ml-auto text-xs text-neutral-400">Criadas · Concluídas · Atrasadas</span>
                    </div>
                    {(taskTelemetry?.monthly_trend || []).length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                            Nenhum dado no período selecionado
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart
                                data={taskTelemetry!.monthly_trend}
                                margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-neutral-800" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <Tooltip content={<CustomBarTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="criadas"    name="Criadas"    fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="concluidas" name="Concluídas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="atrasadas"  name="Atrasadas"  fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* By assignee + by client */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* By assignee */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Users size={16} className="text-indigo-500" />
                            <h3 className="text-sm font-bold text-neutral-800 dark:text-white">Tarefas por Responsável</h3>
                        </div>
                        {(taskTelemetry?.by_assignee || []).length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-neutral-400 text-sm">
                                Nenhum dado disponível
                            </div>
                        ) : (
                            <div className="space-y-2.5 overflow-y-auto max-h-72">
                                {taskTelemetry!.by_assignee.map((u) => (
                                    <div key={u.assignee} className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">
                                        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                                {u.assignee.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 truncate">{u.assignee}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-neutral-400">{u.total_tasks} total</span>
                                                <span className="text-xs text-green-500">{u.concluidas} ✓</span>
                                                <span className="text-xs text-yellow-500">{u.abertas} abertas</span>
                                                {u.ja_atrasadas > 0 && (
                                                    <span className="text-xs text-red-500 font-semibold">{u.ja_atrasadas} atrasadas</span>
                                                )}
                                            </div>
                                        </div>
                                        {u.atrasadas_agora > 0 && (
                                            <span className="shrink-0 px-1.5 py-0.5 text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                                                {u.atrasadas_agora} agora
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* By client */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 size={16} className="text-teal-500" />
                            <h3 className="text-sm font-bold text-neutral-800 dark:text-white">Tarefas por Cliente</h3>
                        </div>
                        {(taskTelemetry?.by_client || []).length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-neutral-400 text-sm">
                                Nenhum dado disponível
                            </div>
                        ) : (
                            <div className="space-y-2.5 overflow-y-auto max-h-72">
                                {taskTelemetry!.by_client.map((c) => (
                                    <div key={c.client} className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">
                                        <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                                                {c.client.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 truncate">{c.client}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-neutral-400">{c.total_tasks} total</span>
                                                <span className="text-xs text-green-500">{c.concluidas} ✓</span>
                                                <span className="text-xs text-yellow-500">{c.abertas} abertas</span>
                                                {c.ja_atrasadas > 0 && (
                                                    <span className="text-xs text-red-500 font-semibold">{c.ja_atrasadas} atrasadas</span>
                                                )}
                                            </div>
                                        </div>
                                        {c.atrasadas_agora > 0 && (
                                            <span className="shrink-0 px-1.5 py-0.5 text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                                                {c.atrasadas_agora} agora
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Snapshot history table */}
                {(taskTelemetry?.snapshot_history || []).length > 0 && (
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <History size={16} className="text-orange-500" />
                            <h3 className="text-sm font-bold text-neutral-800 dark:text-white">Histórico por Mês (Snapshots)</h3>
                            <span className="ml-auto text-xs text-neutral-400">Fotografias permanentes do fim de cada mês</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <th className="text-left pb-2 font-semibold text-neutral-500 dark:text-neutral-400">Mês</th>
                                        <th className="text-right pb-2 font-semibold text-neutral-500 dark:text-neutral-400">Total</th>
                                        <th className="text-right pb-2 font-semibold text-green-500">Concluídas</th>
                                        <th className="text-right pb-2 font-semibold text-yellow-500">Abertas</th>
                                        <th className="text-right pb-2 font-semibold text-red-500">Atrasadas</th>
                                        <th className="text-right pb-2 font-semibold text-neutral-400">Taxa Conclusão</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                    {taskTelemetry!.snapshot_history.map((s) => (
                                        <tr key={s.month} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                            <td className="py-2.5 font-semibold text-neutral-800 dark:text-neutral-100">{s.month}</td>
                                            <td className="py-2.5 text-right text-neutral-500">{s.total}</td>
                                            <td className="py-2.5 text-right text-green-500 font-semibold">{s.concluidas}</td>
                                            <td className="py-2.5 text-right text-yellow-500">{s.abertas}</td>
                                            <td className="py-2.5 text-right text-red-500 font-semibold">{s.atrasadas}</td>
                                            <td className="py-2.5 text-right text-neutral-400">
                                                {s.total > 0 ? `${Math.round((s.concluidas / s.total) * 100)}%` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>

            {/* ── Bottom row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Projetos mais ativos */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Zap size={16} className="text-brand-coral" />
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white">Projetos Mais Ativos</h2>
                    </div>
                    {(summary?.most_active_projects || []).length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-neutral-400 text-sm">
                            Nenhuma ação registrada com projeto no período
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {summary!.most_active_projects.slice(0, 6).map((project, idx) => (
                                <div key={project.client_name} className="flex items-center gap-3">
                                    <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-neutral-400">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                                                {project.client_name}
                                            </span>
                                            <span className="text-xs text-neutral-500 ml-2 shrink-0">
                                                {project.count} ações
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-brand-coral rounded-full transition-all duration-500"
                                                style={{ width: `${(project.count / maxProjectCount) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Alertas & Sugestões */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles size={16} className="text-brand-coral" />
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white">Alertas & Sugestões</h2>
                        {suggestions.length > 0 && (
                            <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-brand-coral/10 text-brand-coral rounded-full">
                                {suggestions.length}
                            </span>
                        )}
                    </div>
                    {suggestions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-neutral-400 gap-2">
                            <CheckCircle2 size={24} className="text-green-400" />
                            <p className="text-sm">Nenhum alerta pendente</p>
                        </div>
                    ) : (
                        <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
                            {suggestions.map((s, idx) => {
                                const cfg = suggestionConfig[s.type];
                                const Icon = cfg.icon;
                                return (
                                    <div
                                        key={idx}
                                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${cfg.bg}`}
                                    >
                                        <Icon size={14} className={`${cfg.color} mt-0.5 shrink-0`} />
                                        <div className="flex-1 min-w-0">
                                            <span className={`inline-block font-bold ${cfg.color} mb-0.5`}>
                                                {cfg.label}
                                            </span>
                                            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                                                {s.message}
                                            </p>
                                            {s.project_name && (
                                                <p className="text-neutral-400 mt-0.5">Projeto: {s.project_name}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BrainTelemetry;
