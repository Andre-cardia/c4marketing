import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Calendar, User, Clock, CheckCircle2, Circle, AlertCircle, PlayCircle, PauseCircle, TrendingUp, TrendingDown, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

interface GenUIParserProps {
    content: string;
}

const getTaskStatusInfo = (status: string) => {
    switch (status) {
        case 'done': return { label: 'Concluído', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 };
        case 'in_progress': return { label: 'Em Andamento', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: PlayCircle };
        case 'approval': return { label: 'Em Aprovação', color: 'text-purple-500 bg-purple-500/10 border-purple-500/20', icon: Clock };
        case 'paused': return { label: 'Pausado', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: PauseCircle };
        case 'canceled': return { label: 'Cancelado', color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: AlertCircle };
        default: return { label: 'Backlog', color: 'text-slate-500 bg-slate-500/10 border-slate-500/20', icon: Circle };
    }
};

const getPriorityColor = (p: string) => {
    switch (p) {
        case 'high': return 'text-red-500';
        case 'medium': return 'text-amber-500';
        case 'low': return 'text-emerald-500';
        default: return 'text-slate-400';
    }
};

export const GenUIParser: React.FC<GenUIParserProps> = ({ content }) => {
    if (!content || typeof content !== 'string') return null;

    // Use console.log to debug browser execution
    console.log('[GenUIParser] Receiving Content Length:', content.length);

    // Extract markdown text and ```json ... ``` blocks securely using string indices
    const parts = [];
    let remaining = content;

    while (remaining.length > 0) {
        const startTag = '```json';
        const endIndexStr = '```';
        const startIndex = remaining.indexOf(startTag);

        if (startIndex === -1) {
            // No more json blocks
            parts.push({ type: 'text', content: remaining });
            break;
        }

        // Push text before the json block
        if (startIndex > 0) {
            parts.push({ type: 'text', content: remaining.slice(0, startIndex) });
        }

        // Advance to start of json payload
        let blockRemaining = remaining.slice(startIndex + startTag.length);

        // Find the END of this specific block
        const endIndex = blockRemaining.indexOf(endIndexStr);

        if (endIndex === -1) {
            // Unclosed json block - push the rest as text
            parts.push({ type: 'text', content: startTag + blockRemaining });
            break;
        }

        // Extract the raw json string
        let jsonStr = blockRemaining.slice(0, endIndex).trim();

        // Push the Gen UI block
        try {
            const parsedData = JSON.parse(jsonStr);
            parts.push({ type: 'gen_ui', data: parsedData });
        } catch (e: any) {
            console.error('[GenUIParser] Parse Error:', e.message);
            parts.push({
                type: 'gen_ui',
                data: {
                    type: 'parser_error',
                    error: e.message,
                    snippet: jsonStr.substring(0, 300) || 'N/A'
                }
            });
            // Adiciona fallback texto bruto
            parts.push({
                type: 'text',
                content: `${startTag}\n${jsonStr}\n${endIndexStr}`
            });
        }

        // Advance the remaining string state
        remaining = blockRemaining.slice(endIndex + endIndexStr.length);
    }

    console.log('[GenUIParser] Total parts generated:', parts.length);

    return (
        <div className="flex flex-col gap-4">
            {parts.map((part, index) => {
                if (part.type === 'text') {
                    // Texto comum passa pelo Markdown nativo
                    return (
                        <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>
                                {part.content}
                            </ReactMarkdown>
                        </div>
                    );
                }

                if (part.type === 'gen_ui') {
                    // Aqui vamos plugar os componentes de UI dinamica!
                    const data = part.data;

                    if (data.type === 'task_list') {
                        const items = Array.isArray(data.items) ? data.items : [];
                        return (
                            <div key={index} className="flex flex-col gap-3 my-4">
                                {items.map((task: any, i: number) => {
                                    const st = getTaskStatusInfo(task.status);
                                    const StatusIcon = st.icon;
                                    const isOverdue = task.is_overdue || false;

                                    return (
                                        <div key={task.id || i} className="group relative bg-[#1E293B]/60 backdrop-blur-sm border border-white/10 hover:border-white/20 p-4 rounded-xl shadow-lg transition-all duration-300">
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                                    <div className={`mt-1 flex-shrink-0 ${st.color.split(' ')[0]}`}>
                                                        <StatusIcon size={18} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                                {task.client_name || 'Projeto'}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${st.color}`}>
                                                                {st.label}
                                                            </span>
                                                            {isOverdue && (
                                                                <span className="px-2 py-0.5 justify-center flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 text-[10px] font-medium text-red-400">
                                                                    <AlertCircle size={10} /> Atrasada
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h4 className="text-sm font-semibold text-slate-100 line-clamp-2">
                                                            {task.title}
                                                        </h4>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pl-7 pr-2">
                                                {/* Description Preview */}
                                                {task.description && (
                                                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                                                        {task.description.replace(/[-*]\s/g, '')}
                                                    </p>
                                                )}

                                                {/* Meta Info */}
                                                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                                                    {task.due_date && (
                                                        <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-400' : ''}`}>
                                                            <Calendar size={13} />
                                                            <span>{format(parseISO(task.due_date), 'dd MMM yyyy', { locale: ptBR })}</span>
                                                        </div>
                                                    )}
                                                    {task.assignee && (
                                                        <div className="flex items-center gap-1.5">
                                                            <User size={13} />
                                                            <span>{task.assignee}</span>
                                                        </div>
                                                    )}
                                                    {task.priority && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`w-1.5 h-1.5 rounded-full bg-current ${getPriorityColor(task.priority)}`} />
                                                            <span className="capitalize">{
                                                                task.priority === 'high' ? 'Alta' :
                                                                    task.priority === 'medium' ? 'Média' : 'Baixa'
                                                            }</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }

                    if (data.type === 'user_list') {
                        const users = Array.isArray(data.items) ? data.items : [];
                        const roleLabels: Record<string, string> = {
                            'gestor': 'Gestor',
                            'operacional': 'Operacional',
                            'cliente': 'Cliente',
                            'admin': 'Administrador',
                        };
                        const roleColors: Record<string, string> = {
                            'gestor': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                            'operacional': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                            'cliente': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                            'admin': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                        };
                        return (
                            <div key={index} className="flex flex-col gap-2 my-3">
                                {users.map((user: any, idx: number) => {
                                    const roleLower = (user.role || '').toLowerCase();
                                    return (
                                        <div key={idx} className="bg-[#1E293B]/60 backdrop-blur-sm border border-white/10 p-4 rounded-xl flex items-center gap-4 hover:border-white/20 transition-all duration-300">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                                {(user.name || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-semibold text-slate-100 truncate">{user.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${roleColors[roleLower] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                                                        {roleLabels[roleLower] || user.role || 'Sem cargo'}
                                                    </span>
                                                    {user.last_access && (
                                                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                            <Clock size={10} /> Último acesso: {format(parseISO(user.last_access), 'dd MMM yyyy', { locale: ptBR })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }

                    if (data.type === 'access_list') {
                        const accessItems = Array.isArray(data.items) ? data.items : [];
                        return (
                            <div key={index} className="flex flex-col gap-2 my-3">
                                {accessItems.map((item: any, idx: number) => (
                                    <div key={idx} className="bg-[#1E293B]/60 backdrop-blur-sm border border-white/10 p-4 rounded-xl flex items-center gap-4 hover:border-white/20 transition-all duration-300">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                            {(item.name || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-slate-100 truncate">{item.name}</h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                    <User size={10} /> {item.total_accesses || 0} acessos
                                                </span>
                                                {item.last_access && (
                                                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                        <Clock size={10} /> Último: {format(parseISO(item.last_access), 'dd MMM yyyy HH:mm', { locale: ptBR })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    }

                    if (data.type === 'report') {
                        const isPositive = data.trend && data.trend.startsWith('+');
                        return (
                            <div key={index} className="bg-[#1E293B]/60 backdrop-blur-sm border border-white/10 p-6 rounded-2xl shadow-lg my-4 flex flex-col group hover:border-white/20 transition-all duration-300">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{data.title || 'Métrica'}</span>
                                    {data.icon === 'trending-up' ? (
                                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20"><TrendingUp size={16} /></div>
                                    ) : data.icon === 'trending-down' ? (
                                        <div className="p-2 bg-red-500/10 rounded-lg text-red-400 border border-red-500/20"><TrendingDown size={16} /></div>
                                    ) : (
                                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20"><CheckCircle2 size={16} /></div>
                                    )}
                                </div>
                                <h3 className="text-3xl font-light text-white tracking-tight">{data.value || 'N/A'}</h3>
                                {data.trend && (
                                    <div className="mt-4 flex items-center gap-2">
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isPositive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                            {data.trend}
                                        </span>
                                        {data.subtitle && <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{data.subtitle}</span>}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    if (data.type === 'chart') {
                        const chartData = Array.isArray(data.data) ? data.data : [];
                        const chartType = data.chartType || 'bar'; // 'bar', 'line', 'pie'
                        const xAxisKey = data.xAxis || 'name';
                        const series = Array.isArray(data.series) ? data.series : [{ key: 'value', color: '#6366f1' }];
                        const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'];

                        return (
                            <div key={index} className="bg-[#1E293B]/60 backdrop-blur-sm border border-white/10 p-5 rounded-2xl shadow-lg my-4 group hover:border-white/20 transition-all duration-300">
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-6">{data.title || 'Gráfico'}</h4>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        {chartType === 'line' ? (
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} vertical={false} />
                                                <XAxis dataKey={xAxisKey} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => data.isCurrency ? `R$${val}` : val} />
                                                <RechartsTooltip
                                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#f1f5f9', fontSize: '12px' }}
                                                    itemStyle={{ color: '#e2e8f0' }}
                                                />
                                                {series.map((s: any, idx: number) => (
                                                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key} stroke={s.color || COLORS[idx % COLORS.length]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                                ))}
                                            </LineChart>
                                        ) : chartType === 'pie' ? (
                                            <PieChart>
                                                <Pie data={chartData} dataKey={series[0]?.key || "value"} nameKey={xAxisKey} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                                                    {chartData.map((entry: any, idx: number) => (
                                                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#f1f5f9', fontSize: '12px' }} />
                                            </PieChart>
                                        ) : (
                                            <BarChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} vertical={false} />
                                                <XAxis dataKey={xAxisKey} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => data.isCurrency ? `R$${val}` : val} />
                                                <RechartsTooltip
                                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#f1f5f9', fontSize: '12px' }}
                                                    cursor={{ fill: '#334155', opacity: 0.4 }}
                                                />
                                                {series.map((s: any, idx: number) => (
                                                    <Bar key={s.key} dataKey={s.key} name={s.name || s.key} fill={s.color || COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                                                ))}
                                            </BarChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        );
                    }

                    if (data.type === 'image_grid') {
                        const items = Array.isArray(data.items) ? data.items : [];
                        return (
                            <div key={index} className="my-4">
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3">{data.title || 'Arquivos Visuais'}</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    {items.map((img: any, i: number) => (
                                        <div key={i} className="group relative rounded-xl overflow-hidden bg-slate-800 border border-slate-700 aspect-video">
                                            {img.url ? (
                                                <img src={img.url} alt={img.caption || 'Imagem'} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={24} /></div>
                                            )}
                                            {img.caption && (
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                                                    <p className="text-xs text-white font-medium line-clamp-2">{img.caption}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    if (data.type === 'parser_error') {
                        return (
                            <div key={index} className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl my-2 text-xs">
                                <span className="text-red-400 font-bold mb-1 block">Crash parsing JSON: {data.error}</span>
                                <pre className="text-slate-400 whitespace-pre-wrap">{data.snippet}</pre>
                            </div>
                        );
                    }

                    // Se não for um tipo conhecido ainda, desenha o Raw Data JSON pra debug por enquanto
                    return (
                        <div key={index} className="bg-slate-800 border border-slate-700 p-4 rounded-xl my-2 text-xs overflow-auto">
                            <span className="text-slate-400 mb-2 block font-mono">Componente não reconhecido: {data.type}</span>
                            <pre className="text-green-400">{JSON.stringify(data, null, 2)}</pre>
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
};
