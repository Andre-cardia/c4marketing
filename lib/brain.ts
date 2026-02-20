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

type TokenDebug = {
    ref: string | null;
    role: string | null;
    sub: string | null;
    exp: number | null;
};

function getProjectRefFromSupabaseUrl(url?: string): string | null {
    if (!url) return null;
    try {
        const host = new URL(url).hostname; // <ref>.supabase.co
        return host.split('.')[0] || null;
    } catch {
        return null;
    }
}

function decodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        const json = atob(padded);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function getProjectRefFromJwt(token: string): string | null {
    const payload = decodeJwtPayload(token);
    if (!payload) return null;

    const fromRef = typeof payload.ref === 'string' ? payload.ref : null;
    if (fromRef) return fromRef;

    const iss = typeof payload.iss === 'string' ? payload.iss : '';
    const match = iss.match(/https:\/\/([a-z0-9]+)\.supabase\.co\/auth\/v1/i);
    return match?.[1] ?? null;
}

function getTokenDebug(token: string): TokenDebug {
    const payload = decodeJwtPayload(token) || {};
    return {
        ref: getProjectRefFromJwt(token),
        role: typeof payload.role === 'string' ? payload.role : null,
        sub: typeof payload.sub === 'string' ? payload.sub : null,
        exp: typeof payload.exp === 'number' ? payload.exp : null,
    };
}

function isExpired(exp: number | null): boolean {
    if (!exp) return false;
    return exp <= Math.floor(Date.now() / 1000);
}

type ChatBrainPayload = {
    query: string;
    session_id: string | null;
    client_today?: string;
    client_tz?: string;
}

async function callChatBrainDirect(payload: ChatBrainPayload, bearerToken: string): Promise<AskBrainResponse> {
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
    if (!session?.access_token) return null;

    const initialDebug = getTokenDebug(session.access_token);
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const isNearExpiry = !!expiresAtMs && (expiresAtMs - Date.now()) < 60_000;
    const hasSubMismatch = !!(session.user?.id && initialDebug.sub && session.user.id !== initialDebug.sub);
    const shouldRefresh = isNearExpiry || hasSubMismatch || isExpired(initialDebug.exp);

    if (shouldRefresh) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
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
    const now = new Date();
    const clientToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const payload: ChatBrainPayload = {
        query,
        session_id: sessionId || null,
        client_today: clientToday,
        client_tz: clientTimezone,
    };
    const expectedRef = getProjectRefFromSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);

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

    const tokenInfo = getTokenDebug(token);
    if (expectedRef && tokenInfo.ref && expectedRef !== tokenInfo.ref) {
        return {
            answer: `Falha de integração com o Segundo Cérebro. Detalhes: token de autenticação de outro projeto (token: ${tokenInfo.ref}, app: ${expectedRef}). Corrija VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY do frontend.`,
            documents: [],
        };
    }

    if (tokenInfo.role === 'anon') {
        return {
            answer: 'Falha de integração com o Segundo Cérebro. Detalhes: sessão atual está anônima (role=anon), não autenticada.',
            documents: [],
        };
    }

    if (isExpired(tokenInfo.exp)) {
        return {
            answer: 'Falha de integração com o Segundo Cérebro. Detalhes: token expirado. Faça login novamente.',
            documents: [],
        };
    }

    const { error: userCheckError } = await supabase.auth.getUser(token);
    if (userCheckError) {
        console.warn('askBrain auth precheck warning (continuing to edge function validation):', userCheckError.message);
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
                answer: `Falha de integração com o Segundo Cérebro. Detalhes: Sessão inválida (JWT). Projeto esperado: ${expectedRef || 'desconhecido'}; token: ${tokenInfo.ref || 'não identificado'}; role: ${tokenInfo.role || 'n/a'}; sub: ${tokenInfo.sub || 'n/a'}.`,
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
