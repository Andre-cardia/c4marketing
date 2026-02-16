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
    const { userRole } = useUserRole();
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
            // 1. Save User Message to DB
            await addChatMessage(sessionId, 'user', userMsgContent);

            // 2. Save User Message to Brain (Memory)
            addToBrain(userMsgContent, {
                type: 'chat_log',
                role: 'user',
                timestamp: new Date().toISOString(),
                session_id: sessionId
            }).catch(console.error);

            // 3. Ask Brain (RAG)
            const response = await askBrain(userMsgContent);
            const aiMsgContent = response.answer;

            // 4. Save AI Message to DB
            await addChatMessage(sessionId, 'assistant', aiMsgContent);

            // 5. Save AI Message to Brain (Memory)
            addToBrain(aiMsgContent, {
                type: 'chat_log',
                role: 'assistant',
                timestamp: new Date().toISOString(),
                session_id: sessionId,
                related_query: userMsgContent
            }).catch(console.error);

            // Refresh messages to get real IDs (or just update state)
            loadMessages(sessionId);

        } catch (error) {
            console.error('Failed to send message:', error);
            // Revert or show error
        } finally {
            setIsLoading(false);
        }
    };

    const syncAllData = async () => {
        if (!window.confirm('Isso irá ler todos os dados de produção (Usuários, Propostas, Contratos, Projetos) e enviar para o "Cérebro". Isso pode demorar. Deseja continuar?')) {
            return;
        }

        setIsUploading(true);
        let count = 0;

        try {
            // 1. Users
            const { data: users } = await supabase.from('app_users').select('*');
            if (users) {
                for (const u of users) {
                    const content = `[USUÁRIO] O usuário ${u.email} possui a função de acesso (role): ${u.role}. ID do Sistema: ${u.id}.`;
                    await addToBrain(content, {
                        type: 'database_record',
                        source_table: 'app_users',
                        source_id: u.id,
                        title: `Usuário: ${u.email}`,
                        source: `Usuário: ${u.email}`
                    });
                    count++;
                }
            }

            // 2. Proposals
            const { data: proposals } = await supabase.from('proposals').select('*');
            if (proposals) {
                for (const p of proposals) {
                    const services = Array.isArray(p.services)
                        ? p.services.map((s: any) => typeof s === 'string' ? s : s.id).join(', ')
                        : 'Nenhum';

                    const content = `[PROPOSTA DE SERVIÇO] Proposta comercial para a empresa ${p.company_name}.
                    Responsável pela proposta: ${p.responsible_name}.
                    Detalhes Financeiros: Valor Mensal (MRR): R$ ${p.monthly_fee}, Taxa de Setup: R$ ${p.setup_fee}.
                    Vigência/Duração do Contrato Proposto: ${p.contract_duration} meses.
                    Serviços Incluídos: ${services}.
                    Data de Criação da Proposta: ${new Date(p.created_at).toLocaleDateString('pt-BR')}.
                    ID da Proposta: ${p.id}.`;

                    await addToBrain(content, {
                        type: 'database_record',
                        source_table: 'proposals',
                        source_id: p.id.toString(),
                        title: `Proposta: ${p.company_name}`,
                        source: `Proposta: ${p.company_name}`
                    });
                    count++;
                }
            }

            // 3. Acceptances (Contracts)
            const { data: acceptances } = await supabase.from('acceptances').select('*');
            if (acceptances) {
                for (const acc of acceptances) {
                    const content = `[CONTRATO ATIVO] Contrato vigente com a empresa ${acc.company_name} (CNPJ: ${acc.cnpj || 'Não Informado'}).
                    Cliente Responsável: ${acc.name} (Email: ${acc.email}).
                    Status do Contrato: ${acc.status}.
                    Data de Início do Contrato (Data de Aceite): ${new Date(acc.timestamp).toLocaleDateString('pt-BR')}.
                    Data de Término/Validade do Contrato: ${acc.expiration_date ? new Date(acc.expiration_date).toLocaleDateString('pt-BR') : 'Indeterminado'}.
                    ID do Contrato: ${acc.id}.`;

                    await addToBrain(content, {
                        type: 'database_record',
                        source_table: 'acceptances',
                        source_id: acc.id.toString(),
                        title: `Contrato: ${acc.company_name}`,
                        source: `Contrato: ${acc.company_name}`
                    });
                    count++;
                }
            }

            // 4. Projects (Traffic, Website, Landing Page)
            // Traffic
            const { data: trafficParams } = await supabase.from('traffic_projects').select('*');
            if (trafficParams) {
                for (const tp of trafficParams) {
                    // Try to fetch client name from associated acceptance if not directly available (though schema suggests it might not be joined here easily without join query)
                    // For now, assume client_name exists or we use ID.
                    // Wait, traffic_projects schema I saw earlier DOES NOT have client_name!
                    // It links to acceptance_id.
                    // I need to fetch acceptances to get the name.

                    // Let's do a join or map.
                    // Since I already fetched acceptances above, I can map ID to Name.
                    const acceptance = acceptances?.find(a => a.id === tp.acceptance_id);
                    const clientName = acceptance?.company_name || 'Empresa Desconhecida';

                    const content = `[PROJETO DE TRÁFEGO PAGO] Projeto de Gestão de Tráfego para ${clientName}.
                    Status do Projeto: ${tp.account_setup_status === 'completed' ? 'Configurado' : 'Em Configuração'}.
                    Data de Início do Projeto: ${new Date(tp.created_at).toLocaleDateString('pt-BR')}.
                    Objetivo da Campanha: ${tp.strategy_meeting_notes || 'Não especificado'}.
                    ID do Projeto: ${tp.id}.`;

                    await addToBrain(content, {
                        type: 'database_record',
                        source_table: 'traffic_projects',
                        source_id: tp.id,
                        title: `Projeto Tráfego: ${clientName}`,
                        source: `Projeto Tráfego: ${clientName}`
                    });
                    count++;
                }
            }

            // Simple notification
            if (currentSessionId) {
                await addChatMessage(currentSessionId, 'assistant', `Sincronização concluída! ${count} registros de produção foram analisados e salvos no meu banco de dados vetorial.`);
                loadMessages(currentSessionId);
            }
            alert(`Sincronização finalizada com sucesso! ${count} registros processados.`);

        } catch (error) {
            console.error('Sync failed:', error);
            alert('Erro durante a sincronização. Verifique o console.');
        } finally {
            setIsUploading(false);
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
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <p>Acesso restrito a gestores.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
            <Header />

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex">
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
                        <p className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Histórico</p>
                        {sessions.map(session => (
                            <button
                                key={session.id}
                                onClick={() => setCurrentSessionId(session.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center gap-3 transition-colors ${currentSessionId === session.id
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                    }`}
                            >
                                <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                                <span className="truncate">{session.title}</span>
                            </button>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-800">
                        <div className="flex items-center gap-3 px-2 py-2 text-slate-400 text-sm">
                            <div className="w-8 h-8 rounded-full bg-brand-coral/20 flex items-center justify-center text-brand-coral font-bold">
                                G
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-200 truncate">Gestor</p>
                                <p className="text-xs text-slate-500 truncate">Gerenciamento</p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Chat Area */}
                <main className="flex-1 flex flex-col min-w-0 bg-slate-950/50">
                    {/* Toolbar / Mobile Header */}
                    <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-sm">
                        <h2 className="font-semibold text-lg flex items-center gap-2">
                            <Bot className="w-5 h-5 text-indigo-400" />
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
                                onClick={syncAllData}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-brand-dark hover:bg-slate-800 text-brand-coral font-bold rounded-md text-sm transition-colors border border-brand-coral/30 hover:border-brand-coral shadow-lg shadow-brand-coral/10 mr-2"
                                title="Sincronizar dados de produção com o Cérebro"
                            >
                                <RefreshCw className={`w-4 h-4 ${isUploading ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Sincronizar DB</span>
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm transition-colors border border-slate-700"
                            >
                                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                <span className="hidden sm:inline">Upload Arquivo</span>
                            </button>
                        </div>
                    </div>

                    {/* Messages List */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
                                <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mb-4">
                                    <Bot className="w-10 h-10 text-indigo-400" />
                                </div>
                                <h3 className="text-xl font-medium text-slate-300">Segundo Cérebro Corporativo</h3>
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
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                                            <Bot className="w-5 h-5 text-indigo-400" />
                                        </div>
                                    )}

                                    <div className={`space-y-1 ${msg.role === 'user' ? 'items-end flex flex-col' : ''} max-w-[85%] md:max-w-[75%]`}>
                                        <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-br-none'
                                            : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-bl-none'
                                            }`}>
                                            {msg.content}
                                        </div>
                                        <div className="text-[10px] text-slate-600 px-1 opacity-0 hover:opacity-100 transition-opacity">
                                            {new Date(msg.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 mt-1">
                                            <User className="w-5 h-5 text-slate-400" />
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-slate-900/50 border-t border-slate-800">
                        <div className="max-w-4xl mx-auto relative">
                            <form onSubmit={handleSendMessage} className="relative">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Digite sua mensagem para o cérebro..."
                                    className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl py-4 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
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
                            <p className="text-center text-[10px] text-slate-600 mt-2">
                                O Segundo Cérebro pode cometer erros. Verifique informações importantes.
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
