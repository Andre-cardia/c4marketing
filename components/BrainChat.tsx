import React, { useState, useRef, useEffect } from 'react';
import { askBrain, addToBrain, BrainDocument, createChatSession, addChatMessage } from '../lib/brain';
import { Send, Bot, User, Loader2, FileText, X } from 'lucide-react';
import { C1Component, ThemeProvider } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";
import { useUserRole } from '../lib/UserRoleContext';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: BrainDocument[];
}

export function BrainChat({ onClose }: { onClose?: () => void }) {
    const { avatarUrl } = useUserRole();
    const [query, setQuery] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Olá! Sou seu Segundo Cérebro Corporativo. Como posso ajudar com os dados da empresa hoje?' }
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
                const session = await createChatSession('Widget Brain Chat');
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
            const response = await askBrain(userMessage, activeSessionId || undefined);

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

            // Tenta extrair detalhes se for um erro da Edge Function (que retorna JSON no body)
            if (error && typeof error === 'object' && 'context' in error) {
                try {
                    const body = await error.context.json();
                    if (body.error) {
                        errorMessage = body.error;
                    } else {
                        errorMessage = JSON.stringify(body);
                    }
                } catch (e) {
                    // Falha ao ler JSON, mantém mensagem original
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
        <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 text-slate-100 rounded-xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                        <Bot className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">Segundo Cérebro</h3>
                        <span className="text-xs text-slate-400">RAG System Active</span>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-md transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-900/50">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-indigo-400" />
                            </div>
                        )}

                        <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                            <div
                                className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-br-none whitespace-pre-wrap'
                                    : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700 custom-thesys-wrapper'
                                    }`}
                            >
                                {msg.role === 'user' ? (
                                    msg.content
                                ) : (
                                    <ThemeProvider>
                                        <C1Component c1Response={
                                            msg.content
                                                .replace(/&quot;/g, '"')
                                                .replace(/&#39;/g, "'")
                                                .replace(/&lt;/g, '<')
                                                .replace(/&gt;/g, '>')
                                                .replace(/&amp;/g, '&')
                                        } />
                                    </ThemeProvider>
                                )}
                            </div>

                            {/* Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="flex flex-col gap-1 mt-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider ml-1">Fontes:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {msg.sources.map((source, sIdx) => (
                                            <div key={sIdx} className="bg-slate-800/50 border border-slate-700 rounded-md p-2 text-xs flex items-center gap-2 hover:bg-slate-800 transition-colors cursor-help group max-w-xs" title={source.content}>
                                                <FileText className="w-3 h-3 text-slate-400 group-hover:text-indigo-400" />
                                                <span className="truncate text-slate-400 group-hover:text-slate-200">
                                                    {source.metadata?.title || source.metadata?.source || 'Documento sem título'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-4 h-4 text-slate-300" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <Bot className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl rounded-bl-none">
                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleAsk} className="p-4 bg-slate-800/30 border-t border-slate-700">
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Pergunte ao cérebro corporativo..."
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!query.trim() || loading}
                        className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
}
