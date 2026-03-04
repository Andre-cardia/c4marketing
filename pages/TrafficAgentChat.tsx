import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquare, Plus, Send, Trash2, User } from 'lucide-react';
import {
    addChatMessage,
    askBrain,
    ChatMessage,
    ChatSession,
    createChatSession,
    deleteChatSession,
    getChatMessages,
    getChatSessions,
    isTrafficSession,
    buildTrafficSessionTitle,
    formatTrafficSessionTitle,
    updateChatSessionTitle,
    TRAFFIC_SESSION_PREFIX,
} from '../lib/brain';
import { useUserRole } from '../lib/UserRoleContext';
import { GenUIParser } from '../components/chat/GenUIParser';


const WELCOME_MESSAGE = `Olá! Sou o Agente Especialista em Gestão de Tráfego da C4.

Posso analisar o questionário inicial do cliente e montar uma estratégia completa de campanhas para Google Ads e Meta Ads, com plano de execução e relatório pronto para apresentação.`;

const TRAFFIC_SCOPE_BLOCK_MESSAGE = 'Escopo restrito do Agente Especialista em Gestão de Tráfego: aqui eu só consulto dados de clientes, tarefas e respostas de questionário. Dados comerciais/financeiros (propostas, MRR, ARR, faturamento e pricing) não são atendidos neste chat.';

function normalizeText(value: string): string {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function isTrafficOutOfScopeIntent(text: string): boolean {
    const normalized = normalizeText(text);
    const blockedTerms = [
        'mrr', 'arr', 'faturamento', 'receita', 'run rate', 'recorrente',
        'mensalidade', 'ticket medio', 'financeiro', 'financeira',
        'proposta', 'propostas', 'orcamento', 'pricing', 'comercial',
        'pipeline comercial', 'funil comercial', 'taxa de fechamento'
    ];
    return blockedTerms.some((term) => normalized.includes(normalizeText(term)));
}

export default function TrafficAgentChat() {
    const { avatarUrl, userRole, loading: roleLoading } = useUserRole();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const currentSession = useMemo(
        () => sessions.find((session) => session.id === currentSessionId) || null,
        [sessions, currentSessionId]
    );

    useEffect(() => {
        loadTrafficSessions();
    }, []);

    useEffect(() => {
        if (!currentSessionId) {
            setMessages([]);
            return;
        }
        loadSessionMessages(currentSessionId);
    }, [currentSessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const loadTrafficSessions = async () => {
        setIsSessionsLoading(true);
        try {
            const allSessions = await getChatSessions();
            const trafficSessions = allSessions.filter(isTrafficSession);
            setSessions(trafficSessions);
            if (!currentSessionId && trafficSessions.length > 0) {
                setCurrentSessionId(trafficSessions[0].id);
            }
        } catch (error) {
            console.error('Falha ao carregar histórico do agente de tráfego:', error);
        } finally {
            setIsSessionsLoading(false);
        }
    };

    const loadSessionMessages = async (sessionId: string) => {
        setIsLoading(true);
        try {
            const sessionMessages = await getChatMessages(sessionId);
            setMessages(sessionMessages);
        } catch (error) {
            console.error('Falha ao carregar mensagens da sessão:', error);
            setMessages([]);
        } finally {
            setIsLoading(false);
        }
    };

    const createNewTrafficSession = async (): Promise<string | null> => {
        try {
            const title = buildTrafficSessionTitle();
            const session = await createChatSession(title);
            setSessions((prev) => [session, ...prev]);
            setCurrentSessionId(session.id);
            setMessages([]);
            return session.id;
        } catch (error) {
            console.error('Falha ao criar nova sessão do agente de tráfego:', error);
            return null;
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (confirmDeleteId !== sessionId) {
            setConfirmDeleteId(sessionId);
            // Auto-cancelar confirmação após 3 segundos sem ação
            setTimeout(() => setConfirmDeleteId((prev) => (prev === sessionId ? null : prev)), 3000);
            return;
        }

        setConfirmDeleteId(null);
        setDeletingSessionId(sessionId);
        setDeleteError(null);
        try {
            console.log('[TrafficAgent] Tentando excluir sessão:', sessionId);
            const result = await deleteChatSession(sessionId);
            console.log('[TrafficAgent] Sessão excluída com sucesso:', result);

            const remainingSessions = sessions.filter((item) => item.id !== sessionId);
            setSessions(remainingSessions);

            if (currentSessionId === sessionId) {
                const nextSessionId = remainingSessions[0]?.id ?? null;
                setCurrentSessionId(nextSessionId);
                if (!nextSessionId) {
                    setMessages([]);
                }
            }
        } catch (error: any) {
            console.error('Falha ao excluir sessão do agente de tráfego:', error);
            setDeleteError(error?.message || 'Erro ao excluir conversa. Verifique o console.');
        } finally {
            setDeletingSessionId(null);
        }
    };

    const handleSend = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!input.trim() || isLoading) return;

        let activeSessionId = currentSessionId;
        if (!activeSessionId) {
            activeSessionId = await createNewTrafficSession();
            if (!activeSessionId) return;
        }

        const userContent = input.trim();
        setInput('');

        const optimisticUserMessage: ChatMessage = {
            id: `temp-user-${Date.now()}`,
            session_id: activeSessionId,
            role: 'user',
            content: userContent,
            created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimisticUserMessage]);
        setIsLoading(true);

        if (isTrafficOutOfScopeIntent(userContent)) {
            try {
                await addChatMessage(activeSessionId, 'user', userContent);
                await addChatMessage(activeSessionId, 'assistant', TRAFFIC_SCOPE_BLOCK_MESSAGE);
                await loadSessionMessages(activeSessionId);
                await loadTrafficSessions();
            } catch (error) {
                console.error('Falha ao registrar bloqueio de escopo no agente de tráfego:', error);
                const fallbackScopeMessage: ChatMessage = {
                    id: `temp-scope-${Date.now()}`,
                    session_id: activeSessionId,
                    role: 'assistant',
                    content: TRAFFIC_SCOPE_BLOCK_MESSAGE,
                    created_at: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, fallbackScopeMessage]);
            } finally {
                setIsLoading(false);
            }
            return;
        }

        try {
            await addChatMessage(activeSessionId, 'user', userContent);
            const response = await askBrain(userContent, activeSessionId, {
                forcedAgent: 'Agent_MarketingTraffic',
            });

            const suggestedTitle = (response.meta?.suggested_session_title || '').trim();
            if (suggestedTitle) {
                // Prefix is required to keep isTrafficSession() working after DB reload
                const persistTitle = `${TRAFFIC_SESSION_PREFIX} ${suggestedTitle}`;
                // Persist to DB before reloading sessions list
                try {
                    await updateChatSessionTitle(activeSessionId, persistTitle);
                } catch (err) {
                    console.warn('[TrafficAgent] Failed to persist session title:', err);
                }
                setSessions(prev =>
                    prev.map(s => (s.id === activeSessionId ? { ...s, title: persistTitle } : s))
                );
            }

            await addChatMessage(activeSessionId, 'assistant', response.answer);
            await loadSessionMessages(activeSessionId);
            await loadTrafficSessions();
        } catch (error: any) {
            console.error('Falha ao enviar mensagem no agente de tráfego:', error);
            const fallbackErrorMessage: ChatMessage = {
                id: `temp-error-${Date.now()}`,
                session_id: activeSessionId,
                role: 'assistant',
                content: `Não consegui responder agora por um erro de integração. ${error?.message ? `Detalhes: ${error.message}` : ''
                    }`,
                created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, fallbackErrorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!roleLoading && userRole !== 'gestor') {
        return (
            <div className="flex items-center justify-center min-h-[400px] text-neutral-500">
                <p>Acesso restrito a gestores.</p>
            </div>
        );
    }

    return (
        <div className="text-slate-100">
            <div className="mb-5">
                <h1 className="text-2xl font-semibold text-white">Agente Especialista em Gestao de Trafego</h1>
                <p className="text-sm text-slate-400 mt-1">
                    Chat dedicado para diagnostico de questionario e construcao de estrategias de Google Ads e Meta Ads.
                </p>
            </div>

            <div className="h-[calc(100vh-250px)] min-h-[560px] border border-neutral-800 rounded-2xl bg-black/60 overflow-hidden">
                <div className="h-full flex">
                    <aside className="hidden md:flex w-72 border-r border-neutral-800 flex-col bg-neutral-950/70">
                        <div className="p-4 border-b border-neutral-800">
                            <button
                                onClick={() => createNewTrafficSession()}
                                className="w-full flex items-center justify-center gap-2 bg-brand-coral hover:bg-brand-coral/90 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Nova Conversa
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {isSessionsLoading ? (
                                <div className="px-3 py-2 text-xs text-slate-400">Carregando histórico...</div>
                            ) : sessions.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-500">
                                    Sem histórico ainda. Crie sua primeira conversa.
                                </div>
                            ) : (
                                sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={`w-full text-left px-3 py-3 rounded-lg text-sm transition-colors ${session.id === currentSessionId
                                            ? 'bg-neutral-800 text-white'
                                            : 'text-slate-400 hover:text-white hover:bg-neutral-900'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setCurrentSessionId(session.id)}
                                                className="flex-1 min-w-0 text-left"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                                                    <span className="truncate">{formatTrafficSessionTitle(session)}</span>
                                                </div>
                                            </button>
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleDeleteSession(session.id);
                                                }}
                                                disabled={deletingSessionId === session.id}
                                                className={`shrink-0 p-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${confirmDeleteId === session.id
                                                    ? 'text-rose-400 bg-rose-500/20 hover:bg-rose-500/30'
                                                    : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'
                                                    }`}
                                                title={confirmDeleteId === session.id ? 'Clique novamente para confirmar' : 'Excluir conversa'}
                                                aria-label="Excluir conversa"
                                            >
                                                {deletingSessionId === session.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </aside>

                    <main className="flex-1 flex flex-col min-w-0">
                        <div className="h-16 border-b border-neutral-800 px-5 flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 rounded-lg bg-brand-coral/15 text-brand-coral">
                                    <Bot className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">
                                        {currentSession ? formatTrafficSessionTitle(currentSession) : 'Agente de Gestao de Trafego'}
                                    </p>
                                    <p className="text-[11px] uppercase tracking-wider text-slate-500">
                                        Google Ads + Meta Ads
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => createNewTrafficSession()}
                                className="md:hidden text-xs text-slate-300 border border-neutral-700 px-2 py-1 rounded"
                            >
                                Nova
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 custom-scrollbar">
                            {messages.length === 0 && !isLoading && (
                                <div className="max-w-4xl">
                                    <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 mb-2">
                                        <Bot className="w-3 h-3" />
                                        Agente de Gestao de Trafego
                                    </div>
                                    <div className="bg-neutral-800/70 border border-neutral-700 rounded-xl p-4 text-sm text-slate-200 whitespace-pre-wrap">
                                        {WELCOME_MESSAGE}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-brand-coral/20 flex items-center justify-center shrink-0">
                                            <Bot className="w-4 h-4 text-brand-coral" />
                                        </div>
                                    )}

                                    <div
                                        className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-brand-coral text-white rounded-br-md'
                                            : 'bg-neutral-800/70 border border-neutral-700 text-slate-100 rounded-bl-md custom-thesys-wrapper'
                                            }`}
                                    >
                                        {msg.role === 'user' ? (
                                            msg.content
                                        ) : (
                                            <GenUIParser content={msg.content} />
                                        )}
                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt="Usuário" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-4 h-4 text-slate-300" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-brand-coral/20 flex items-center justify-center shrink-0">
                                        <Bot className="w-4 h-4 text-brand-coral" />
                                    </div>
                                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-3">
                                        <Loader2 className="w-4 h-4 animate-spin text-brand-coral" />
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSend} className="border-t border-neutral-800 p-4">
                            <div className="relative">
                                <input
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    placeholder="Ex: monte a estrategia inicial da Amplexo com base no questionario de trafego..."
                                    className="w-full bg-neutral-950 border border-neutral-700 text-slate-100 placeholder-slate-500 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-brand-coral/60"
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-coral text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </form>
                    </main>
                </div>
            </div>
        </div>
    );
}
