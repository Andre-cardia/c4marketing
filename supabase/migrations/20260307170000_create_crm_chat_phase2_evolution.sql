BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_chat_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  evolution_instance_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (
    status IN ('disconnected', 'connecting', 'qrcode', 'connected', 'error')
  ),
  connected_number TEXT,
  connected_jid TEXT,
  profile_name TEXT,
  webhook_url TEXT,
  webhook_configured BOOLEAN NOT NULL DEFAULT FALSE,
  qr_code TEXT,
  qr_code_updated_at TIMESTAMPTZ,
  last_connection_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_chat_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_jid TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  phone_number_normalized TEXT,
  push_name TEXT,
  profile_name TEXT,
  avatar_url TEXT,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.crm_chat_instances(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_chat_contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'pending', 'resolved', 'archived')
  ),
  subject TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_chat_conversations_instance_contact_unique UNIQUE (instance_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.crm_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.crm_chat_conversations(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.crm_chat_instances(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_chat_contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  external_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (
    message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'reaction', 'unknown')
  ),
  status TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')
  ),
  sender_jid TEXT,
  recipient_jid TEXT,
  body TEXT,
  media_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_chat_messages_instance_external_unique UNIQUE (instance_id, external_message_id)
);

CREATE TABLE IF NOT EXISTS public.crm_chat_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'evolution',
  instance_name TEXT,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored', 'error')),
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_chat_instances_status
  ON public.crm_chat_instances(status);

CREATE INDEX IF NOT EXISTS idx_crm_chat_instances_updated_at
  ON public.crm_chat_instances(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_contacts_phone
  ON public.crm_chat_contacts(phone_number_normalized);

CREATE INDEX IF NOT EXISTS idx_crm_chat_contacts_lead_id
  ON public.crm_chat_contacts(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_chat_contacts_last_message_at
  ON public.crm_chat_contacts(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_conversations_lead_id
  ON public.crm_chat_conversations(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_chat_conversations_status
  ON public.crm_chat_conversations(status);

CREATE INDEX IF NOT EXISTS idx_crm_chat_conversations_assigned_user_id
  ON public.crm_chat_conversations(assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_crm_chat_conversations_last_message_at
  ON public.crm_chat_conversations(last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_chat_messages_conversation_sent_at
  ON public.crm_chat_messages(conversation_id, sent_at ASC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_messages_lead_id
  ON public.crm_chat_messages(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_chat_messages_status
  ON public.crm_chat_messages(status);

CREATE INDEX IF NOT EXISTS idx_crm_chat_webhook_events_received_at
  ON public.crm_chat_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_chat_webhook_events_status
  ON public.crm_chat_webhook_events(status, received_at DESC);

CREATE OR REPLACE FUNCTION public.crm_chat_prepare_instance_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.label := btrim(COALESCE(NEW.label, ''));
  NEW.evolution_instance_name := lower(btrim(COALESCE(NEW.evolution_instance_name, '')));

  IF NEW.label = '' THEN
    RAISE EXCEPTION 'O rótulo da instância do chat é obrigatório.';
  END IF;

  IF NEW.evolution_instance_name = '' THEN
    RAISE EXCEPTION 'O nome da instância Evolution é obrigatório.';
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_chat_prepare_contact_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_phone_source TEXT;
BEGIN
  NEW.whatsapp_jid := lower(btrim(COALESCE(NEW.whatsapp_jid, '')));

  IF NEW.whatsapp_jid = '' THEN
    RAISE EXCEPTION 'O WhatsApp JID do contato é obrigatório.';
  END IF;

  v_phone_source := COALESCE(NULLIF(btrim(NEW.phone_number), ''), split_part(NEW.whatsapp_jid, '@', 1));
  NEW.phone_number := NULLIF(btrim(v_phone_source), '');
  NEW.phone_number_normalized := NULLIF(regexp_replace(COALESCE(v_phone_source, ''), '\D', '', 'g'), '');
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_chat_prepare_conversation_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_contact_lead UUID;
BEGIN
  NEW.updated_at := now();

  IF NEW.lead_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT lead_id
    INTO v_contact_lead
    FROM public.crm_chat_contacts
    WHERE id = NEW.contact_id;

    NEW.lead_id := v_contact_lead;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_chat_sync_contact_lead_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_lead UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.crm_chat_contacts
    SET
      lead_id = NEW.lead_id,
      updated_at = now()
    WHERE id = NEW.contact_id
      AND lead_id IS DISTINCT FROM NEW.lead_id;
  ELSIF NEW.lead_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT lead_id
    INTO v_contact_lead
    FROM public.crm_chat_contacts
    WHERE id = NEW.contact_id;

    IF v_contact_lead IS NOT NULL THEN
      UPDATE public.crm_chat_conversations
      SET
        lead_id = v_contact_lead,
        updated_at = now()
      WHERE id = NEW.id
        AND lead_id IS DISTINCT FROM v_contact_lead;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_chat_touch_conversation_from_message_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  v_preview := CASE
    WHEN COALESCE(btrim(COALESCE(NEW.body, '')), '') <> '' THEN left(btrim(NEW.body), 160)
    ELSE '[' || NEW.message_type || ']'
  END;

  UPDATE public.crm_chat_conversations
  SET
    last_message_at = NEW.sent_at,
    last_message_preview = v_preview,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    lead_id = COALESCE(lead_id, NEW.lead_id),
    updated_at = now()
  WHERE id = NEW.conversation_id;

  UPDATE public.crm_chat_contacts
  SET
    last_message_at = NEW.sent_at,
    lead_id = COALESCE(lead_id, NEW.lead_id),
    updated_at = now()
  WHERE id = NEW.contact_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_chat_log_message_activity_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity_type TEXT;
  v_summary TEXT;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.direction = 'inbound' THEN
    v_activity_type := 'whatsapp_in';
  ELSIF NEW.direction = 'outbound' THEN
    v_activity_type := 'whatsapp_out';
  ELSE
    RETURN NEW;
  END IF;

  v_summary := CASE
    WHEN COALESCE(btrim(COALESCE(NEW.body, '')), '') <> '' THEN left(btrim(NEW.body), 120)
    ELSE 'Mensagem de WhatsApp [' || NEW.message_type || ']'
  END;

  INSERT INTO public.crm_lead_activities (
    lead_id,
    activity_type,
    summary,
    content,
    metadata,
    created_by,
    created_at
  ) VALUES (
    NEW.lead_id,
    v_activity_type,
    v_summary,
    NULLIF(btrim(COALESCE(NEW.body, '')), ''),
    jsonb_build_object(
      'source', 'crm_chat',
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id,
      'external_message_id', NEW.external_message_id,
      'direction', NEW.direction,
      'status', NEW.status,
      'message_type', NEW.message_type
    ),
    NEW.created_by,
    COALESCE(NEW.sent_at, NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_chat_prepare_instance_write ON public.crm_chat_instances;
CREATE TRIGGER trg_crm_chat_prepare_instance_write
  BEFORE INSERT OR UPDATE ON public.crm_chat_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_chat_prepare_instance_write();

DROP TRIGGER IF EXISTS trg_crm_chat_prepare_contact_write ON public.crm_chat_contacts;
CREATE TRIGGER trg_crm_chat_prepare_contact_write
  BEFORE INSERT OR UPDATE ON public.crm_chat_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_chat_prepare_contact_write();

DROP TRIGGER IF EXISTS trg_crm_chat_prepare_conversation_write ON public.crm_chat_conversations;
CREATE TRIGGER trg_crm_chat_prepare_conversation_write
  BEFORE INSERT OR UPDATE ON public.crm_chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_chat_prepare_conversation_write();

DROP TRIGGER IF EXISTS trg_crm_chat_sync_contact_lead ON public.crm_chat_conversations;
CREATE TRIGGER trg_crm_chat_sync_contact_lead
  AFTER INSERT OR UPDATE ON public.crm_chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_chat_sync_contact_lead_fn();

DROP TRIGGER IF EXISTS trg_crm_chat_touch_conversation_from_message ON public.crm_chat_messages;
CREATE TRIGGER trg_crm_chat_touch_conversation_from_message
  AFTER INSERT ON public.crm_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_chat_touch_conversation_from_message_fn();

DROP TRIGGER IF EXISTS trg_crm_chat_log_message_activity ON public.crm_chat_messages;
CREATE TRIGGER trg_crm_chat_log_message_activity
  AFTER INSERT ON public.crm_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_chat_log_message_activity_fn();

ALTER TABLE public.crm_chat_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chat_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_chat_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM chat instances read" ON public.crm_chat_instances;
DROP POLICY IF EXISTS "CRM chat instances manage" ON public.crm_chat_instances;
CREATE POLICY "CRM chat instances read" ON public.crm_chat_instances
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM chat instances manage" ON public.crm_chat_instances
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

DROP POLICY IF EXISTS "CRM chat contacts read" ON public.crm_chat_contacts;
DROP POLICY IF EXISTS "CRM chat contacts manage" ON public.crm_chat_contacts;
CREATE POLICY "CRM chat contacts read" ON public.crm_chat_contacts
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM chat contacts manage" ON public.crm_chat_contacts
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

DROP POLICY IF EXISTS "CRM chat conversations read" ON public.crm_chat_conversations;
DROP POLICY IF EXISTS "CRM chat conversations manage" ON public.crm_chat_conversations;
CREATE POLICY "CRM chat conversations read" ON public.crm_chat_conversations
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM chat conversations manage" ON public.crm_chat_conversations
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

DROP POLICY IF EXISTS "CRM chat messages read" ON public.crm_chat_messages;
DROP POLICY IF EXISTS "CRM chat messages manage" ON public.crm_chat_messages;
CREATE POLICY "CRM chat messages read" ON public.crm_chat_messages
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM chat messages manage" ON public.crm_chat_messages
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

DROP POLICY IF EXISTS "CRM chat webhook events read" ON public.crm_chat_webhook_events;
CREATE POLICY "CRM chat webhook events read" ON public.crm_chat_webhook_events
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

COMMIT;
