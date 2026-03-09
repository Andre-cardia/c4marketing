import { supabase } from './supabase';

export type CRMChatConnectionStatus = 'disconnected' | 'connecting' | 'qrcode' | 'connected' | 'error';
export type CRMChatConversationStatus = 'open' | 'pending' | 'resolved' | 'archived';
export type CRMChatMessageDirection = 'inbound' | 'outbound' | 'system';
export type CRMChatMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'reaction' | 'unknown';
export type CRMChatMessageStatus = 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface CRMChatUser {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface CRMChatLeadSummary {
  id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  email?: string | null;
  stage_id?: string | null;
  owner_user_id?: string | null;
}

export interface CRMChatInstance {
  id: string;
  label: string;
  evolution_instance_name: string;
  status: CRMChatConnectionStatus;
  connected_number?: string | null;
  connected_jid?: string | null;
  profile_name?: string | null;
  webhook_url?: string | null;
  webhook_configured: boolean;
  qr_code?: string | null;
  qr_code_updated_at?: string | null;
  last_connection_at?: string | null;
  last_sync_at?: string | null;
  settings: Record<string, any>;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMChatContact {
  id: string;
  whatsapp_jid: string;
  phone_number?: string | null;
  phone_number_normalized?: string | null;
  push_name?: string | null;
  profile_name?: string | null;
  avatar_url?: string | null;
  lead_id?: string | null;
  metadata?: Record<string, any> | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMChatConversation {
  id: string;
  instance_id: string;
  contact_id: string;
  lead_id?: string | null;
  assigned_user_id?: string | null;
  status: CRMChatConversationStatus;
  subject?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  contact: CRMChatContact | null;
  lead: CRMChatLeadSummary | null;
  instance: Pick<CRMChatInstance, 'id' | 'label' | 'evolution_instance_name' | 'status' | 'connected_number' | 'profile_name' | 'webhook_configured'> | null;
  assigned_user: CRMChatUser | null;
}

export interface CRMChatMessage {
  id: string;
  conversation_id: string;
  instance_id: string;
  contact_id: string;
  lead_id?: string | null;
  external_message_id?: string | null;
  direction: CRMChatMessageDirection;
  message_type: CRMChatMessageType;
  status: CRMChatMessageStatus;
  sender_jid?: string | null;
  recipient_jid?: string | null;
  body?: string | null;
  media_url?: string | null;
  metadata?: Record<string, any> | null;
  sent_at: string;
  created_by?: string | null;
  created_at: string;
}

export interface CRMChatInstanceFormState {
  label: string;
  evolution_instance_name: string;
  owner_number: string;
  always_online: boolean;
  read_messages: boolean;
  read_status: boolean;
  sync_full_history: boolean;
  reject_call: boolean;
  groups_ignore: boolean;
}

export interface EvolutionConfigStatus {
  isConfigured: boolean;
  hasApiBaseUrl: boolean;
  hasApiKey: boolean;
  hasWebhookToken: boolean;
  webhookUrl: string | null;
}

export interface EvolutionOverview {
  config: EvolutionConfigStatus;
  instance: CRMChatInstance | null;
  remote?: Record<string, any> | null;
  stats?: {
    conversations: number;
    unread: number;
    messages: number;
  };
}

export interface CRMChatDiagnostics {
  timestamp: string;
  supabaseUrl: string | null;
  hasAnonKey: boolean;
  session: {
    hasSession: boolean;
    email: string | null;
    expiresAt: number | null;
    tokenLooksValid: boolean;
  };
  getUser: {
    ok: boolean;
    error: string | null;
    email: string | null;
  };
  refreshSession: {
    ok: boolean;
    error: string | null;
    hasSession: boolean;
  };
  evolutionManager: {
    ok: boolean;
    status: number | null;
    body: Record<string, any> | null;
    error: string | null;
  };
}

export type EvolutionConnectMode = 'qrcode' | 'pairing';

export const createEmptyChatInstanceForm = (): CRMChatInstanceFormState => ({
  label: '',
  evolution_instance_name: '',
  owner_number: '',
  always_online: true,
  read_messages: false,
  read_status: false,
  sync_full_history: false,
  reject_call: true,
  groups_ignore: true,
});

export const mapInstanceToForm = (instance?: CRMChatInstance | null): CRMChatInstanceFormState => {
  if (!instance) return createEmptyChatInstanceForm();

  return {
    label: instance.label || '',
    evolution_instance_name: instance.evolution_instance_name || '',
    owner_number: instance.settings?.owner_number || instance.connected_number || '',
    always_online: instance.settings?.always_online ?? true,
    read_messages: instance.settings?.read_messages ?? false,
    read_status: instance.settings?.read_status ?? false,
    sync_full_history: instance.settings?.sync_full_history ?? false,
    reject_call: instance.settings?.reject_call ?? true,
    groups_ignore: instance.settings?.groups_ignore ?? true,
  };
};

export const getConversationTitle = (conversation: CRMChatConversation) => {
  const contact = conversation.contact;
  if (!contact) return 'Contato sem nome';
  return (
    contact.profile_name?.trim()
    || contact.push_name?.trim()
    || contact.phone_number?.trim()
    || contact.whatsapp_jid
  );
};

export const getLeadDisplayLabel = (lead?: CRMChatLeadSummary | null) => {
  if (!lead) return 'Sem lead vinculado';
  return `${lead.name} • ${lead.company_name}`;
};

export const getUserDisplayLabel = (user?: CRMChatUser | null) => {
  if (!user) return 'Não atribuído';
  return user.full_name?.trim() || user.name?.trim() || user.email?.trim() || 'Usuário';
};

export const normalizeConversationSearch = (value: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const formatChatDateTime = (value?: string | null) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatConversationClock = (value?: string | null) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';

  const today = new Date();
  const isSameDay =
    date.getDate() === today.getDate()
    && date.getMonth() === today.getMonth()
    && date.getFullYear() === today.getFullYear();

  if (isSameDay) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
};

export const getConnectionBadgeClass = (status?: CRMChatConnectionStatus | null) => {
  switch (status) {
    case 'connected':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/70';
    case 'connecting':
      return 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/70';
    case 'qrcode':
      return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/70';
    case 'error':
      return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/70';
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800/70';
  }
};

export const getConnectionLabel = (status?: CRMChatConnectionStatus | null) => {
  switch (status) {
    case 'connected':
      return 'Conectado';
    case 'connecting':
      return 'Conectando';
    case 'qrcode':
      return 'Aguardando QR';
    case 'error':
      return 'Com erro';
    default:
      return 'Desconectado';
  }
};

export const getMessageBubbleClass = (direction: CRMChatMessageDirection) => {
  if (direction === 'outbound') {
    return 'bg-brand-coral text-white ml-auto border border-brand-coral/80';
  }

  if (direction === 'system') {
    return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-800 mx-auto';
  }

  return 'bg-white text-slate-900 border border-slate-200 dark:bg-neutral-950 dark:text-neutral-100 dark:border-neutral-800';
};

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

function isInvalidJwtMessage(message: string): boolean {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('invalid jwt')
    || normalized.includes('jwt expired')
    || normalized.includes('token is expired')
    || normalized.includes('jwt malformed')
    || normalized.includes('session from session_id claim in jwt does not exist')
    || normalized.includes('sessao invalida')
    || normalized.includes('sessão inválida')
    || normalized.includes('sessao expirada')
    || normalized.includes('sessão expirada');
}

function normalizeAccessToken(token?: string | null): string | null {
  if (!token) return null;
  const cleaned = token.trim().replace(/^Bearer\s+/i, '');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return null;
  if (!parts[0] || !parts[1] || !parts[2]) return null;
  return cleaned;
}

async function getValidAccessToken(): Promise<string | null> {
  const readSessionToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return normalizeAccessToken(sessionData.session?.access_token ?? null);
  };

  const hasValidRemoteUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    return !error && !!data?.user;
  };

  const localToken = await readSessionToken();
  if (localToken && await hasValidRemoteUser()) return localToken;

  // Mitiga corrida de inicialização do Supabase Auth ao abrir a tela.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const retryToken = await readSessionToken();
  if (retryToken && await hasValidRemoteUser()) return retryToken;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed.session?.access_token && await hasValidRemoteUser()) {
    return normalizeAccessToken(refreshed.session.access_token);
  }

  return null;
}

async function callEvolutionManagerDirect<T>(body: Record<string, any>, bearerToken: string): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase env ausente no frontend (URL/ANON_KEY).');
  }

  const safeToken = normalizeAccessToken(bearerToken);
  if (!safeToken) {
    throw new Error('invalid_jwt_format');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/evolution-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${safeToken}`,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = responseBody?.error || responseBody?.message || `HTTP ${res.status}`;
    throw new Error(details);
  }

  return (responseBody ?? {}) as T;
}

export async function runCRMChatDiagnostics(): Promise<CRMChatDiagnostics> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || null;
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const normalizedToken = normalizeAccessToken(session?.access_token ?? null);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

  const diagnostics: CRMChatDiagnostics = {
    timestamp: new Date().toISOString(),
    supabaseUrl,
    hasAnonKey: !!anonKey,
    session: {
      hasSession: !!session,
      email: session?.user?.email ?? null,
      expiresAt: session?.expires_at ?? null,
      tokenLooksValid: !!normalizedToken,
    },
    getUser: {
      ok: !userError && !!userData?.user,
      error: userError?.message ?? null,
      email: userData?.user?.email ?? null,
    },
    refreshSession: {
      ok: !refreshError && !!refreshed.session,
      error: refreshError?.message ?? null,
      hasSession: !!refreshed.session,
    },
    evolutionManager: {
      ok: false,
      status: null,
      body: null,
      error: null,
    },
  };

  if (!supabaseUrl || !anonKey || !normalizedToken) {
    diagnostics.evolutionManager.error = 'Pré-condições ausentes para chamar a Edge Function.';
    return diagnostics;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/evolution-manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${normalizedToken}`,
      },
      body: JSON.stringify({ action: 'overview', instanceId: null }),
    });

    const body = await res.json().catch(() => null);
    diagnostics.evolutionManager = {
      ok: res.ok,
      status: res.status,
      body,
      error: res.ok ? null : (body?.error || body?.message || `HTTP ${res.status}`),
    };
  } catch (error: any) {
    diagnostics.evolutionManager.error = error?.message || 'Falha de rede ao chamar evolution-manager.';
  }

  return diagnostics;
}

export async function fetchCRMChatConversations(): Promise<CRMChatConversation[]> {
  const { data, error } = await supabase
    .from('crm_chat_conversations')
    .select(`
      *,
      contact:crm_chat_contacts(*),
      lead:crm_leads(id, name, company_name, whatsapp, email, stage_id, owner_user_id),
      instance:crm_chat_instances(id, label, evolution_instance_name, status, connected_number, profile_name, webhook_configured),
      assigned_user:app_users(id, full_name, name, email, role)
    `)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  return ((data || []) as any[]).map((item) => ({
    ...item,
    contact: item.contact || null,
    lead: item.lead || null,
    instance: item.instance || null,
    assigned_user: item.assigned_user || null,
  }));
}

export async function fetchCRMChatMessages(conversationId: string): Promise<CRMChatMessage[]> {
  const { data, error } = await supabase
    .from('crm_chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .limit(300);

  if (error) throw error;
  return (data || []) as CRMChatMessage[];
}

export async function fetchCRMChatInstance(): Promise<CRMChatInstance | null> {
  const { data, error } = await supabase
    .from('crm_chat_instances')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as CRMChatInstance | null) || null;
}

export async function fetchCRMChatLeadOptions(): Promise<CRMChatLeadSummary[]> {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, name, company_name, whatsapp, email, stage_id, owner_user_id')
    .is('archived_at', null)
    .order('opened_at', { ascending: false })
    .limit(300);

  if (error) throw error;
  return (data || []) as CRMChatLeadSummary[];
}

export async function fetchCRMChatUsers(): Promise<CRMChatUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, full_name, name, email, role')
    .in('role', ['admin', 'gestor', 'comercial', 'leitor'])
    .order('email', { ascending: true });

  if (error) throw error;
  return (data || []) as CRMChatUser[];
}

export async function updateCRMConversation(
  conversationId: string,
  payload: Partial<Pick<CRMChatConversation, 'lead_id' | 'assigned_user_id' | 'status' | 'subject' | 'unread_count'>>
) {
  const { error } = await supabase
    .from('crm_chat_conversations')
    .update(payload)
    .eq('id', conversationId);

  if (error) throw error;
}

export async function evolutionManagerInvoke<T>(body: Record<string, any>): Promise<T> {
  const buildReauthMessage = () =>
    'Sua sessão expirou ou ficou inválida. Atualize a página ou faça login novamente para continuar usando o CRM Chat.';

  const initialToken = await getValidAccessToken();
  if (!initialToken) {
    throw new Error(buildReauthMessage());
  }

  try {
    return await callEvolutionManagerDirect<T>(body, initialToken);
  } catch (error: any) {
    const details = error?.message || 'Falha ao executar ação da Evolution API';
    if (!isInvalidJwtMessage(details)) {
      throw new Error(details);
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const retryToken = normalizeAccessToken(refreshed.session?.access_token ?? null);
    if (refreshError || !retryToken) {
      throw new Error(buildReauthMessage());
    }

    try {
      return await callEvolutionManagerDirect<T>(body, retryToken);
    } catch (retryError: any) {
      const retryDetails = retryError?.message || 'Falha ao executar ação da Evolution API';
      if (isInvalidJwtMessage(retryDetails)) {
        throw new Error(buildReauthMessage());
      }
      throw new Error(retryDetails);
    }
  }
}

export async function getEvolutionOverview(instanceId?: string): Promise<EvolutionOverview> {
  return evolutionManagerInvoke<EvolutionOverview>({
    action: 'overview',
    instanceId: instanceId || null,
  });
}

export async function saveEvolutionInstance(payload: CRMChatInstanceFormState & { instanceId?: string | null; ensureRemote?: boolean }) {
  return evolutionManagerInvoke<{ instance: CRMChatInstance; remote?: Record<string, any> | null }>({
    action: 'upsert_instance',
    ...payload,
  });
}

export async function syncEvolutionInstance(instanceId: string) {
  return evolutionManagerInvoke<{ instance: CRMChatInstance; remote?: Record<string, any> | null }>({
    action: 'sync_instance',
    instanceId,
  });
}

export async function connectEvolutionInstance(
  instanceId: string,
  options?: { connectMode?: EvolutionConnectMode; number?: string | null }
) {
  return evolutionManagerInvoke<{ instance: CRMChatInstance; connect?: Record<string, any> | null }>({
    action: 'connect_instance',
    instanceId,
    connect_mode: options?.connectMode || 'qrcode',
    number: options?.number || null,
  });
}

export async function sendEvolutionText(payload: {
  conversationId: string;
  instanceId: string;
  text: string;
  leadId?: string | null;
}) {
  return evolutionManagerInvoke<{ provider?: Record<string, any> | null; message?: CRMChatMessage | null }>({
    action: 'send_text',
    ...payload,
  });
}
