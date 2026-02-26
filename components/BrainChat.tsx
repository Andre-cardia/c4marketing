import React, { useState, useRef, useEffect } from 'react';
import { askBrain, addToBrain, BrainDocument, createChatSession, addChatMessage } from '../lib/brain';
import { Send, Bot, User, Loader2, FileText, X } from 'lucide-react';
import { GenUIParser } from './chat/GenUIParser';
import { useUserRole } from '../lib/UserRoleContext';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: BrainDocument[];
}

interface BrainChatProps {
    onClose?: () => void;
    forcedAgent?: string;
    initialMessage?: string;
    sessionTitle?: string;
    headerTitle?: string;
    headerSubtitle?: string;
    inputPlaceholder?: string;
}

export function BrainChat({
    onClose,
    forcedAgent,
    initialMessage = 'Olá! Sou seu Segundo Cérebro Corporativo. Como posso ajudar com os dados da empresa hoje?',
    sessionTitle = 'Widget Brain Chat',
    headerTitle = 'Segundo Cérebro',
    headerSubtitle = 'RAG System Active',
    inputPlaceholder = 'Pergunte ao cérebro corporativo...',
}: BrainChatProps) {
    const { avatarUrl } = useUserRole();
    const [query, setQuery] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: initialMessage }
    ]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleAsk = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!query.trim() || loading) return;

        let activeSessionId = sessionId;
        if (!activeSessionId) {
            try {
                const session = await createChatSession(sessionTitle);
                activeSessionId = session.id;
                setSessionId(session.id);
            } catch (err) {
                console.error('Failed to create widget chat session:', err);
            }
        }

        const userMessage = query;
        setQuery('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        if (activeSessionId) {
            addChatMessage(activeSessionId, 'user', userMessage).catch(err => {
                console.error('Failed to persist user message in widget session:', err);
            });
        }

        // Fire-and-forget: Save user message to Brain
        addToBrain(userMessage, {
            type: 'chat_log',
            role: 'user',
            timestamp: new Date().toISOString(),
            status: 'active',
            session_id: activeSessionId
        }).catch(err => console.error('Failed to save user chat log:', err));

        try {
            const response = await askBrain(
                userMessage,
                activeSessionId || undefined,
                forcedAgent ? { forcedAgent } : undefined
            );

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.answer,
                sources: response.documents
            }]);

            if (activeSessionId) {
                addChatMessage(activeSessionId, 'assistant', response.answer).catch(err => {
                    console.error('Failed to persist assistant message in widget session:', err);
                });
            }

            // Fire-and-forget: Save assistant message to Brain
            addToBrain(response.answer, {
                type: 'chat_log',
                role: 'assistant',
                timestamp: new Date().toISOString(),
                status: 'active',
                session_id: activeSessionId,
                related_query: userMessage
            }).catch(err => console.error('Failed to save assistant chat log:', err));

        } catch (error: any) {
            console.error('Brain Error:', error);

            let errorMessage = error.message || 'Erro desconhecido';

            if (error && typeof error === 'object' && 'context' in error) {
                try {
                    const body = await error.context.json();
                    if (body.error) {
                        errorMessage = body.error;
                    } else {
                        errorMessage = JSON.stringify(body);
                    }
                } catch (e) {
                    // Fallback
                }
            }

            if (errorMessage.includes('Failed to send a request')) {
                errorMessage = 'Falha de conexão. Verifique se as funções foram publicadas (deploy).';
            }

            if (errorMessage.includes('non-2xx status code')) {
                errorMessage = `Erro interno do Cérebro (Server Error). Detalhes: ${errorMessage}`;
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Erro: ${errorMessage}`
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-neutral-100 rounded-c4 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-brand-coral/10 rounded-lg">
                        <Bot className="w-5 h-5 text-brand-coral" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{headerTitle}</h3>
                        <span className="text-slate-500 dark:text-neutral-500 text-[10px] uppercase font-bold tracking-widest">{headerSubtitle}</span>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-md transition-colors">
                        <X className="w-5 h-5 text-slate-400 dark:text-neutral-500" />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-black/40">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-full bg-brand-coral/10 flex items-center justify-center flex-shrink-0 border border-brand-coral/20 shadow-sm">
                                <Bot className="w-4 h-4 text-brand-coral" />
                            </div>
                        )}

                        <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                            <div
                                className={`p-3 rounded-c4 text-[13px] leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-brand-coral text-white rounded-br-none whitespace-pre-wrap'
                                    : 'bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-bl-none border border-slate-200 dark:border-neutral-700 custom-thesys-wrapper'
                                    }`}
                            >
                                {msg.role === 'user' ? (
                                    msg.content
                                ) : (
                                    <GenUIParser content={msg.content} />
                                )}
                            </div>

                            {/* Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="flex flex-col gap-1 mt-2">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider ml-1">Fontes:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {msg.sources.map((source, sIdx) => (
                                            <div key={sIdx} className="bg-white dark:bg-neutral-800/50 border border-slate-200 dark:border-neutral-700 rounded-lg p-2 text-[10px] flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors cursor-help group max-w-xs shadow-sm" title={source.content}>
                                                <FileText className="w-3 h-3 text-slate-400 dark:text-neutral-400 group-hover:text-brand-coral" />
                                                <span className="truncate text-slate-500 dark:text-neutral-400 group-hover:text-brand-coral transition-colors">
                                                    {source.metadata?.title || source.metadata?.source || 'Doc'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-4 h-4 text-slate-400 dark:text-neutral-400" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-coral/10 flex items-center justify-center flex-shrink-0 border border-brand-coral/20">
                            <Bot className="w-4 h-4 text-brand-coral" />
                        </div>
                        <div className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-800 p-3 rounded-c4 rounded-bl-none shadow-sm">
                            <Loader2 className="w-4 h-4 text-brand-coral animate-spin" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input gratitude */}
            <form onSubmit={handleAsk} className="p-4 bg-white dark:bg-neutral-950/80 border-t border-slate-200 dark:border-neutral-800">
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={inputPlaceholder}
                        className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-neutral-100 placeholder-slate-400 dark:placeholder-neutral-500 text-[13px] rounded-c4 py-3 pl-4 pr-12 focus:outline-none focus:ring-1 focus:ring-brand-coral/50 focus:border-brand-coral/50 transition-all shadow-inner dark:shadow-none"
                    />
                    <button
                        type="submit"
                        disabled={!query.trim() || loading}
                        className="absolute right-2 p-2 bg-brand-coral hover:bg-brand-coral/90 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-brand-coral/20"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
}
