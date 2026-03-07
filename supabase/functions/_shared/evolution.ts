export type EvolutionConfigStatus = {
  isConfigured: boolean;
  hasApiBaseUrl: boolean;
  hasApiKey: boolean;
  hasWebhookToken: boolean;
  webhookUrl: string | null;
};

export type EvolutionRuntimeConfig = EvolutionConfigStatus & {
  apiBaseUrl: string | null;
  apiKey: string | null;
  webhookToken: string | null;
};

export type EvolutionMessageRecord = {
  raw: Record<string, any>;
  externalMessageId: string | null;
  remoteJid: string | null;
  fromMe: boolean;
  senderJid: string | null;
  recipientJid: string | null;
  pushName: string | null;
  profileName: string | null;
  body: string | null;
  messageType: string;
  status: string;
  mediaUrl: string | null;
  sentAt: string;
};

const encoder = new TextEncoder();

export const EVOLUTION_WEBHOOK_EVENTS = [
  'APPLICATION_STARTUP',
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
] as const;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function normalizeRole(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function normalizePhoneDigits(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '');
}

export function normalizeWhatsAppJid(value: string | null | undefined) {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    return trimmed;
  }

  const digits = normalizePhoneDigits(trimmed);
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

export function extractPhoneFromJid(jid: string | null | undefined) {
  if (!jid) return null;
  return normalizePhoneDigits(jid.split('@')[0]);
}

export function isGroupJid(jid: string | null | undefined) {
  return (jid || '').endsWith('@g.us');
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function parsePossibleTimestamp(value: unknown) {
  if (typeof value === 'number') {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return parsePossibleTimestamp(numeric);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

export function getEvolutionConfig(): EvolutionRuntimeConfig {
  const apiBaseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') || '').trim().replace(/\/+$/, '') || null;
  const apiKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim() || null;
  const webhookToken = (Deno.env.get('EVOLUTION_WEBHOOK_TOKEN') || '').trim() || null;
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '') || null;
  const webhookUrl = supabaseUrl && webhookToken
    ? `${supabaseUrl}/functions/v1/evolution-webhook?token=${encodeURIComponent(webhookToken)}`
    : null;

  return {
    apiBaseUrl,
    apiKey,
    webhookToken,
    webhookUrl,
    hasApiBaseUrl: !!apiBaseUrl,
    hasApiKey: !!apiKey,
    hasWebhookToken: !!webhookToken,
    isConfigured: !!apiBaseUrl && !!apiKey && !!webhookToken,
  };
}

export async function evolutionRequest(
  config: EvolutionRuntimeConfig,
  path: string,
  init: RequestInit = {}
) {
  if (!config.apiBaseUrl || !config.apiKey) {
    throw new Error('Evolution API não configurada. Defina EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY.');
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: config.apiKey,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let body: any = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const details = body?.response?.message
      || body?.message
      || body?.error
      || body?.raw
      || `HTTP ${response.status}`;
    throw new Error(`Evolution API: ${details}`);
  }

  return body;
}

export function mapConnectionStatus(state: string | null | undefined): 'disconnected' | 'connecting' | 'qrcode' | 'connected' | 'error' {
  const normalized = (state || '').toLowerCase();
  if (normalized === 'open' || normalized === 'connected') return 'connected';
  if (normalized === 'connecting' || normalized === 'starting') return 'connecting';
  if (normalized === 'qrcode' || normalized === 'qr' || normalized === 'qr_code') return 'qrcode';
  if (normalized === 'close' || normalized === 'closed' || normalized === 'disconnected' || normalized === 'logout') {
    return 'disconnected';
  }
  if (!normalized) return 'disconnected';
  return 'error';
}

export function mapMessageStatus(value: string | null | undefined): 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' {
  const normalized = (value || '').toLowerCase();

  if (!normalized) return 'received';
  if (normalized.includes('pending') || normalized.includes('queue')) return 'queued';
  if (normalized.includes('read')) return 'read';
  if (normalized.includes('delivery') || normalized.includes('delivered')) return 'delivered';
  if (normalized.includes('server_ack') || normalized.includes('sent')) return 'sent';
  if (normalized.includes('error') || normalized.includes('failed')) return 'failed';

  return 'received';
}

function ensureArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return [value as T];
  return [];
}

function coerceString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function extractEventType(payload: Record<string, any>, url: URL) {
  return coerceString(payload.event)
    || coerceString(payload.type)
    || coerceString(payload.eventType)
    || coerceString(payload.trigger)
    || coerceString(url.searchParams.get('event'));
}

export function extractInstanceName(payload: Record<string, any>, url: URL) {
  return coerceString(payload.instance)
    || coerceString(payload.instanceName)
    || coerceString(payload.instance_name)
    || coerceString(payload.sender)
    || coerceString(payload.data?.instanceName)
    || coerceString(payload.data?.instance?.instanceName)
    || coerceString(url.searchParams.get('instance'));
}

export function extractQrCode(payload: Record<string, any>) {
  return coerceString(payload.data?.qrcode)
    || coerceString(payload.data?.base64)
    || coerceString(payload.qrcode?.base64)
    || coerceString(payload.qrcode)
    || coerceString(payload.code);
}

export function extractPairingCode(payload: Record<string, any>) {
  return coerceString(payload.data?.pairingCode)
    || coerceString(payload.pairingCode)
    || coerceString(payload.response?.pairingCode);
}

export function extractConnectionState(payload: Record<string, any>) {
  return coerceString(payload.data?.state)
    || coerceString(payload.state)
    || coerceString(payload.connection)
    || coerceString(payload.data?.connection);
}

export function extractConnectedNumber(payload: Record<string, any>) {
  return coerceString(payload.data?.number)
    || coerceString(payload.number)
    || coerceString(payload.ownerJid)
    || coerceString(payload.data?.ownerJid);
}

export function extractProfileName(payload: Record<string, any>) {
  return coerceString(payload.data?.profileName)
    || coerceString(payload.profileName)
    || coerceString(payload.data?.profile?.name)
    || coerceString(payload.pushName);
}

export function extractContactRecords(payload: Record<string, any>) {
  return ensureArray<Record<string, any>>(
    payload.data?.contacts
      ?? payload.data
      ?? payload.contacts
  );
}

export function extractChatRecords(payload: Record<string, any>) {
  return ensureArray<Record<string, any>>(
    payload.data?.chats
      ?? payload.data
      ?? payload.chats
  );
}

function extractMessageBody(raw: Record<string, any>) {
  return coerceString(raw.message?.conversation)
    || coerceString(raw.message?.extendedTextMessage?.text)
    || coerceString(raw.message?.imageMessage?.caption)
    || coerceString(raw.message?.videoMessage?.caption)
    || coerceString(raw.message?.documentMessage?.caption)
    || coerceString(raw.message?.buttonsResponseMessage?.selectedDisplayText)
    || coerceString(raw.message?.listResponseMessage?.title)
    || coerceString(raw.message?.templateButtonReplyMessage?.selectedDisplayText)
    || coerceString(raw.message?.reactionMessage?.text)
    || coerceString(raw.text)
    || coerceString(raw.body);
}

function extractMessageType(raw: Record<string, any>) {
  if (raw.message?.conversation || raw.message?.extendedTextMessage || raw.text || raw.body) return 'text';
  if (raw.message?.imageMessage) return 'image';
  if (raw.message?.audioMessage) return 'audio';
  if (raw.message?.videoMessage) return 'video';
  if (raw.message?.documentMessage) return 'document';
  if (raw.message?.stickerMessage) return 'sticker';
  if (raw.message?.locationMessage) return 'location';
  if (raw.message?.reactionMessage) return 'reaction';
  return 'unknown';
}

function extractMediaUrl(raw: Record<string, any>) {
  return coerceString(raw.message?.imageMessage?.url)
    || coerceString(raw.message?.videoMessage?.url)
    || coerceString(raw.message?.audioMessage?.url)
    || coerceString(raw.message?.documentMessage?.url)
    || coerceString(raw.mediaUrl);
}

export function extractMessageRecords(payload: Record<string, any>, defaultDirection?: 'inbound' | 'outbound') {
  const items = ensureArray<Record<string, any>>(
    payload.data?.messages
      ?? payload.messages
      ?? payload.data
  );

  return items.map((raw): EvolutionMessageRecord => {
    const key = (raw.key && typeof raw.key === 'object') ? raw.key : {};
    const remoteJid = normalizeWhatsAppJid(
      coerceString(key.remoteJid)
      || coerceString(raw.remoteJid)
      || coerceString(raw.chatId)
      || coerceString(raw.id)
    );
    const fromMe = defaultDirection
      ? defaultDirection === 'outbound'
      : Boolean(key.fromMe ?? raw.fromMe);
    const senderJid = normalizeWhatsAppJid(
      coerceString(raw.sender)
      || coerceString(raw.senderJid)
      || (fromMe ? coerceString(raw.ownerJid) : coerceString(key.participant) || remoteJid)
    );
    const recipientJid = normalizeWhatsAppJid(
      coerceString(raw.recipient)
      || coerceString(raw.recipientJid)
      || (fromMe ? remoteJid : coerceString(raw.ownerJid))
    );

    return {
      raw,
      externalMessageId: coerceString(key.id) || coerceString(raw.messageId) || coerceString(raw.id),
      remoteJid,
      fromMe,
      senderJid,
      recipientJid,
      pushName: coerceString(raw.pushName) || coerceString(raw.notify),
      profileName: coerceString(raw.profileName) || coerceString(raw.name),
      body: extractMessageBody(raw),
      messageType: extractMessageType(raw),
      status: coerceString(raw.status) || coerceString(raw.messageStatus) || 'received',
      mediaUrl: extractMediaUrl(raw),
      sentAt: parsePossibleTimestamp(raw.messageTimestamp ?? raw.timestamp ?? raw.message?.messageTimestamp),
    };
  });
}
