BEGIN;

CREATE OR REPLACE FUNCTION brain.enqueue_sync_item(
  p_source_table text,
  p_source_id uuid,
  p_operation text DEFAULT 'UPDATE'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_source_table text := nullif(trim(p_source_table), '');
  v_operation text := upper(coalesce(nullif(trim(p_operation), ''), 'UPDATE'));
BEGIN
  IF v_source_table IS NULL OR p_source_id IS NULL THEN
    RETURN;
  END IF;

  IF v_operation NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    v_operation := 'UPDATE';
  END IF;

  INSERT INTO brain.sync_queue (source_table, source_id, operation)
  SELECT
    v_source_table,
    p_source_id,
    v_operation
  WHERE NOT EXISTS (
    SELECT 1
    FROM brain.sync_queue q
    WHERE q.source_table = v_source_table
      AND q.source_id = p_source_id
      AND q.status IN ('pending', 'processing')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.live_state_domains_for_source(p_source_table text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_source text := lower(coalesce(trim(p_source_table), ''));
BEGIN
  IF v_source IN (
    'crm_leads',
    'crm_followups',
    'crm_lead_activities',
    'crm_lead_stage_history',
    'crm_pipeline_stages',
    'crm_chat_conversations',
    'crm_chat_messages',
    'crm_chat_contacts'
  ) THEN
    RETURN ARRAY['crm'];
  ELSIF v_source = 'proposals' THEN
    RETURN ARRAY['comercial', 'propostas'];
  ELSIF v_source = 'acceptances' THEN
    RETURN ARRAY['comercial', 'clientes', 'contratos', 'financeiro', 'projetos'];
  ELSIF v_source IN ('contracts', 'addenda') THEN
    RETURN ARRAY['contratos', 'financeiro', 'clientes'];
  ELSIF v_source IN ('traffic_projects', 'website_projects', 'landing_page_projects') THEN
    RETURN ARRAY['projetos'];
  ELSIF v_source IN ('project_tasks', 'task_history', 'task_monthly_snapshots') THEN
    RETURN ARRAY['tarefas', 'prazos', 'projetos'];
  ELSIF v_source IN ('app_users', 'access_logs') THEN
    RETURN ARRAY['usuarios'];
  ELSIF v_source IN ('scheduled_tasks') THEN
    RETURN ARRAY['tarefas', 'prazos'];
  ELSE
    RETURN ARRAY['overview'];
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION brain.handle_crm_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_lead_id uuid;
  v_lead_operation text := 'UPDATE';
  v_stage_id uuid;
  v_conversation_id uuid;
  v_contact_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'crm_leads' THEN
    v_lead_id := coalesce(NEW.id, OLD.id);
    v_lead_operation := TG_OP;

  ELSIF TG_TABLE_NAME = 'crm_lead_activities' THEN
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);
    v_lead_operation := TG_OP;

  ELSIF TG_TABLE_NAME = 'crm_followups' THEN
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);
    v_lead_operation := TG_OP;

  ELSIF TG_TABLE_NAME = 'crm_lead_stage_history' THEN
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);
    v_lead_operation := TG_OP;

  ELSIF TG_TABLE_NAME = 'crm_pipeline_stages' THEN
    v_stage_id := coalesce(NEW.id, OLD.id);

    IF v_stage_id IS NOT NULL THEN
      INSERT INTO brain.sync_queue (source_table, source_id, operation)
      SELECT
        'crm_leads',
        l.id,
        'UPDATE'
      FROM public.crm_leads l
      WHERE l.stage_id = v_stage_id;
    END IF;

    RETURN coalesce(NEW, OLD);

  ELSIF TG_TABLE_NAME = 'crm_chat_conversations' THEN
    v_conversation_id := coalesce(NEW.id, OLD.id);
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);

  ELSIF TG_TABLE_NAME = 'crm_chat_messages' THEN
    v_conversation_id := coalesce(NEW.conversation_id, OLD.conversation_id);
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);

  ELSIF TG_TABLE_NAME = 'crm_chat_contacts' THEN
    v_contact_id := coalesce(NEW.id, OLD.id);
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);

    IF v_contact_id IS NOT NULL THEN
      PERFORM brain.enqueue_sync_item('crm_chat_conversations', c.id, 'UPDATE')
      FROM public.crm_chat_conversations c
      WHERE c.contact_id = v_contact_id;
    END IF;
  END IF;

  IF v_conversation_id IS NOT NULL THEN
    PERFORM brain.enqueue_sync_item('crm_chat_conversations', v_conversation_id, 'UPDATE');
  END IF;

  IF v_lead_id IS NOT NULL THEN
    PERFORM brain.enqueue_sync_item('crm_leads', v_lead_id, v_lead_operation);
    PERFORM brain.enqueue_sync_item('crm_chat_conversations', c.id, 'UPDATE')
    FROM public.crm_chat_conversations c
    WHERE c.lead_id = v_lead_id;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_brain_sync_crm_chat_conversations ON public.crm_chat_conversations;
CREATE TRIGGER trg_brain_sync_crm_chat_conversations
AFTER INSERT OR UPDATE ON public.crm_chat_conversations
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DROP TRIGGER IF EXISTS trg_brain_sync_crm_chat_messages ON public.crm_chat_messages;
CREATE TRIGGER trg_brain_sync_crm_chat_messages
AFTER INSERT OR UPDATE OR DELETE ON public.crm_chat_messages
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DROP TRIGGER IF EXISTS trg_brain_sync_crm_chat_contacts ON public.crm_chat_contacts;
CREATE TRIGGER trg_brain_sync_crm_chat_contacts
AFTER INSERT OR UPDATE ON public.crm_chat_contacts
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

SELECT brain.enqueue_sync_item('crm_chat_conversations', c.id, 'UPDATE')
FROM public.crm_chat_conversations c;

GRANT EXECUTE ON FUNCTION brain.enqueue_sync_item(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.live_state_domains_for_source(text) TO service_role;

COMMIT;
