import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import {
    MessageSquare, Plus, FileText, Upload, Send, Bot, User,
    MoreHorizontal, Trash2, Search, Paperclip, Loader2, X, RefreshCw, Database
} from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import { supabase } from '../lib/supabase';
import {
    createChatSession, getChatSessions, getChatMessages, addChatMessage,
    addToBrain, askBrain, ChatSession, ChatMessage
} from '../lib/brain';

export default function BrainManager() {
    const { userRole, avatarUrl } = useUserRole();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    }, [messages]);

    const loadSessions = async () => {
        try {
            const data = await getChatSessions();
            setSessions(data);
            if (data.length > 0 && !currentSessionId) {
                setCurrentSessionId(data[0].id);
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
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
            const newSession = await createChatSession('Nova Conversa');
            setSessions([newSession, ...sessions]);
            setCurrentSessionId(newSession.id);
        } catch (error) {
            console.error('Failed to create session:', error);
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        let sessionId = currentSessionId;
        const userMsgContent = input;

        // Se não houver sessão ativa, cria uma nova
        if (!sessionId) {
            setIsLoading(true);
            try {
                const newSession = await createChatSession('Nova Conversa');
                setSessions([newSession, ...sessions]);
                setCurrentSessionId(newSession.id);
                sessionId = newSession.id;
            } catch (err) {
                console.error('Falha ao criar sessão:', err);
                setIsLoading(false);
                return;
            }
        }

        setInput('');

        // Optimistic update
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
            // 1. Persistência local de histórico (não bloqueia resposta da IA)
            try {
                await addChatMessage(sessionId, 'user', userMsgContent);
            } catch (persistUserError) {
                console.error('Falha ao salvar mensagem do usuário no histórico:', persistUserError);
            }

            // 2. Save User Message to Brain (Memory)
            addToBrain(userMsgContent, {
                type: 'chat_log',
                role: 'user',
                timestamp: new Date().toISOString(),
                status: 'active',
                session_id: sessionId
            }).catch(console.error);

            // 3. Ask Brain (RAG) — com fallback automático sem session_id se a primeira tentativa falhar
            let response;
            try {
                response = await askBrain(userMsgContent, sessionId);
            } catch (primaryAskError: any) {
                console.error('Falha ao chamar chat-brain com session_id, tentando fallback sem session_id:', primaryAskError);
                response = await askBrain(userMsgContent);
            }
            const aiMsgContent = response.answer;

            // 4. Save AI Message to DB (não bloqueia)
            let assistantPersisted = false;
            try {
                await addChatMessage(sessionId, 'assistant', aiMsgContent);
                assistantPersisted = true;
            } catch (persistAssistantError) {
                console.error('Falha ao salvar resposta da IA no histórico:', persistAssistantError);
            }

            // 5. Save AI Message to Brain (Memory)
            addToBrain(aiMsgContent, {
                type: 'chat_log',
                role: 'assistant',
                timestamp: new Date().toISOString(),
                status: 'active',
                session_id: sessionId,
                related_query: userMsgContent
            }).catch(console.error);

            // Refresh messages to get real IDs; fallback otimista se persistência falhar
            if (assistantPersisted) {
                loadMessages(sessionId);
            } else {
                const fallbackAiMsg: ChatMessage = {
                    id: 'temp-ai-' + Date.now(),
                    session_id: sessionId,
                    role: 'assistant',
                    content: aiMsgContent,
                    created_at: new Date().toISOString()
                };
                setMessages(prev => [...prev, fallbackAiMsg]);
            }

        } catch (error: any) {
            console.error('Failed to send message:', error);
            let debugMessage = '';
            if (error && typeof error === 'object' && 'context' in error) {
                try {
                    const body = await error.context.json();
                    debugMessage = body?.error ? ` Detalhes: ${body.error}` : '';
                } catch {
                    debugMessage = '';
                }
            } else if (error?.message) {
                debugMessage = ` Detalhes: ${error.message}`;
            }
            const errorMsg: ChatMessage = {
                id: 'temp-error-' + Date.now(),
                session_id: sessionId,
                role: 'assistant',
                content: `Não consegui responder agora por um erro de integração. Tente novamente em alguns segundos.${debugMessage}`,
                created_at: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };



    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Simple text extraction for .txt and basic handling
            // For PDF we would need a library like pdfjs-dist, but keeping it simple for now or assuming text
            let content = '';

            if (file.type === 'text/plain') {
                content = await file.text();
            } else if (file.type === 'application/pdf') {
                // Placeholder: Real PDF extraction requires additional libraries not present
                // We will inform the user or use a simple alert for now
                alert('Upload de PDF requer processamento adicional. Por favor use arquivos de texto (.txt) por enquanto ou copie e cole o conteúdo.');
                setIsUploading(false);
                return;
            } else {
                alert('Formato não suportado. Apenas .txt por enquanto.');
                setIsUploading(false);
                return;
            }

            // Upload text to Brain
            await addToBrain(content, {
                type: 'document',
                source: file.name,
                timestamp: new Date().toISOString(),
                uploaded_by_user: true
            });

            // Notify in chat
            const notification = `Arquivo "${file.name}" foi processado e adicionado ao meu cérebro.`;
            if (currentSessionId) {
                await addChatMessage(currentSessionId, 'assistant', notification);
                loadMessages(currentSessionId);
            }

        } catch (error) {
            console.error('Upload failed:', error);
            alert('Falha ao processar arquivo.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (userRole !== 'gestor') {
        return (
            <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-slate-900 dark:text-white">
                <p>Acesso restrito a gestores.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
            <Header />

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col hidden md:flex">
                    <div className="p-4">
                        <button
                            onClick={handleNewChat}
                            className="w-full flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20 font-medium text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Nova Conversa
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
                        <p className="px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Histórico</p>
                        {sessions.map(session => (
                            <button
                                key={session.id}
                                onClick={() => setCurrentSessionId(session.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center gap-3 transition-colors ${currentSessionId === session.id
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                                    }`}
                            >
                                <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                                <span className="truncate">{session.title}</span>
                            </button>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 px-2 py-2 text-slate-500 dark:text-slate-400 text-sm">
                            <div className="w-8 h-8 rounded-full bg-brand-coral/20 flex items-center justify-center text-brand-coral font-bold overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Gestor" className="w-full h-full object-cover" />
                                ) : (
                                    <span>G</span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 dark:text-slate-200 truncate">Gestor</p>
                                <p className="text-xs text-slate-500 dark:text-slate-500 truncate">Gerenciamento</p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Chat Area */}
                <main className="flex-1 flex flex-col min-w-0 bg-white/50 dark:bg-slate-950/50">
                    {/* Toolbar / Mobile Header */}
                    <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/50 backdrop-blur-md">
                        <h2 className="font-semibold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                            <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            {sessions.find(s => s.id === currentSessionId)?.title || 'Nova Conversa'}
                        </h2>

                        <div className="flex items-center gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".txt,.md,.pdf" // PDF support is strictly placeholder for now
                                onChange={handleFileUpload}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md text-sm transition-colors border border-slate-200 dark:border-slate-700"
                            >
                                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                <span className="hidden sm:inline">Upload Arquivo</span>
                            </button>
                        </div>
                    </div>

                    {/* Messages List */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-70 dark:opacity-50 space-y-4">
                                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4 border border-slate-200 dark:border-slate-700">
                                    <Bot className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <h3 className="text-xl font-medium text-slate-800 dark:text-slate-300">Segundo Cérebro Corporativo</h3>
                                <p className="max-w-md text-slate-500">
                                    Comece uma conversa para analisar dados, criar estratégias ou gerenciar informações da empresa.
                                </p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                                            <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                    )}

                                    <div className={`space-y-1 ${msg.role === 'user' ? 'items-end flex flex-col' : ''} max-w-[85%] md:max-w-[75%]`}>
                                        <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-none shadow-sm'
                                            }`}>
                                            {msg.content}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-600 px-1 opacity-0 hover:opacity-100 transition-opacity">
                                            {new Date(msg.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-1 overflow-hidden">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
                        <div className="max-w-4xl mx-auto relative">
                            <form onSubmit={handleSendMessage} className="relative">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Digite sua mensagem para o cérebro..."
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl py-4 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                                    disabled={isLoading}
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    className="absolute right-2 top-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </button>
                            </form>
                            <p className="text-center text-[10px] text-slate-400 dark:text-slate-600 mt-2">
                                O Segundo Cérebro pode cometer erros. Verifique informações importantes.
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </div>

    );
}
