import React, { useEffect, useState, useRef } from 'react';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '../lib/UserRoleContext';
import {
    ArrowLeft, TrendingUp, TrendingDown, DollarSign, Users, BarChart3,
    Percent, Activity, Send, Bot, Loader2, ChevronDown, ArrowUpRight,
    ArrowDownRight, MessageSquare, X, Minus
} from 'lucide-react';
import {
    fetchCommercialContext,
    chatWithDirector,
    CommercialContext,
    MonthlyMetrics,
    ChatMessage
} from '../lib/commercial-ai-agent';

// ─── Formatters ──────────────────────────────────────────────────────────────

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const formatCompact = (val: number) => {
    if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
    return formatCurrency(val);
};

// ─── SVG Chart Components ────────────────────────────────────────────────────

const MRRLineChart: React.FC<{ months: MonthlyMetrics[]; comparisonMonths?: MonthlyMetrics[] }> = ({ months, comparisonMonths }) => {
    const width = 700;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const allValues = [...months.map(m => m.mrr), ...(comparisonMonths?.map(m => m.mrr) || [])];
    const maxVal = Math.max(...allValues, 1);
    const minVal = 0;

    const getX = (i: number) => padding.left + (i / 11) * chartW;
    const getY = (val: number) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

    const makePath = (data: MonthlyMetrics[]) =>
        data.map((m, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(m.mrr)}`).join(' ');

    const makeAreaPath = (data: MonthlyMetrics[]) =>
        makePath(data) + ` L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

    // Y-axis grid lines
    const gridLines = 5;
    const gridValues = Array.from({ length: gridLines }, (_, i) => minVal + ((maxVal - minVal) / (gridLines - 1)) * i);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {/* Grid */}
            {gridValues.map((val, i) => (
                <g key={i}>
                    <line x1={padding.left} y1={getY(val)} x2={width - padding.right} y2={getY(val)}
                        stroke="currentColor" className="text-slate-800" strokeDasharray="4 4" strokeWidth={0.5} />
                    <text x={padding.left - 8} y={getY(val) + 4} textAnchor="end"
                        className="fill-slate-500 text-[10px]">{formatCompact(val)}</text>
                </g>
            ))}

            {/* Month labels */}
            {months.map((m, i) => (
                <text key={i} x={getX(i)} y={height - 8} textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-medium">{m.monthLabel}</text>
            ))}

            {/* Comparison line */}
            {comparisonMonths && comparisonMonths.length > 0 && (
                <path d={makePath(comparisonMonths)} fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="6 4" />
            )}

            {/* Main area gradient */}
            <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
            </defs>
            <path d={makeAreaPath(months)} fill="url(#mrrGrad)" />

            {/* Main line */}
            <path d={makePath(months)} fill="none" stroke="#f97316" strokeWidth={2.5} strokeLinejoin="round" />

            {/* Data points */}
            {months.map((m, i) => (
                <g key={i}>
                    <circle cx={getX(i)} cy={getY(m.mrr)} r={4} fill="#f97316" stroke="#1e293b" strokeWidth={2} />
                    <title>{`${m.monthLabel}: ${formatCurrency(m.mrr)}`}</title>
                </g>
            ))}
        </svg>
    );
};

const RevenueBarChart: React.FC<{ months: MonthlyMetrics[] }> = ({ months }) => {
    const width = 700;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxVal = Math.max(...months.map(m => m.totalRevenue), 1);

    const barWidth = (chartW / 12) * 0.6;
    const barGap = (chartW / 12) * 0.4;

    // Grid
    const gridLines = 5;
    const gridValues = Array.from({ length: gridLines }, (_, i) => (maxVal / (gridLines - 1)) * i);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {/* Grid */}
            {gridValues.map((val, i) => {
                const y = padding.top + chartH - (val / maxVal) * chartH;
                return (
                    <g key={i}>
                        <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                            stroke="currentColor" className="text-slate-800" strokeDasharray="4 4" strokeWidth={0.5} />
                        <text x={padding.left - 8} y={y + 4} textAnchor="end"
                            className="fill-slate-500 text-[10px]">{formatCompact(val)}</text>
                    </g>
                );
            })}

            {/* Bars */}
            {months.map((m, i) => {
                const x = padding.left + (i * chartW / 12) + barGap / 2;
                const mrrHeight = (m.mrr / maxVal) * chartH;
                const setupHeight = (m.setupRevenue / maxVal) * chartH;
                const totalHeight = mrrHeight + setupHeight;
                const y = padding.top + chartH - totalHeight;

                return (
                    <g key={i}>
                        {/* Recorrente (bottom) */}
                        <rect x={x} y={padding.top + chartH - mrrHeight} width={barWidth} height={mrrHeight}
                            rx={3} fill="#f97316" opacity={0.9}>
                            <title>{`${m.monthLabel} - Recorrente: ${formatCurrency(m.mrr)}`}</title>
                        </rect>
                        {/* Setup (top) */}
                        <rect x={x} y={y} width={barWidth} height={setupHeight}
                            rx={3} fill="#3b82f6" opacity={0.8}>
                            <title>{`${m.monthLabel} - Setup: ${formatCurrency(m.setupRevenue)}`}</title>
                        </rect>
                        {/* Month label */}
                        <text x={x + barWidth / 2} y={height - 8} textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-medium">{m.monthLabel}</text>
                    </g>
                );
            })}

            {/* Legend */}
            <rect x={width - 180} y={8} width={10} height={10} rx={2} fill="#f97316" />
            <text x={width - 166} y={17} className="fill-slate-400 text-[10px]">Recorrente</text>
            <rect x={width - 100} y={8} width={10} height={10} rx={2} fill="#3b82f6" />
            <text x={width - 86} y={17} className="fill-slate-400 text-[10px]">Setup</text>
        </svg>
    );
};

const ConversionFunnelChart: React.FC<{ months: MonthlyMetrics[] }> = ({ months }) => {
    const width = 700;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxVal = Math.max(...months.map(m => Math.max(m.totalProposals, m.acceptedProposals)), 1);
    const barWidth = (chartW / 12) * 0.35;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {months.map((m, i) => {
                const groupX = padding.left + (i * chartW / 12);
                const proposalH = (m.totalProposals / maxVal) * chartH;
                const acceptedH = (m.acceptedProposals / maxVal) * chartH;

                return (
                    <g key={i}>
                        {/* Proposals */}
                        <rect x={groupX + 2} y={padding.top + chartH - proposalH} width={barWidth} height={proposalH}
                            rx={3} fill="#64748b" opacity={0.6}>
                            <title>{`${m.monthLabel} - Propostas: ${m.totalProposals}`}</title>
                        </rect>
                        {/* Accepted */}
                        <rect x={groupX + barWidth + 4} y={padding.top + chartH - acceptedH} width={barWidth} height={acceptedH}
                            rx={3} fill="#10b981" opacity={0.8}>
                            <title>{`${m.monthLabel} - Aceitas: ${m.acceptedProposals}`}</title>
                        </rect>
                        {/* Conversion rate label */}
                        {m.totalProposals > 0 && (
                            <text x={groupX + barWidth + 2} y={padding.top + 12} textAnchor="middle"
                                className="fill-emerald-400 text-[9px] font-bold">{m.conversionRate}%</text>
                        )}
                        {/* Month */}
                        <text x={groupX + barWidth + 2} y={height - 8} textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-medium">{m.monthLabel}</text>
                    </g>
                );
            })}

            {/* Legend */}
            <rect x={width - 180} y={8} width={10} height={10} rx={2} fill="#64748b" opacity={0.6} />
            <text x={width - 166} y={17} className="fill-slate-400 text-[10px]">Propostas</text>
            <rect x={width - 100} y={8} width={10} height={10} rx={2} fill="#10b981" />
            <text x={width - 86} y={17} className="fill-slate-400 text-[10px]">Aceitas</text>
        </svg>
    );
};

const ChurnChart: React.FC<{ months: MonthlyMetrics[] }> = ({ months }) => {
    const width = 700;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxVal = Math.max(...months.map(m => Math.max(m.newContracts, m.churnedContracts)), 1);
    const barWidth = (chartW / 12) * 0.35;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            {months.map((m, i) => {
                const groupX = padding.left + (i * chartW / 12);
                const newH = (m.newContracts / maxVal) * chartH;
                const churnH = (m.churnedContracts / maxVal) * chartH;

                return (
                    <g key={i}>
                        {/* New contracts */}
                        <rect x={groupX + 2} y={padding.top + chartH - newH} width={barWidth} height={newH}
                            rx={3} fill="#10b981" opacity={0.8}>
                            <title>{`${m.monthLabel} - Novos: ${m.newContracts}`}</title>
                        </rect>
                        {/* Churned */}
                        <rect x={groupX + barWidth + 4} y={padding.top + chartH - churnH} width={barWidth} height={churnH}
                            rx={3} fill="#ef4444" opacity={0.7}>
                            <title>{`${m.monthLabel} - Churn: ${m.churnedContracts}`}</title>
                        </rect>
                        {/* Month */}
                        <text x={groupX + barWidth + 2} y={height - 8} textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-medium">{m.monthLabel}</text>
                    </g>
                );
            })}

            {/* Legend */}
            <rect x={width - 180} y={8} width={10} height={10} rx={2} fill="#10b981" />
            <text x={width - 166} y={17} className="fill-slate-400 text-[10px]">Novos</text>
            <rect x={width - 100} y={8} width={10} height={10} rx={2} fill="#ef4444" />
            <text x={width - 86} y={17} className="fill-slate-400 text-[10px]">Churn</text>
        </svg>
    );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KPICard: React.FC<{
    title: string;
    value: string;
    change?: number;
    icon: React.ReactNode;
    subtitle?: string;
}> = ({ title, value, change, icon, subtitle }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-start justify-between mb-3">
            <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-slate-700 transition-colors">
                {icon}
            </div>
            {change !== undefined && (
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${change >= 0
                        ? 'text-emerald-400 bg-emerald-400/10'
                        : 'text-red-400 bg-red-400/10'
                    }`}>
                    {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(change)}%
                </div>
            )}
        </div>
        <p className="text-2xl font-black text-white leading-none mb-1">{value}</p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        {subtitle && <p className="text-[10px] text-slate-600 mt-1">{subtitle}</p>}
    </div>
);

// ─── Chatbot Component ───────────────────────────────────────────────────────

const CommercialChatbot: React.FC<{
    context: CommercialContext | null;
    isGestor: boolean;
}> = ({ context, isGestor }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading || !context) return;

        const userMsg: ChatMessage = { role: 'user', content: input.trim() };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        try {
            const response = await chatWithDirector(updatedMessages, context);
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Erro: ${error.message || 'Não foi possível processar sua mensagem.'}`
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isGestor) return null;

    // Floating button
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-br from-brand-coral to-orange-600 text-white rounded-2xl shadow-2xl shadow-brand-coral/30 hover:shadow-brand-coral/50 transition-all hover:scale-105 group"
                title="Diretor Comercial IA"
            >
                <Bot size={24} className="group-hover:animate-pulse" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 animate-pulse" />
            </button>
        );
    }

    // Minimized bar
    if (isMinimized) {
        return (
            <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex items-center gap-3 px-4 py-3 cursor-pointer hover:border-slate-700 transition-all"
                onClick={() => setIsMinimized(false)}>
                <Bot size={18} className="text-brand-coral" />
                <span className="text-sm font-bold text-white">Diretor Comercial IA</span>
                <span className="text-xs text-slate-500">{messages.length} msgs</span>
                <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); setIsMinimized(false); }}
                    className="text-slate-500 hover:text-red-400 ml-2"><X size={14} /></button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[600px] bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-brand-coral to-orange-600 rounded-xl">
                        <Bot size={18} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Diretor Comercial IA</h3>
                        <p className="text-[10px] text-emerald-400 font-medium">● Online</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsMinimized(true)}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
                        <Minus size={14} />
                    </button>
                    <button onClick={() => { setIsOpen(false); setIsMinimized(false); }}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="text-center py-8">
                        <Bot size={40} className="mx-auto text-slate-700 mb-3" />
                        <p className="text-sm text-slate-500 mb-1 font-medium">Diretor Comercial IA</p>
                        <p className="text-xs text-slate-600 mb-4">Pergunte sobre métricas, tendências, previsões ou estratégias comerciais.</p>
                        <div className="space-y-2">
                            {['Qual a tendência do MRR?', 'Analise o churn deste ano', 'Previsão para próximo trimestre'].map(q => (
                                <button key={q} onClick={() => { setInput(q); }}
                                    className="block w-full text-left text-xs text-slate-400 hover:text-brand-coral bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-2 rounded-xl transition-colors">
                                    💬 {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-brand-coral text-white rounded-br-md'
                                : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-md'
                            }`}>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-900 border border-slate-800 px-4 py-3 rounded-2xl rounded-bl-md">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Loader2 size={14} className="animate-spin" />
                                <span className="text-xs">Analisando dados...</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pergunte ao Diretor Comercial..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-coral focus:ring-1 focus:ring-brand-coral/20 outline-none transition-all"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="p-2.5 bg-brand-coral text-white rounded-xl hover:bg-brand-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
};

// ─── Main Page Component ─────────────────────────────────────────────────────

const CommercialDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading } = useUserRole();

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [comparisonYear, setComparisonYear] = useState<number | undefined>(currentYear - 1);
    const [context, setContext] = useState<CommercialContext | null>(null);
    const [loading, setLoading] = useState(true);

    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

    useEffect(() => {
        if (!roleLoading && userRole !== 'gestor' && userRole !== 'comercial' && userRole !== 'admin') {
            navigate('/dashboard');
        }
    }, [userRole, roleLoading, navigate]);

    useEffect(() => {
        loadData();
    }, [selectedYear, comparisonYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchCommercialContext(selectedYear, comparisonYear);
            setContext(data);
        } catch (e) {
            console.error('Erro ao carregar dados comerciais:', e);
        } finally {
            setLoading(false);
        }
    };

    if (roleLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-brand-coral animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="flex items-center gap-2 text-slate-500 hover:text-brand-coral mb-4 transition-colors group"
                        >
                            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                            Voltar ao Dashboard
                        </button>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <BarChart3 className="w-8 h-8 text-brand-coral" />
                            Dashboard Comercial
                        </h1>
                        <p className="text-slate-400 mt-1">
                            Métricas de evolução comercial — Exercício {selectedYear}
                        </p>
                    </div>

                    {/* Year selectors */}
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Exercício</label>
                            <div className="relative">
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 pr-8 text-sm font-bold text-white cursor-pointer focus:border-brand-coral outline-none transition-colors"
                                >
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Comparar com</label>
                            <div className="relative">
                                <select
                                    value={comparisonYear || ''}
                                    onChange={(e) => setComparisonYear(e.target.value ? Number(e.target.value) : undefined)}
                                    className="appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 pr-8 text-sm font-bold text-white cursor-pointer focus:border-brand-coral outline-none transition-colors"
                                >
                                    <option value="">Nenhum</option>
                                    {years.filter(y => y !== selectedYear).map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="text-center">
                            <Loader2 className="w-10 h-10 text-brand-coral animate-spin mx-auto mb-4" />
                            <p className="text-slate-500 text-sm">Calculando métricas comerciais...</p>
                        </div>
                    </div>
                ) : context ? (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                            <KPICard
                                title="MRR"
                                value={formatCompact(context.currentMRR)}
                                change={context.mrrGrowth}
                                icon={<DollarSign size={18} className="text-brand-coral" />}
                                subtitle="Receita Mensal Recorrente"
                            />
                            <KPICard
                                title="ARR"
                                value={formatCompact(context.currentARR)}
                                icon={<TrendingUp size={18} className="text-emerald-400" />}
                                subtitle="Receita Anual Recorrente"
                            />
                            <KPICard
                                title="Conversão"
                                value={`${context.averageConversionRate}%`}
                                icon={<Percent size={18} className="text-blue-400" />}
                                subtitle="Média do exercício"
                            />
                            <KPICard
                                title="Churn"
                                value={`${context.averageChurnRate}%`}
                                icon={<TrendingDown size={18} className="text-red-400" />}
                                subtitle="Média mensal"
                            />
                            <KPICard
                                title="Clientes Ativos"
                                value={String(context.currentActiveClients)}
                                icon={<Users size={18} className="text-cyan-400" />}
                            />
                            <KPICard
                                title="Crescimento"
                                value={`${context.mrrGrowth > 0 ? '+' : ''}${context.mrrGrowth}%`}
                                change={context.mrrGrowth}
                                icon={<Activity size={18} className="text-amber-400" />}
                                subtitle="MRR vs mês anterior"
                            />
                        </div>

                        {/* Charts Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            {/* MRR Evolution */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <TrendingUp size={16} className="text-brand-coral" />
                                        Evolução do MRR
                                    </h3>
                                    {comparisonYear && (
                                        <span className="text-[10px] text-slate-500 font-medium">
                                            — Linha tracejada: {comparisonYear}
                                        </span>
                                    )}
                                </div>
                                <MRRLineChart months={context.months} comparisonMonths={context.comparisonMonths} />
                            </div>

                            {/* Revenue Bars */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                    <BarChart3 size={16} className="text-blue-400" />
                                    Receita Mensal (Recorrente + Setup)
                                </h3>
                                <RevenueBarChart months={context.months} />
                            </div>

                            {/* Conversion Funnel */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                    <Percent size={16} className="text-emerald-400" />
                                    Funil de Conversão
                                </h3>
                                <ConversionFunnelChart months={context.months} />
                            </div>

                            {/* Churn vs New */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                    <Activity size={16} className="text-red-400" />
                                    Churn vs. Novas Aquisições
                                </h3>
                                <ChurnChart months={context.months} />
                            </div>
                        </div>

                        {/* Monthly Detail Table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 overflow-hidden">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                <MessageSquare size={16} className="text-slate-400" />
                                Detalhamento Mensal
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                                            <th className="py-3 px-3">Mês</th>
                                            <th className="py-3 px-3 text-right">MRR</th>
                                            <th className="py-3 px-3 text-right">Setup</th>
                                            <th className="py-3 px-3 text-right">Total</th>
                                            <th className="py-3 px-3 text-center">Propostas</th>
                                            <th className="py-3 px-3 text-center">Aceitas</th>
                                            <th className="py-3 px-3 text-center">Conversão</th>
                                            <th className="py-3 px-3 text-center">Novos</th>
                                            <th className="py-3 px-3 text-center">Churn</th>
                                            <th className="py-3 px-3 text-center">Ativos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs">
                                        {context.months.map((m, i) => (
                                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                                <td className="py-3 px-3 font-bold text-white">{m.monthLabel}</td>
                                                <td className="py-3 px-3 text-right text-brand-coral font-medium">{formatCurrency(m.mrr)}</td>
                                                <td className="py-3 px-3 text-right text-blue-400 font-medium">{formatCurrency(m.setupRevenue)}</td>
                                                <td className="py-3 px-3 text-right text-white font-bold">{formatCurrency(m.totalRevenue)}</td>
                                                <td className="py-3 px-3 text-center text-slate-400">{m.totalProposals}</td>
                                                <td className="py-3 px-3 text-center text-emerald-400 font-medium">{m.acceptedProposals}</td>
                                                <td className="py-3 px-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.conversionRate >= 50 ? 'text-emerald-400 bg-emerald-400/10' :
                                                            m.conversionRate >= 25 ? 'text-amber-400 bg-amber-400/10' :
                                                                'text-slate-500 bg-slate-800'
                                                        }`}>
                                                        {m.conversionRate}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-center text-emerald-400 font-medium">{m.newContracts}</td>
                                                <td className="py-3 px-3 text-center text-red-400 font-medium">{m.churnedContracts}</td>
                                                <td className="py-3 px-3 text-center text-white font-bold">{m.activeClients}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-32">
                        <BarChart3 size={48} className="mx-auto text-slate-700 mb-4" />
                        <p className="text-slate-500">Não foi possível carregar os dados comerciais.</p>
                    </div>
                )}
            </main>

            {/* Chatbot */}
            <CommercialChatbot context={context} isGestor={userRole === 'gestor' || userRole === 'admin'} />
        </div>
    );
};

export default CommercialDashboard;
