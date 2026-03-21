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
    meta?: Record<string, any>;
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
    const normalized = (message || '').toLowerCase();
    return normalized.includes('invalid jwt')
        || normalized.includes('jwt expired')
        || normalized.includes('token is expired')
        || normalized.includes('jwt malformed')
        || normalized.includes('session from session_id claim in jwt does not exist');
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
    forced_agent?: string;
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
        meta: body?.meta && typeof body.meta === 'object' ? body.meta : undefined,
    };
}

async function callChatBrainInvoke(payload: ChatBrainPayload, bearerToken?: string | null): Promise<AskBrainResponse> {
    const headers = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined;
    const { data, error } = await supabase.functions.invoke('chat-brain', {
        body: payload,
        headers,
    });

    if (error) {
        const details = await parseInvokeError(error, 'Falha ao consultar o Segundo Cérebro');
        throw new Error(details);
    }

    const body = (data && typeof data === 'object') ? (data as Record<string, any>) : {};
    return {
        answer: body?.answer || 'Não consegui gerar resposta neste momento. Tente novamente.',
        documents: Array.isArray(body?.documents) ? body.documents : [],
        meta: body?.meta && typeof body.meta === 'object' ? body.meta : undefined,
    };
}

async function getValidAccessToken(): Promise<string | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;
    if (!session?.access_token) return null;

    const ensureTokenIsUsable = async (candidateToken: string): Promise<boolean> => {
        const { error } = await supabase.auth.getUser(candidateToken);
        return !error;
    };

    const initialToken = session.access_token;
    const initialValid = await ensureTokenIsUsable(initialToken);
    if (!initialValid) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) return null;
        session = refreshed.session;
        const refreshedValid = await ensureTokenIsUsable(session.access_token);
        if (!refreshedValid) return null;
        return session.access_token;
    }

    const initialDebug = getTokenDebug(initialToken);
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const isNearExpiry = !!expiresAtMs && (expiresAtMs - Date.now()) < 60_000;
    const hasSubMismatch = !!(session.user?.id && initialDebug.sub && session.user.id !== initialDebug.sub);
    const shouldRefresh = isNearExpiry || hasSubMismatch || isExpired(initialDebug.exp);

    if (shouldRefresh) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
            session = refreshed.session;
            const refreshedValid = await ensureTokenIsUsable(session.access_token);
            if (!refreshedValid) return null;
        } else {
            // If token is already invalid/expired and refresh failed, do not reuse a stale token.
            if (hasSubMismatch || isExpired(initialDebug.exp)) {
                return null;
            }
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

export async function askBrain(
    query: string,
    sessionId?: string,
    options?: { forcedAgent?: string }
): Promise<AskBrainResponse> {
    const now = new Date();
    const clientToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const payload: ChatBrainPayload = {
        query,
        session_id: sessionId || null,
        client_today: clientToday,
        client_tz: clientTimezone,
    };

    if (options?.forcedAgent) {
        payload.forced_agent = options.forcedAgent;
    }
    const expectedRef = getProjectRefFromSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);

    let token = await getValidAccessToken();
    if (!token) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
            token = refreshed.session.access_token;
        }
    }

    if (token) {
        const { error: tokenValidationError } = await supabase.auth.getUser(token);
        if (tokenValidationError) {
            token = null;
        }
    }

    if (!token) {
        return {
            answer: 'Falha de integração com o Segundo Cérebro. Detalhes: Sessão expirada. Faça login novamente.',
            documents: [],
        };
    }

    // Para agentes especializados (forced_agent), faz refresh proativo do token.
    if (options?.forcedAgent) {
        const { data: preRefreshed, error: preRefreshError } = await supabase.auth.refreshSession();
        if (!preRefreshError && preRefreshed?.session?.access_token) {
            token = preRefreshed.session.access_token;
        }
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
        return await callChatBrainInvoke(payload, token);
    } catch (firstError: any) {
        const firstMessage = firstError?.message || String(firstError);
        console.error('askBrain first attempt failed:', firstMessage);

        // Se o JWT do usuário estiver inválido, tenta com sessão renovada.
        if (isInvalidJwtMessage(firstMessage)) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            const retryToken = refreshed?.session?.access_token;
            if (!refreshError && retryToken) {
                try {
                    return await callChatBrainInvoke(payload, retryToken);
                } catch (secondError: any) {
                    const secondMessage = secondError?.message || String(secondError);
                    console.error('askBrain second attempt (refreshed token) failed:', secondMessage);
                    if (!isInvalidJwtMessage(secondMessage)) {
                        return {
                            answer: `Falha de integração com o Segundo Cérebro. Detalhes: ${secondMessage}`,
                            documents: [],
                        };
                    }

                    // Fallback final para contornar possíveis inconsistências de header no invoke.
                    try {
                        return await callChatBrainDirect(payload, retryToken);
                    } catch (thirdError: any) {
                        const thirdMessage = thirdError?.message || String(thirdError);
                        console.error('askBrain third attempt (direct fetch) failed:', thirdMessage);
                        if (!isInvalidJwtMessage(thirdMessage)) {
                            return {
                                answer: `Falha de integração com o Segundo Cérebro. Detalhes: ${thirdMessage}`,
                                documents: [],
                            };
                        }
                    }
                }
            }
            return {
                answer: 'Sua sessão expirou ou ficou inválida. Por favor, atualize a página ou faça login novamente para continuar usando o agente.',
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

// --- Helper functions for session segregation ---

export const TRAFFIC_SESSION_PREFIX = 'TrafficAgent:';
export const LEGACY_TRAFFIC_SESSION_MARKERS = [
    'agente de trafego - chat dedicado',
    'agente de tráfego - chat dedicado',
    'agente de gestao de trafego',
    'agente especialista em gestao de trafego',
];

export function normalizeText(value: string): string {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function isTrafficSession(session: ChatSession): boolean {
    const normalizedTitle = normalizeText(session.title || '');
    if (normalizedTitle.startsWith(normalizeText(TRAFFIC_SESSION_PREFIX))) return true;
    return LEGACY_TRAFFIC_SESSION_MARKERS.some((marker) => normalizedTitle.includes(normalizeText(marker)));
}

export function formatTrafficSessionTitle(session: ChatSession): string {
    const title = session.title || '';
    if (title.startsWith(TRAFFIC_SESSION_PREFIX)) {
        return title.slice(TRAFFIC_SESSION_PREFIX.length).trim() || 'Conversa sem titulo';
    }
    return title;
}

export function buildTrafficSessionTitle(): string {
    const now = new Date();
    const date = now.toLocaleDateString('pt-BR');
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${TRAFFIC_SESSION_PREFIX} ${date} ${time}`;
}

export async function deleteChatSession(sessionId: string) {
    const { data, error } = await supabase.rpc('delete_chat_session', {
        p_session_id: sessionId,
    });

    if (error) throw error;
    return data;
}

/**
 * Persists an AI-generated session title to the database.
 * Acts as a reliable client-side fallback in case the backend's own update fails.
 */
export async function updateChatSessionTitle(sessionId: string, title: string): Promise<void> {
    const { error } = await supabase.rpc('update_chat_session_title', {
        p_session_id: sessionId,
        p_title: title,
    });
    if (error) throw error;
}

export async function getProjectCredentials(acceptanceId: number): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_project_credentials', {
        p_acceptance_id: acceptanceId,
    });
    if (error) throw error;
    return data as string | null;
}

export async function upsertProjectCredentials(acceptanceId: number, credentials: string): Promise<void> {
    const { error } = await supabase.rpc('upsert_project_credentials', {
        p_acceptance_id: acceptanceId,
        p_credentials: credentials,
    });
    if (error) throw error;
}
