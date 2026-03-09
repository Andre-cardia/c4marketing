import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  EVOLUTION_WEBHOOK_EVENTS,
  corsHeaders,
  evolutionRequest,
  extractConnectedNumber,
  extractQrCode,
  extractPairingCode,
  extractProfileName,
  getErrorMessage,
  getEvolutionConfig,
  jsonResponse,
  mapConnectionStatus,
  mapMessageStatus,
  normalizePhoneDigits,
  normalizeRole,
  normalizeWhatsAppJid,
  parsePossibleTimestamp,
} from '../_shared/evolution.ts';

type UserContext = {
  authUserId: string;
  appUserId: string | null;
  email: string | null;
  role: string;
};

const READ_ROLES = ['admin', 'gestor', 'comercial', 'leitor'];
const WRITE_ROLES = ['admin', 'gestor', 'comercial'];

function buildWebhookUrl(instanceName: string) {
  const config = getEvolutionConfig();
  if (!config.webhookUrl) return null;
  return `${config.webhookUrl}&instance=${encodeURIComponent(instanceName)}`;
}

function buildWebhookPayload(webhookUrl: string) {
  return {
    enabled: true,
    url: webhookUrl,
    events: [...EVOLUTION_WEBHOOK_EVENTS],
    base64: true,
    byEvents: false,
  };
}

function sanitizeInstanceName(value: string | null | undefined, fallbackLabel: string) {
  const base = (value || fallbackLabel || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || `crm-chat-${crypto.randomUUID().slice(0, 8)}`;
}

function buildInstanceSettings(body: Record<string, any>, existingSettings?: Record<string, any>) {
  return {
    ...(existingSettings || {}),
    owner_number: normalizePhoneDigits(body.owner_number || existingSettings?.owner_number || ''),
    always_online: body.always_online ?? existingSettings?.always_online ?? true,
    read_messages: body.read_messages ?? existingSettings?.read_messages ?? false,
    read_status: body.read_status ?? existingSettings?.read_status ?? false,
    sync_full_history: body.sync_full_history ?? existingSettings?.sync_full_history ?? false,
    reject_call: body.reject_call ?? existingSettings?.reject_call ?? true,
    groups_ignore: body.groups_ignore ?? existingSettings?.groups_ignore ?? true,
    instance_token: existingSettings?.instance_token || `${sanitizeInstanceName(body.evolution_instance_name, body.label)}-crm`,
  };
}

async function resolveUserContext(req: Request, supabaseAdmin: any): Promise<UserContext | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const authToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!authToken) return null;

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: userAuthError,
  } = await authClient.auth.getUser(authToken);

  if (userAuthError) {
    console.error('evolution-manager auth.getUser error:', userAuthError.message);
  }

  if (!user) return null;

  const { data: appUser } = await supabaseAdmin
    .from('app_users')
    .select('id, email, role')
    .ilike('email', user.email || '')
    .limit(1)
    .maybeSingle();

  return {
    authUserId: user.id,
    appUserId: appUser?.id ?? null,
    email: user.email || null,
    role: normalizeRole(appUser?.role || user.role || 'authenticated'),
  };
}

function ensureAuthorized(user: UserContext | null, allowedRoles: string[]) {
  if (!user) {
    return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
  }

  if (!allowedRoles.includes(user.role)) {
    return jsonResponse(
      {
        error: `Acesso negado para o perfil atual (${user.role || 'desconhecido'}).`,
      },
      403
    );
  }

  return null;
}

async function fetchInstanceById(supabaseAdmin: any, instanceId: string) {
  const { data, error } = await supabaseAdmin
    .from('crm_chat_instances')
    .select('*')
    .eq('id', instanceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function fetchInstanceByName(supabaseAdmin: any, instanceName: string) {
  const { data, error } = await supabaseAdmin
    .from('crm_chat_instances')
    .select('*')
    .eq('evolution_instance_name', instanceName)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function ensureRemoteInstance(instanceRow: any) {
  const config = getEvolutionConfig();
  if (!config.isConfigured) {
    throw new Error('Evolution API não configurada por completo. Defina base URL, API key e webhook token.');
  }

  const settings = (instanceRow.settings || {}) as Record<string, any>;
  const webhookUrl = buildWebhookUrl(instanceRow.evolution_instance_name);

  try {
    await evolutionRequest(config, `/instance/connectionState/${instanceRow.evolution_instance_name}`, {
      method: 'GET',
    });
    return { created: false };
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (!message.includes('not found') && !message.includes('não encontrada') && !message.includes('instance')) {
      throw error;
    }
  }

  const createPayload = {
    instanceName: instanceRow.evolution_instance_name,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    number: settings.owner_number || undefined,
    token: settings.instance_token || `${instanceRow.evolution_instance_name}-crm`,
    rejectCall: settings.reject_call ?? true,
    groupsIgnore: settings.groups_ignore ?? true,
    alwaysOnline: settings.always_online ?? true,
    readMessages: settings.read_messages ?? false,
    readStatus: settings.read_status ?? false,
    syncFullHistory: settings.sync_full_history ?? false,
    webhook: webhookUrl
      ? buildWebhookPayload(webhookUrl)
      : undefined,
  };

  const response = await evolutionRequest(config, '/instance/create', {
    method: 'POST',
    body: JSON.stringify(createPayload),
  });

  return { created: true, response };
}

async function configureRemoteWebhook(instanceRow: any) {
  const config = getEvolutionConfig();
  const webhookUrl = buildWebhookUrl(instanceRow.evolution_instance_name);

  if (!config.isConfigured || !webhookUrl) {
    throw new Error('Webhook da Evolution API não configurado. Defina EVOLUTION_WEBHOOK_TOKEN.');
  }

  const response = await evolutionRequest(config, `/webhook/set/${instanceRow.evolution_instance_name}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: buildWebhookPayload(webhookUrl),
    }),
  });

  return { response, webhookUrl };
}

async function syncInstanceState(supabaseAdmin: any, instanceRow: any) {
  const config = getEvolutionConfig();
  if (!config.isConfigured) {
    return { instance: instanceRow, remote: null };
  }

  const [connectionState, webhookState] = await Promise.all([
    evolutionRequest(config, `/instance/connectionState/${instanceRow.evolution_instance_name}`, {
      method: 'GET',
    }),
    evolutionRequest(config, `/webhook/find/${instanceRow.evolution_instance_name}`, {
      method: 'GET',
    }).catch(() => null),
  ]);

  const connectedNumber = extractConnectedNumber(connectionState);
  const status = mapConnectionStatus(connectionState?.instance?.state || connectionState?.state || connectionState?.status);
  const webhookUrl = webhookState?.url || webhookState?.webhook?.url || buildWebhookUrl(instanceRow.evolution_instance_name);
  const webhookConfigured = Boolean(webhookState?.enabled ?? webhookState?.webhook?.enabled ?? instanceRow.webhook_configured);

  const { data: updatedInstance, error } = await supabaseAdmin
    .from('crm_chat_instances')
    .update({
      status,
      connected_number: connectedNumber || instanceRow.connected_number,
      connected_jid: normalizeWhatsAppJid(connectionState?.instance?.ownerJid || connectedNumber),
      profile_name: extractProfileName(connectionState) || instanceRow.profile_name,
      webhook_url: webhookUrl,
      webhook_configured: webhookConfigured,
      qr_code: status === 'connected' ? null : instanceRow.qr_code,
      qr_code_updated_at: status === 'connected' ? null : instanceRow.qr_code_updated_at,
      last_connection_at: status === 'connected' ? new Date().toISOString() : instanceRow.last_connection_at,
      last_sync_at: new Date().toISOString(),
      updated_by: instanceRow.updated_by,
    })
    .eq('id', instanceRow.id)
    .select('*')
    .single();

  if (error) throw error;

  return {
    instance: updatedInstance,
    remote: {
      connectionState,
      webhookState,
    },
  };
}

async function getOverviewStats(supabaseAdmin: any) {
  const [conversationsResp, unreadResp, messagesResp] = await Promise.all([
    supabaseAdmin.from('crm_chat_conversations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('crm_chat_conversations').select('unread_count'),
    supabaseAdmin.from('crm_chat_messages').select('*', { count: 'exact', head: true }),
  ]);

  if (conversationsResp.error) throw conversationsResp.error;
  if (unreadResp.error) throw unreadResp.error;
  if (messagesResp.error) throw messagesResp.error;

  const unread = ((unreadResp.data || []) as Array<{ unread_count?: number | null }>).reduce(
    (sum, row) => sum + Number(row.unread_count || 0),
    0
  );

  return {
    conversations: Number(conversationsResp.count || 0),
    unread,
    messages: Number(messagesResp.count || 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : 'overview';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const user = await resolveUserContext(req, supabaseAdmin);
    const authResponse = ensureAuthorized(user, action === 'overview' ? READ_ROLES : WRITE_ROLES);
    if (authResponse) return authResponse;

    if (action === 'overview') {
      const config = getEvolutionConfig();
      const instanceId = typeof body.instanceId === 'string' ? body.instanceId : null;
      let instance = instanceId
        ? await fetchInstanceById(supabaseAdmin, instanceId)
        : await supabaseAdmin
            .from('crm_chat_instances')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
            .then(({ data, error }: any) => {
              if (error) throw error;
              return data;
            });

      let remote = null;
      if (instance && config.isConfigured) {
        try {
          const synced = await syncInstanceState(supabaseAdmin, instance);
          instance = synced.instance;
          remote = synced.remote;
        } catch (error) {
          console.warn('evolution-manager overview sync warning:', getErrorMessage(error));
        }
      }

      return jsonResponse({
        config: {
          isConfigured: config.isConfigured,
          hasApiBaseUrl: config.hasApiBaseUrl,
          hasApiKey: config.hasApiKey,
          hasWebhookToken: config.hasWebhookToken,
          webhookUrl: instance ? buildWebhookUrl(instance.evolution_instance_name) : config.webhookUrl,
        },
        instance,
        remote,
        stats: await getOverviewStats(supabaseAdmin),
      });
    }

    if (action === 'upsert_instance') {
      const label = String(body.label || '').trim();
      if (!label) {
        return jsonResponse({ error: 'Informe o nome da instância.' }, 400);
      }

      const instanceName = sanitizeInstanceName(body.evolution_instance_name, label);
      const existing = body.instanceId
        ? await fetchInstanceById(supabaseAdmin, String(body.instanceId))
        : await fetchInstanceByName(supabaseAdmin, instanceName);

      const settings = buildInstanceSettings(body, existing?.settings || {});
      const upsertPayload = {
        id: existing?.id || undefined,
        label,
        evolution_instance_name: instanceName,
        status: existing?.status || 'disconnected',
        connected_number: existing?.connected_number || null,
        connected_jid: existing?.connected_jid || null,
        profile_name: existing?.profile_name || null,
        webhook_url: existing?.webhook_url || buildWebhookUrl(instanceName),
        webhook_configured: existing?.webhook_configured || false,
        qr_code: existing?.qr_code || null,
        qr_code_updated_at: existing?.qr_code_updated_at || null,
        last_connection_at: existing?.last_connection_at || null,
        last_sync_at: existing?.last_sync_at || null,
        settings,
        created_by: existing?.created_by || user?.appUserId || null,
        updated_by: user?.appUserId || null,
      };

      const { data: savedInstance, error: saveError } = await supabaseAdmin
        .from('crm_chat_instances')
        .upsert(upsertPayload, { onConflict: 'evolution_instance_name' })
        .select('*')
        .single();

      if (saveError) throw saveError;

      let remote: any = null;

      if (body.ensureRemote !== false) {
        const ensured = await ensureRemoteInstance(savedInstance);
        remote = ensured.response || null;

        const webhook = await configureRemoteWebhook(savedInstance);
        remote = {
          ensured,
          webhook: webhook.response,
        };
      }

      const synced = getEvolutionConfig().isConfigured
        ? await syncInstanceState(supabaseAdmin, savedInstance)
        : { instance: savedInstance, remote };

      return jsonResponse({
        instance: synced.instance,
        remote: remote || synced.remote || null,
      });
    }

    if (action === 'sync_instance') {
      const instanceId = String(body.instanceId || '').trim();
      if (!instanceId) {
        return jsonResponse({ error: 'instanceId é obrigatório.' }, 400);
      }

      const instance = await fetchInstanceById(supabaseAdmin, instanceId);
      if (!instance) {
        return jsonResponse({ error: 'Instância não encontrada.' }, 404);
      }

      const synced = await syncInstanceState(supabaseAdmin, instance);
      return jsonResponse(synced);
    }

    if (action === 'connect_instance') {
      const instanceId = String(body.instanceId || '').trim();
      if (!instanceId) {
        return jsonResponse({ error: 'instanceId é obrigatório.' }, 400);
      }

      const instance = await fetchInstanceById(supabaseAdmin, instanceId);
      if (!instance) {
        return jsonResponse({ error: 'Instância não encontrada.' }, 404);
      }

      await ensureRemoteInstance(instance);
      await configureRemoteWebhook(instance);

      const connectMode = String(body.connect_mode || 'qrcode').trim().toLowerCase();
      const shouldUsePairing = connectMode === 'pairing';
      const ownerNumber = shouldUsePairing
        ? normalizePhoneDigits(body.number || instance.settings?.owner_number || '')
        : '';
      const query = ownerNumber ? `?number=${encodeURIComponent(ownerNumber)}` : '';
      const config = getEvolutionConfig();
      const connect = await evolutionRequest(config, `/instance/connect/${instance.evolution_instance_name}${query}`, {
        method: 'GET',
      });
      const qrCode = extractQrCode(connect);
      const pairingCode = extractPairingCode(connect);
      const hasConnectArtifact = Boolean(qrCode || pairingCode);

      const nextSettings = {
        ...(instance.settings || {}),
        owner_number: shouldUsePairing
          ? ownerNumber || instance.settings?.owner_number || ''
          : instance.settings?.owner_number || '',
        last_pairing_code: pairingCode || (shouldUsePairing ? instance.settings?.last_pairing_code || null : null),
        last_connect_mode: shouldUsePairing ? 'pairing' : 'qrcode',
        last_connect_response: connect,
      };

      const { data: updatedInstance, error: updateError } = await supabaseAdmin
        .from('crm_chat_instances')
        .update({
          status: hasConnectArtifact ? 'qrcode' : 'connecting',
          qr_code: qrCode || (hasConnectArtifact ? instance.qr_code : null),
          qr_code_updated_at: qrCode ? new Date().toISOString() : instance.qr_code_updated_at,
          settings: nextSettings,
          webhook_url: buildWebhookUrl(instance.evolution_instance_name),
          webhook_configured: true,
          updated_by: user?.appUserId || null,
        })
        .eq('id', instance.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      return jsonResponse({
        instance: updatedInstance,
        connect,
      });
    }

    if (action === 'send_text') {
      const conversationId = String(body.conversationId || '').trim();
      const text = String(body.text || '').trim();

      if (!conversationId || !text) {
        return jsonResponse({ error: 'conversationId e text são obrigatórios.' }, 400);
      }

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from('crm_chat_conversations')
        .select(`
          *,
          contact:crm_chat_contacts(*),
          instance:crm_chat_instances(*)
        `)
        .eq('id', conversationId)
        .single();

      if (conversationError) throw conversationError;
      if (!conversation) {
        return jsonResponse({ error: 'Conversa não encontrada.' }, 404);
      }

      const instance = conversation.instance;
      const contact = conversation.contact;

      if (!instance || !contact) {
        return jsonResponse({ error: 'Conversa sem instância ou contato válido.' }, 400);
      }

      const number = normalizePhoneDigits(
        body.number
        || contact.phone_number_normalized
        || contact.phone_number
        || contact.whatsapp_jid
      );

      if (!number) {
        return jsonResponse({ error: 'Não foi possível identificar o número do contato.' }, 400);
      }

      const provider = await evolutionRequest(getEvolutionConfig(), `/message/sendText/${instance.evolution_instance_name}`, {
        method: 'POST',
        body: JSON.stringify({
          number,
          text,
        }),
      });

      const externalMessageId = provider?.key?.id || provider?.message?.key?.id || provider?.id || null;
      const messagePayload = {
        conversation_id: conversation.id,
        instance_id: instance.id,
        contact_id: contact.id,
        lead_id: body.leadId || conversation.lead_id || contact.lead_id || null,
        external_message_id: externalMessageId,
        direction: 'outbound',
        message_type: 'text',
        status: mapMessageStatus(provider?.status || provider?.messageStatus || 'queued'),
        sender_jid: instance.connected_jid || null,
        recipient_jid: normalizeWhatsAppJid(number),
        body: text,
        metadata: {
          source: 'evolution-manager',
          provider,
        },
        sent_at: parsePossibleTimestamp(provider?.messageTimestamp || provider?.message?.messageTimestamp || Date.now()),
        created_by: user?.appUserId || null,
      };

      let messageRow: any = null;

      if (externalMessageId) {
        const { data, error } = await supabaseAdmin
          .from('crm_chat_messages')
          .upsert(messagePayload, { onConflict: 'instance_id,external_message_id' })
          .select('*')
          .single();

        if (error) throw error;
        messageRow = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('crm_chat_messages')
          .insert(messagePayload)
          .select('*')
          .single();

        if (error) throw error;
        messageRow = data;
      }

      if (body.leadId && conversation.lead_id !== body.leadId) {
        await supabaseAdmin
          .from('crm_chat_conversations')
          .update({ lead_id: body.leadId, updated_at: new Date().toISOString() })
          .eq('id', conversation.id);
      }

      return jsonResponse({
        provider,
        message: messageRow,
      });
    }

    return jsonResponse({ error: `Ação inválida: ${action}` }, 400);
  } catch (error) {
    console.error('Error in evolution-manager:', error);
    return jsonResponse(
      {
        error: getErrorMessage(error) || 'Erro interno na integração com a Evolution API.',
      },
      500
    );
  }
});
