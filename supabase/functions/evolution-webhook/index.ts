import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  corsHeaders,
  extractChatRecords,
  extractConnectedNumber,
  extractConnectionState,
  extractContactRecords,
  extractEventType,
  extractInstanceName,
  extractMessageRecords,
  extractPairingCode,
  extractPhoneFromJid,
  extractProfileName,
  extractQrCode,
  getErrorMessage,
  getEvolutionConfig,
  isGroupJid,
  jsonResponse,
  mapConnectionStatus,
  mapMessageStatus,
  normalizePhoneDigits,
  normalizeWhatsAppJid,
  parsePossibleTimestamp,
  sha256Hex,
} from '../_shared/evolution.ts';

function buildWebhookUrl(instanceName: string) {
  const config = getEvolutionConfig();
  if (!config.webhookUrl) return null;
  return `${config.webhookUrl}&instance=${encodeURIComponent(instanceName)}`;
}

async function findLeadByPhone(supabaseAdmin: any, phone: string | null) {
  if (!phone) return null;

  const { data, error } = await supabaseAdmin
    .from('crm_leads')
    .select('id')
    .eq('whatsapp_normalized', phone)
    .is('archived_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function getOrCreateInstance(supabaseAdmin: any, instanceName: string) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('crm_chat_instances')
    .select('*')
    .eq('evolution_instance_name', instanceName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('crm_chat_instances')
    .insert({
      label: instanceName,
      evolution_instance_name: instanceName,
      status: 'connecting',
      webhook_url: buildWebhookUrl(instanceName),
      webhook_configured: true,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function upsertContact(supabaseAdmin: any, jid: string, raw: Record<string, any> = {}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('crm_chat_contacts')
    .select('*')
    .eq('whatsapp_jid', jid)
    .maybeSingle();

  if (existingError) throw existingError;

  const normalizedPhone = normalizePhoneDigits(
    raw.number
      || raw.phone
      || raw.phoneNumber
      || existing?.phone_number
      || extractPhoneFromJid(jid)
      || ''
  );

  const leadId = existing?.lead_id || (await findLeadByPhone(supabaseAdmin, normalizedPhone));

  const payload = {
    id: existing?.id,
    whatsapp_jid: jid,
    phone_number: raw.number || raw.phone || raw.phoneNumber || existing?.phone_number || extractPhoneFromJid(jid),
    push_name: raw.pushName || raw.notify || existing?.push_name || null,
    profile_name: raw.profileName || raw.name || existing?.profile_name || null,
    avatar_url: raw.imgUrl || raw.pictureUrl || raw.profilePictureUrl || existing?.avatar_url || null,
    lead_id: leadId,
    metadata: {
      ...(existing?.metadata || {}),
      last_payload: raw,
    },
    last_message_at: existing?.last_message_at || null,
  };

  const { data, error } = await supabaseAdmin
    .from('crm_chat_contacts')
    .upsert(payload, { onConflict: 'whatsapp_jid' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function upsertConversation(
  supabaseAdmin: any,
  instance: any,
  contact: any,
  patch: Record<string, any> = {}
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('crm_chat_conversations')
    .select('*')
    .eq('instance_id', instance.id)
    .eq('contact_id', contact.id)
    .maybeSingle();

  if (existingError) throw existingError;

  const payload = {
    id: existing?.id,
    instance_id: instance.id,
    contact_id: contact.id,
    lead_id: existing?.lead_id || contact.lead_id || patch.lead_id || null,
    assigned_user_id: existing?.assigned_user_id || patch.assigned_user_id || null,
    status: patch.status || existing?.status || 'open',
    subject: patch.subject || existing?.subject || null,
    last_message_preview: patch.last_message_preview ?? existing?.last_message_preview ?? null,
    last_message_at: patch.last_message_at ?? existing?.last_message_at ?? null,
    unread_count: typeof patch.unread_count === 'number' ? patch.unread_count : existing?.unread_count ?? 0,
  };

  const { data, error } = await supabaseAdmin
    .from('crm_chat_conversations')
    .upsert(payload, { onConflict: 'instance_id,contact_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function markWebhookEvent(supabaseAdmin: any, eventId: string, status: 'processed' | 'ignored' | 'error', errorMessage?: string | null) {
  const { error } = await supabaseAdmin
    .from('crm_chat_webhook_events')
    .update({
      status,
      error_message: errorMessage || null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) throw error;
}

async function storeWebhookEvent(
  supabaseAdmin: any,
  instanceName: string | null,
  eventType: string,
  eventKey: string,
  payload: Record<string, any>
) {
  const { data, error } = await supabaseAdmin
    .from('crm_chat_webhook_events')
    .insert({
      instance_name: instanceName,
      event_type: eventType,
      event_key: eventKey,
      payload,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return null;
    }
    throw error;
  }

  return data;
}

async function processConnectionUpdate(supabaseAdmin: any, instance: any, payload: Record<string, any>) {
  const status = mapConnectionStatus(extractConnectionState(payload));
  const connectedNumber = extractConnectedNumber(payload);
  const profileName = extractProfileName(payload);

  const nextSettings = {
    ...(instance.settings || {}),
    last_pairing_code: extractPairingCode(payload) || instance.settings?.last_pairing_code || null,
  };

  const { error } = await supabaseAdmin
    .from('crm_chat_instances')
    .update({
      status,
      connected_number: connectedNumber || instance.connected_number,
      connected_jid: normalizeWhatsAppJid(payload.data?.ownerJid || connectedNumber),
      profile_name: profileName || instance.profile_name,
      qr_code: status === 'connected' ? null : instance.qr_code,
      qr_code_updated_at: status === 'connected' ? null : instance.qr_code_updated_at,
      last_connection_at: status === 'connected' ? new Date().toISOString() : instance.last_connection_at,
      last_sync_at: new Date().toISOString(),
      webhook_url: instance.webhook_url || buildWebhookUrl(instance.evolution_instance_name),
      webhook_configured: true,
      settings: nextSettings,
    })
    .eq('id', instance.id);

  if (error) throw error;

  return { updated: 1 };
}

async function processQrCodeUpdate(supabaseAdmin: any, instance: any, payload: Record<string, any>) {
  const qrCode = extractQrCode(payload);
  const pairingCode = extractPairingCode(payload);

  const { error } = await supabaseAdmin
    .from('crm_chat_instances')
    .update({
      status: 'qrcode',
      qr_code: qrCode || instance.qr_code,
      qr_code_updated_at: new Date().toISOString(),
      webhook_url: instance.webhook_url || buildWebhookUrl(instance.evolution_instance_name),
      webhook_configured: true,
      last_sync_at: new Date().toISOString(),
      settings: {
        ...(instance.settings || {}),
        last_pairing_code: pairingCode || instance.settings?.last_pairing_code || null,
      },
    })
    .eq('id', instance.id);

  if (error) throw error;

  return { updated: 1 };
}

async function processContacts(supabaseAdmin: any, payload: Record<string, any>) {
  const contacts = extractContactRecords(payload);
  let processed = 0;

  for (const raw of contacts) {
    const jid = normalizeWhatsAppJid(raw.id || raw.remoteJid || raw.jid || raw.phoneNumber);
    if (!jid || isGroupJid(jid)) continue;
    await upsertContact(supabaseAdmin, jid, raw);
    processed += 1;
  }

  return { processed };
}

async function processChats(supabaseAdmin: any, instance: any, payload: Record<string, any>) {
  const chats = extractChatRecords(payload);
  let processed = 0;

  for (const raw of chats) {
    const jid = normalizeWhatsAppJid(raw.id || raw.remoteJid || raw.chatId);
    if (!jid || isGroupJid(jid)) continue;

    const contact = await upsertContact(supabaseAdmin, jid, raw);
    await upsertConversation(supabaseAdmin, instance, contact, {
      status: raw.archived ? 'archived' : 'open',
      unread_count: Number(raw.unreadCount || raw.unread || 0),
      last_message_at: parsePossibleTimestamp(raw.conversationTimestamp || raw.timestamp || raw.updatedAt || Date.now()),
      last_message_preview:
        raw.conversation
        || raw.lastMessage?.conversation
        || raw.lastMessage?.extendedTextMessage?.text
        || raw.lastMessage?.imageMessage?.caption
        || raw.lastMessage?.videoMessage?.caption
        || null,
    });
    processed += 1;
  }

  return { processed };
}

async function processMessages(
  supabaseAdmin: any,
  instance: any,
  payload: Record<string, any>,
  defaultDirection?: 'inbound' | 'outbound'
) {
  const records = extractMessageRecords(payload, defaultDirection);
  let processed = 0;

  for (const record of records) {
    const remoteJid = record.remoteJid;
    if (!remoteJid || isGroupJid(remoteJid)) continue;

    const contact = await upsertContact(supabaseAdmin, remoteJid, {
      pushName: record.pushName,
      profileName: record.profileName,
      phoneNumber: extractPhoneFromJid(remoteJid),
    });

    const conversation = await upsertConversation(supabaseAdmin, instance, contact, {
      lead_id: contact.lead_id,
      last_message_at: record.sentAt,
      last_message_preview: record.body || `[${record.messageType}]`,
    });

    const basePayload = {
      conversation_id: conversation.id,
      instance_id: instance.id,
      contact_id: contact.id,
      lead_id: conversation.lead_id || contact.lead_id || null,
      external_message_id: record.externalMessageId,
      direction: record.fromMe ? 'outbound' : 'inbound',
      message_type: record.messageType,
      status: mapMessageStatus(record.status),
      sender_jid: record.senderJid || (record.fromMe ? instance.connected_jid : remoteJid),
      recipient_jid: record.recipientJid || (record.fromMe ? remoteJid : instance.connected_jid),
      body: record.body,
      media_url: record.mediaUrl,
      metadata: {
        source: 'evolution-webhook',
        raw: record.raw,
      },
      sent_at: record.sentAt,
      created_by: null,
    };

    if (record.externalMessageId) {
      const { error } = await supabaseAdmin
        .from('crm_chat_messages')
        .upsert(basePayload, { onConflict: 'instance_id,external_message_id' });

      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('crm_chat_messages')
        .insert(basePayload);

      if (error) throw error;
    }

    processed += 1;
  }

  return { processed };
}

async function processMessageUpdates(supabaseAdmin: any, instance: any, payload: Record<string, any>) {
  const records = extractMessageRecords(payload);
  let processed = 0;

  for (const record of records) {
    if (!record.externalMessageId) continue;

    const { error } = await supabaseAdmin
      .from('crm_chat_messages')
      .update({
        status: mapMessageStatus(record.status),
        metadata: {
          source: 'evolution-webhook',
          raw_update: record.raw,
        },
      })
      .eq('instance_id', instance.id)
      .eq('external_message_id', record.externalMessageId);

    if (error) throw error;
    processed += 1;
  }

  return { processed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const config = getEvolutionConfig();
    if (!config.hasWebhookToken) {
      return jsonResponse({ error: 'Webhook token não configurado no ambiente.' }, 503);
    }

    const url = new URL(req.url);
    const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const providedToken = url.searchParams.get('token')
      || req.headers.get('x-webhook-token')
      || authorizationHeader.replace(/^Bearer\s+/i, '').trim()
      || '';

    if (providedToken !== config.webhookToken) {
      return jsonResponse({ error: 'Unauthorized webhook token.' }, 401);
    }

    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const eventType = extractEventType(payload, url);
    const instanceName = extractInstanceName(payload, url);

    if (!eventType) {
      return jsonResponse({ error: 'Evento do webhook não identificado.' }, 400);
    }

    const eventKey = await sha256Hex(`${instanceName || 'unknown'}:${eventType}:${rawBody}`);
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const storedEvent = await storeWebhookEvent(supabaseAdmin, instanceName, eventType, eventKey, payload);
    if (!storedEvent) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    try {
      const instance = instanceName ? await getOrCreateInstance(supabaseAdmin, instanceName) : null;
      let result: Record<string, any> = { processed: 0 };

      if (eventType === 'CONNECTION_UPDATE' && instance) {
        result = await processConnectionUpdate(supabaseAdmin, instance, payload);
      } else if (eventType === 'QRCODE_UPDATED' && instance) {
        result = await processQrCodeUpdate(supabaseAdmin, instance, payload);
      } else if ((eventType === 'CONTACTS_UPSERT' || eventType === 'CONTACTS_UPDATE')) {
        result = await processContacts(supabaseAdmin, payload);
      } else if ((eventType === 'CHATS_UPSERT' || eventType === 'CHATS_UPDATE') && instance) {
        result = await processChats(supabaseAdmin, instance, payload);
      } else if ((eventType === 'MESSAGES_UPSERT' || eventType === 'SEND_MESSAGE') && instance) {
        result = await processMessages(
          supabaseAdmin,
          instance,
          payload,
          eventType === 'SEND_MESSAGE' ? 'outbound' : undefined
        );
      } else if (eventType === 'MESSAGES_UPDATE' && instance) {
        result = await processMessageUpdates(supabaseAdmin, instance, payload);
      } else {
        result = { ignored: true };
      }

      await markWebhookEvent(supabaseAdmin, storedEvent.id, result.ignored ? 'ignored' : 'processed');
      return jsonResponse({ ok: true, eventType, instanceName, ...result });
    } catch (processingError) {
      await markWebhookEvent(supabaseAdmin, storedEvent.id, 'error', getErrorMessage(processingError));
      throw processingError;
    }
  } catch (error) {
    console.error('Error in evolution-webhook:', error);
    return jsonResponse(
      {
        error: getErrorMessage(error) || 'Erro interno no webhook da Evolution API.',
      },
      500
    );
  }
});
