import { supabase } from './supabase';

export interface BrainDocument {
    id: string;
    content: string;
    metadata: Record<string, any>;
    similarity?: number;
}

export interface AskBrainResponse {
    answer: string;
    documents: BrainDocument[];
}

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
}

export interface ChatMessage {
    id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

function isInvalidJwtMessage(message: string): boolean {
    return (message || '').toLowerCase().includes('invalid jwt');
}

async function callChatBrainDirect(payload: { query: string; session_id: string | null }, bearerToken: string): Promise<AskBrainResponse> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase env ausente no frontend (URL/ANON_KEY).');
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/chat-brain`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const details = body?.error || body?.message || `HTTP ${res.status}`;
        throw new Error(details);
    }

    return {
        answer: body?.answer || 'Não consegui gerar resposta neste momento. Tente novamente.',
        documents: Array.isArray(body?.documents) ? body.documents : [],
    };
}

async function getValidAccessToken(): Promise<string | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;

    const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
    const isNearExpiry = !!expiresAtMs && (expiresAtMs - Date.now()) < 60_000;

    if (!session || isNearExpiry) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session) {
            session = refreshed.session;
        }
    }

    return session?.access_token ?? null;
}

async function parseInvokeError(error: any, fallback: string): Promise<string> {
    let details = error?.message || fallback;

    if (typeof error === 'object' && error !== null && 'context' in error) {
        try {
            const body = await (error as any).context.json();
            if (body?.error) details = body.error;
            else if (body?.message) details = body.message;
        } catch {
            // keep fallback details
        }
    }

    return details;
}

export async function addToBrain(content: string, metadata: Record<string, any> = {}) {
    const token = await getValidAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    let { data, error } = await supabase.functions.invoke('embed-content', {
        body: { content, metadata },
        headers,
    });

    if (error) {
        const details = await parseInvokeError(error, 'Falha ao enviar conteúdo para o cérebro');
        if (details.toLowerCase().includes('invalid jwt')) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            const retryToken = refreshed?.session?.access_token;
            if (!refreshError && retryToken) {
                const retry = await supabase.functions.invoke('embed-content', {
                    body: { content, metadata },
                    headers: { Authorization: `Bearer ${retryToken}` },
                });
                data = retry.data;
                error = retry.error;
            }
        }
    }

    if (error) {
        console.error('Error adding to brain:', error);
        throw error;
    }

    return data;
}

export async function askBrain(query: string, sessionId?: string): Promise<AskBrainResponse> {
    const payload = { query, session_id: sessionId || null };

    let token = await getValidAccessToken();
    if (!token) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
            token = refreshed.session.access_token;
        }
    }

    if (!token) {
        return {
            answer: 'Falha de integração com o Segundo Cérebro. Detalhes: Sessão expirada. Faça login novamente.',
            documents: [],
        };
    }

    try {
        return await callChatBrainDirect(payload, token);
    } catch (firstError: any) {
        const firstMessage = firstError?.message || String(firstError);
        console.error('askBrain first attempt failed:', firstMessage);

        // Se o JWT do usuário estiver inválido, tenta com sessão renovada.
        if (isInvalidJwtMessage(firstMessage)) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            const retryToken = refreshed?.session?.access_token;
            if (!refreshError && retryToken) {
                try {
                    return await callChatBrainDirect(payload, retryToken);
                } catch (secondError: any) {
                    const secondMessage = secondError?.message || String(secondError);
                    console.error('askBrain second attempt (refreshed token) failed:', secondMessage);
                    if (!isInvalidJwtMessage(secondMessage)) {
                        return {
                            answer: `Falha de integração com o Segundo Cérebro. Detalhes: ${secondMessage}`,
                            documents: [],
                        };
                    }
                }
            }
            return {
                answer: 'Falha de integração com o Segundo Cérebro. Detalhes: Sessão inválida (JWT). Faça login novamente.',
                documents: [],
            };
        }

        return {
            answer: `Falha de integração com o Segundo Cérebro. Detalhes: ${firstMessage}`,
            documents: [],
        };
    }
}

export async function createChatSession(title: string = 'Nova Conversa'): Promise<ChatSession> {
    const { data, error } = await supabase
        .rpc('create_chat_session', { title })
        .select()
        .single();

    if (error) throw error;

    return {
        id: data as unknown as string,
        title,
        created_at: new Date().toISOString(),
    };
}

export async function getChatSessions(): Promise<ChatSession[]> {
    const { data, error } = await supabase
        .from('chat_sessions_view')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
        .from('chat_messages_view')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
}

export async function addChatMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
    const { data, error } = await supabase.rpc('add_chat_message', {
        p_session_id: sessionId,
        p_role: role,
        p_content: content,
    });

    if (error) throw error;
    return data;
}
