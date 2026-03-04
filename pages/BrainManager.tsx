import React, { useState, useEffect, useRef } from 'react';
import {
    MessageSquare, Plus, FileText, Upload, Send, Bot, User,
    MoreHorizontal, Trash2, Search, Paperclip, Loader2, X, RefreshCw, Database
} from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import { supabase } from '../lib/supabase';
import {
    createChatSession, getChatSessions, getChatMessages, addChatMessage,
    addToBrain, askBrain, ChatSession, ChatMessage, isTrafficSession, deleteChatSession,
    updateChatSessionTitle
} from '../lib/brain';
import { GenUIParser } from '../components/chat/GenUIParser';

export default function BrainManager() {
    const { userRole, avatarUrl } = useUserRole();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Initial Load
    useEffect(() => {
        loadSessions();
    }, []);

    // Load messages when session changes
    useEffect(() => {
        if (currentSessionId) {
            loadMessages(currentSessionId);
        } else {
            setMessages([]);
        }
    }, [currentSessionId]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const loadSessions = async () => {
        setIsSessionsLoading(true);
        try {
            const data = await getChatSessions();
            const brainSessions = data.filter(s => !isTrafficSession(s));
            setSessions(brainSessions);
            if (brainSessions.length > 0 && !currentSessionId) {
                setCurrentSessionId(brainSessions[0].id);
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
        } finally {
            setIsSessionsLoading(false);
        }
    };

    const loadMessages = async (sessionId: string) => {
        setIsLoading(true);
        try {
            const data = await getChatMessages(sessionId);
            setMessages(data);
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewChat = async () => {
        try {
            const newSession = await createChatSession('Conversa: ' + new Date().toLocaleDateString('pt-BR'));
            setSessions([newSession, ...sessions]);
            setCurrentSessionId(newSession.id);
            setMessages([]);
        } catch (error) {
            console.error('Failed to create session:', error);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (confirmDeleteId !== sessionId) {
            setConfirmDeleteId(sessionId);
            setTimeout(() => setConfirmDeleteId((prev) => (prev === sessionId ? null : prev)), 3000);
            return;
        }
        setConfirmDeleteId(null);
        setDeletingSessionId(sessionId);
        try {
            await deleteChatSession(sessionId);
            const remaining = sessions.filter((s) => s.id !== sessionId);
            setSessions(remaining);
            if (currentSessionId === sessionId) {
                setCurrentSessionId(remaining[0]?.id ?? null);
            }
        } catch (err) {
            console.error('Erro ao excluir sessão:', err);
        } finally {
            setDeletingSessionId(null);
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        let sessionId = currentSessionId;
        const userMsgContent = input.trim();
        setInput('');

        if (!sessionId) {
            setIsLoading(true);
            try {
                const newSession = await createChatSession('Conversa Estratégica');
                setSessions([newSession, ...sessions]);
                setCurrentSessionId(newSession.id);
                sessionId = newSession.id;
            } catch (err) {
                console.error('Falha ao criar sessão:', err);
                setIsLoading(false);
                return;
            }
        }

        const tempUserMsg: ChatMessage = {
            id: 'temp-' + Date.now(),
            session_id: sessionId,
            role: 'user',
            content: userMsgContent,
            created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempUserMsg]);
        setIsLoading(true);

        try {
            // 1. Persist user message
            await addChatMessage(sessionId, 'user', userMsgContent);

            // 2. Get AI response (Returns { answer, documents })
            const response = await askBrain(userMsgContent, sessionId);

            // 2.1. Renomear sessão com sugestão do LLM (primeira mensagem)
            const suggestedTitle = (response.meta?.suggested_session_title || '').trim();
            if (suggestedTitle) {
                // Persist to DB first (client-side fallback in case backend update failed)
                updateChatSessionTitle(sessionId!, suggestedTitle).catch(err =>
                    console.warn('[BrainManager] Failed to persist session title:', err)
                );
                setSessions(prev =>
                    prev.map(s => (s.id === sessionId ? { ...s, title: suggestedTitle } : s))
                );
            }

            // 3. Persist AI message (Access .answer)
            await addChatMessage(sessionId, 'assistant', response.answer);

            // 4. Reload messages to get final IDs and order
            await loadMessages(sessionId);
        } catch (error: any) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                id: 'err-' + Date.now(),
                session_id: sessionId!,
                role: 'assistant',
                content: `❌ Erro: ${error?.message || 'Erro ao processar mensagem.'}`,
                created_at: new Date().toISOString()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const text = await file.text();
            await addToBrain(text, { fileName: file.name, type: 'upload' });
            alert('Arquivo processado e adicionado ao cérebro com sucesso!');
        } catch (error) {
            console.error('Upload error:', error);
            alert('Falha ao processar arquivo.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (userRole !== 'gestor') {
        return (
            <div className="flex items-center justify-center min-h-[400px] text-neutral-500">
                <p>Acesso restrito a gestores.</p>
            </div>
        );
    }

    return (
        <div className="text-slate-900 dark:text-neutral-100 flex flex-col h-full">
            <div className="mb-5">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Chat com o Cérebro</h1>
                <p className="text-xs text-slate-500 dark:text-neutral-500 font-bold uppercase tracking-widest mt-1">
                    Interface estratégica de consulta ao conhecimento corporativo.
                </p>
            </div>

            <div className="h-[calc(100vh-250px)] min-h-[600px] border border-slate-200 dark:border-neutral-800 rounded-c4 bg-white dark:bg-black/60 overflow-hidden flex shadow-lg dark:shadow-2xl">
                {/* Sidebar Conversas */}
                <aside className="hidden md:flex w-72 border-r border-slate-200 dark:border-neutral-800 flex-col bg-slate-50/50 dark:bg-neutral-950/70">
                    <div className="p-4 border-b border-slate-200 dark:border-neutral-800 shadow-sm dark:shadow-none bg-white dark:bg-transparent">
                        <button
                            onClick={handleNewChat}
                            className="w-full flex items-center justify-center gap-2 bg-brand-coral hover:bg-brand-coral/90 text-white px-4 py-2.5 rounded-c4 transition-all shadow-lg shadow-brand-coral/20 font-black text-xs uppercase tracking-widest"
                        >
                            <Plus size={16} /> Nova Conversa
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {isSessionsLoading ? (
                            <div className="px-4 py-3 text-[10px] text-slate-400 dark:text-neutral-500 uppercase font-black tracking-widest animate-pulse">Sincronizando sessões...</div>
                        ) : sessions.length === 0 ? (
                            <div className="px-4 py-8 text-center opacity-30">
                                <MessageSquare size={32} className="mx-auto mb-2 text-slate-300 dark:text-neutral-700" />
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-neutral-700">Sem conversas</p>
                            </div>
                        ) : (
                            sessions.map(session => (
                                <div
                                    key={session.id}
                                    className={`group w-full text-left px-4 py-3 rounded-c4 text-sm flex items-center gap-3 transition-all ${currentSessionId === session.id
                                        ? 'bg-slate-200/50 dark:bg-neutral-800 text-brand-coral border border-slate-300/50 dark:border-neutral-700 font-bold'
                                        : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/30 dark:hover:bg-neutral-900/50'
                                        }`}
                                >
                                    <button
                                        onClick={() => setCurrentSessionId(session.id)}
                                        className="flex-1 min-w-0 flex items-center gap-3 text-left"
                                    >
                                        <MessageSquare size={14} className={`shrink-0 ${currentSessionId === session.id ? 'opacity-100' : 'opacity-40'}`} />
                                        <span className="truncate">{session.title}</span>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                                        disabled={deletingSessionId === session.id}
                                        className={`shrink-0 p-1 rounded transition-colors disabled:opacity-40 ${confirmDeleteId === session.id
                                            ? 'text-rose-500 bg-rose-500/15 hover:bg-rose-500/25'
                                            : 'text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100'
                                            }`}
                                        title={confirmDeleteId === session.id ? 'Clique para confirmar exclusão' : 'Excluir conversa'}
                                    >
                                        {deletingSessionId === session.id
                                            ? <Loader2 size={13} className="animate-spin" />
                                            : <Trash2 size={13} />}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 bg-slate-100/50 dark:bg-black/40 border-t border-slate-200 dark:border-neutral-800">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-coral/10 flex items-center justify-center border border-brand-coral/20 overflow-hidden shadow-sm">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={16} className="text-brand-coral" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest truncate">Gestor Responsável</p>
                                <div className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-[9px] text-slate-500 dark:text-neutral-500 uppercase font-black tracking-tighter">Conectado</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Chat Area */}
                <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-neutral-900/30">
                    <header className="h-16 border-b border-slate-200 dark:border-neutral-800 px-6 flex items-center justify-between bg-white/80 dark:bg-black/20 backdrop-blur-sm shadow-sm dark:shadow-none">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-brand-coral/10 rounded-lg text-brand-coral border border-brand-coral/20">
                                <Bot size={18} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter">
                                    {sessions.find(s => s.id === currentSessionId)?.title || 'Cérebro Corporativo'}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase tracking-[0.2em] font-black">Diretor de Estratégia</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-600 dark:text-neutral-300 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200 dark:border-neutral-700 disabled:opacity-50 shadow-sm"
                            >
                                {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                <span className="hidden sm:inline">Upload de Contexto</span>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.pdf,.docx" />
                        </div>
                    </header>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white/40 dark:bg-black/10">
                        {messages.length === 0 && !isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <div className="p-6 bg-slate-100 dark:bg-neutral-800/20 rounded-full border border-slate-200 dark:border-neutral-800 mb-4 shadow-inner">
                                    <Database size={40} className="text-slate-300 dark:text-neutral-700" />
                                </div>
                                <h4 className="text-sm font-black text-slate-400 dark:text-neutral-500 uppercase tracking-widest">Memória Vetorial Pronta</h4>
                                <p className="text-[11px] max-w-xs mt-2 text-slate-500 dark:text-neutral-600 font-medium">Acesse o conhecimento da C4 Marketing via linguagem natural.</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center shrink-0 shadow-sm">
                                            <Bot size={16} className="text-brand-coral" />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[85%] p-4 rounded-c4 text-[13px] leading-relaxed shadow-sm ${msg.role === 'user'
                                            ? 'bg-brand-coral text-white rounded-br-none shadow-brand-coral/10'
                                            : 'bg-white dark:bg-neutral-800/70 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 rounded-bl-none custom-thesys-wrapper'
                                            }`}
                                    >
                                        {msg.role === 'user' ? (
                                            msg.content
                                        ) : (
                                            <GenUIParser content={msg.content} />
                                        )}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} className="text-slate-400 dark:text-neutral-500" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="flex gap-3 items-center">
                                    <div className="w-8 h-8 rounded-full bg-brand-coral/10 border border-brand-coral/20 flex items-center justify-center shadow-sm">
                                        <Bot size={16} className="text-brand-coral animate-pulse" />
                                    </div>
                                    <div className="bg-white dark:bg-neutral-800/40 border border-slate-200 dark:border-neutral-800 p-3 rounded-c4 rounded-bl-none">
                                        <Loader2 className="w-4 h-4 animate-spin text-brand-coral" />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <footer className="p-4 bg-white/80 dark:bg-black/40 border-t border-slate-200 dark:border-neutral-800 backdrop-blur-sm">
                        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3">
                            <div className="relative flex-1 group">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Pergunte ao Cérebro Corporativo..."
                                    className="w-full bg-white dark:bg-neutral-900/80 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 rounded-c4 px-5 py-3.5 text-sm focus:outline-none focus:border-brand-coral/50 focus:ring-1 focus:ring-brand-coral/20 transition-all shadow-sm dark:shadow-none"
                                    disabled={isLoading}
                                />
                                <div className="absolute inset-0 rounded-c4 border border-brand-coral/0 group-focus-within:border-brand-coral/20 pointer-events-none transition-all"></div>
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                className="bg-brand-coral hover:bg-brand-coral/90 disabled:opacity-50 text-white px-5 rounded-c4 transition-all shadow-lg shadow-brand-coral/20 flex items-center justify-center shrink-0"
                            >
                                <Send size={18} />
                            </button>
                        </form>
                    </footer>
                </main>
            </div>
        </div>
    );
}
