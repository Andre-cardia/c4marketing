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

    const token = await getValidAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    let { data, error } = await supabase.functions.invoke('chat-brain', {
        body: payload,
        headers,
    });

    if (error) {
        const firstDetails = await parseInvokeError(error, 'Falha ao consultar chat-brain');
        if (firstDetails.toLowerCase().includes('invalid jwt')) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            const retryToken = refreshed?.session?.access_token;

            if (!refreshError && retryToken) {
                const retry = await supabase.functions.invoke('chat-brain', {
                    body: payload,
                    headers: { Authorization: `Bearer ${retryToken}` },
                });
                data = retry.data;
                error = retry.error;
            }
        }
    }

    if (error) {
        console.error('Error asking brain:', error);
        const details = await parseInvokeError(error, 'Falha ao consultar chat-brain');

        const friendly = details.toLowerCase().includes('invalid jwt')
            ? 'Sessao invalida (JWT). Faça logout e login novamente para renovar a autenticacao.'
            : details;

        return {
            answer: `Falha de integração com o Segundo Cérebro. Detalhes: ${friendly}`,
            documents: [],
        };
    }

    if (!data?.answer) {
        return {
            answer: 'Não consegui gerar resposta neste momento. Tente novamente.',
            documents: [],
        };
    }

    return data;
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
