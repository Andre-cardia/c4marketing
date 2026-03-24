
CREATE OR REPLACE FUNCTION public.live_state_domains_for_source(p_source_table text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_source text := lower(coalesce(trim(p_source_table), ''));
BEGIN
  IF v_source IN ('crm_leads', 'crm_followups', 'crm_lead_activities', 'crm_lead_stage_history', 'crm_pipeline_stages') THEN
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

CREATE OR REPLACE FUNCTION public.build_crm_live_state_markdown()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_now_pt text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS');
  v_reference_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_total_leads int := 0;
  v_open_leads int := 0;
  v_won_leads int := 0;
  v_lost_leads int := 0;
  v_pending_followups int := 0;
  v_overdue_followups int := 0;
  v_due_today_followups int := 0;

  v_stage_lines text;
  v_recent_leads_lines text;
  v_followup_lines text;
  v_owner_lines text;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE coalesce(s.is_closed, false) = false),
    count(*) FILTER (WHERE s.key = 'proposal_won'),
    count(*) FILTER (WHERE s.key = 'proposal_lost')
  INTO
    v_total_leads,
    v_open_leads,
    v_won_leads,
    v_lost_leads
  FROM public.crm_leads l
  JOIN public.crm_pipeline_stages s
    ON s.id = l.stage_id
  WHERE l.archived_at IS NULL;

  SELECT
    count(*) FILTER (WHERE f.status = 'pending'),
    count(*) FILTER (WHERE f.status = 'pending' AND f.due_at < now()),
    count(*) FILTER (
      WHERE f.status = 'pending'
        AND (f.due_at AT TIME ZONE 'America/Sao_Paulo')::date = v_reference_date
    )
  INTO
    v_pending_followups,
    v_overdue_followups,
    v_due_today_followups
  FROM public.crm_followups f
  JOIN public.crm_leads l
    ON l.id = f.lead_id
  WHERE l.archived_at IS NULL;

  SELECT string_agg(x.line, E'\n' ORDER BY x.position)
  INTO v_stage_lines
  FROM (
    SELECT
      s.position,
      format('- %s: %s lead(s)', s.name, count(l.id)::text) AS line
    FROM public.crm_pipeline_stages s
    LEFT JOIN public.crm_leads l
      ON l.stage_id = s.id
     AND l.archived_at IS NULL
    GROUP BY s.id, s.name, s.position
  ) x;

  SELECT string_agg(x.line, E'\n' ORDER BY x.sort_ts DESC)
  INTO v_recent_leads_lines
  FROM (
    SELECT
      coalesce(l.updated_at, l.created_at) AS sort_ts,
      format(
        '- %s (%s) | estagio=%s | responsavel=%s | abertura=%s | proximo_followup=%s',
        coalesce(nullif(l.name, ''), 'Sem nome'),
        coalesce(nullif(l.company_name, ''), 'Sem empresa'),
        coalesce(s.name, 'Sem estagio'),
        coalesce(nullif(u.full_name, ''), nullif(u.name, ''), nullif(u.email, ''), 'Sem responsavel'),
        to_char(l.opened_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
        coalesce(to_char(l.next_follow_up_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'), 'n/a')
      ) AS line
    FROM public.crm_leads l
    JOIN public.crm_pipeline_stages s
      ON s.id = l.stage_id
    LEFT JOIN public.app_users u
      ON u.id = l.owner_user_id
    WHERE l.archived_at IS NULL
    ORDER BY coalesce(l.updated_at, l.created_at) DESC
    LIMIT 10
  ) x;

  SELECT string_agg(x.line, E'\n' ORDER BY x.due_at ASC NULLS LAST)
  INTO v_followup_lines
  FROM (
    SELECT
      f.due_at,
      format(
        '- %s | %s | lead=%s (%s) | responsavel=%s',
        to_char(f.due_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
        CASE
          WHEN f.status = 'completed' THEN 'concluido'
          WHEN f.status = 'cancelled' THEN 'cancelado'
          WHEN f.due_at < now() THEN 'vencido'
          ELSE 'pendente'
        END,
        coalesce(nullif(l.name, ''), 'Sem nome'),
        coalesce(nullif(l.company_name, ''), 'Sem empresa'),
        coalesce(nullif(u.full_name, ''), nullif(u.name, ''), nullif(u.email, ''), 'Responsavel padrao')
      ) AS line
    FROM public.crm_followups f
    JOIN public.crm_leads l
      ON l.id = f.lead_id
     AND l.archived_at IS NULL
    LEFT JOIN public.app_users u
      ON u.id = f.owner_user_id
    WHERE f.status = 'pending'
    ORDER BY f.due_at ASC
    LIMIT 10
  ) x;

  SELECT string_agg(x.line, E'\n' ORDER BY x.open_leads DESC, x.owner_label ASC)
  INTO v_owner_lines
  FROM (
    SELECT
      coalesce(nullif(u.full_name, ''), nullif(u.name, ''), nullif(u.email, ''), 'Sem responsavel') AS owner_label,
      count(l.id) FILTER (WHERE coalesce(s.is_closed, false) = false) AS open_leads,
      format(
        '- %s | abertos=%s | total=%s',
        coalesce(nullif(u.full_name, ''), nullif(u.name, ''), nullif(u.email, ''), 'Sem responsavel'),
        count(l.id) FILTER (WHERE coalesce(s.is_closed, false) = false)::text,
        count(l.id)::text
      ) AS line
    FROM public.crm_leads l
    LEFT JOIN public.crm_pipeline_stages s
      ON s.id = l.stage_id
    LEFT JOIN public.app_users u
      ON u.id = l.owner_user_id
    WHERE l.archived_at IS NULL
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT 8
  ) x;

  RETURN format(
    E'# LIVE STATE - CRM\n\nAtualizado em (America/Sao_Paulo): %s\nData de referencia: %s\n\n## KPIs do Pipeline\n- Leads totais: %s\n- Leads em aberto: %s\n- Propostas aceitas: %s\n- Propostas perdidas: %s\n- Follow-ups pendentes: %s\n- Follow-ups vencidos: %s\n- Follow-ups para hoje: %s\n\n## Distribuicao por Estagio\n%s\n\n## Leads Recentes\n%s\n\n## Proximos Follow-ups\n%s\n\n## Carteira por Responsavel\n%s\n\n## Notas\n- Este documento e atualizado automaticamente por eventos do CRM.\n- Use este bloco como contexto vivo do funil comercial; para detalhe fino de um lead, combine com o documento individual do CRM e consulta SQL quando necessario.',
    v_now_pt,
    v_reference_date::text,
    v_total_leads,
    v_open_leads,
    v_won_leads,
    v_lost_leads,
    v_pending_followups,
    v_overdue_followups,
    v_due_today_followups,
    coalesce(v_stage_lines, '- Nenhum estagio encontrado.'),
    coalesce(v_recent_leads_lines, '- Nenhum lead no CRM.'),
    coalesce(v_followup_lines, '- Nenhum follow-up pendente.'),
    coalesce(v_owner_lines, '- Nenhum responsavel com carteira ativa.')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_live_state_document(
  p_domain text DEFAULT 'overview',
  p_event_table text DEFAULT NULL,
  p_event_operation text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
DECLARE
  v_domain text := lower(coalesce(nullif(trim(p_domain), ''), 'overview'));
  v_content text;
  v_hash text;
  v_prev_hash text;
  v_prev_updated_at timestamptz;
  v_prev_document_id uuid;
  v_document_id uuid;
  v_metadata jsonb;
BEGIN
  IF v_domain NOT IN ('overview', 'comercial', 'crm', 'clientes', 'propostas', 'contratos', 'financeiro', 'projetos', 'tarefas', 'usuarios', 'acoes', 'prazos') THEN
    v_domain := 'overview';
  END IF;

  SELECT content_hash, updated_at, last_document_id
    INTO v_prev_hash, v_prev_updated_at, v_prev_document_id
  FROM brain.live_state_documents
  WHERE domain = v_domain;

  IF NOT p_force AND v_prev_updated_at IS NOT NULL AND v_prev_updated_at > now() - interval '5 seconds' THEN
    RETURN v_prev_document_id;
  END IF;

  IF v_domain = 'crm' THEN
    v_content := public.build_crm_live_state_markdown();
  ELSE
    v_content := public.build_live_state_markdown(v_domain);
  END IF;

  v_hash := md5(coalesce(v_content, ''));

  IF NOT p_force AND v_prev_hash IS NOT NULL AND v_prev_hash = v_hash THEN
    UPDATE brain.live_state_documents
       SET updated_at = now(),
           last_event_table = p_event_table,
           last_event_operation = p_event_operation,
           metadata = jsonb_strip_nulls(
             coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'last_event_table', p_event_table,
               'last_event_operation', p_event_operation,
               'last_refresh_reason', 'content_unchanged',
               'last_refresh_at', now()
             )
           )
     WHERE domain = v_domain;

    RETURN v_prev_document_id;
  END IF;

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'document_key', format('live_state:%s', v_domain),
    'title', format('Live State (%s)', v_domain),
    'type', 'official_doc',
    'artifact_kind', 'ops',
    'source_table', 'live_state_markdown',
    'source_id', v_domain,
    'source', 'live_state_snapshot',
    'tenant_id', 'c4_corporate_identity',
    'status', 'active',
    'is_current', true,
    'searchable', true,
    'authority_type', 'procedure',
    'authority_rank', 90,
    'effective_from', now(),
    'updated_at', now(),
    'triggered_by_table', p_event_table,
    'triggered_by_operation', p_event_operation,
    'content_hash', v_hash
  ));

  BEGIN
    SELECT p.id
      INTO v_document_id
      FROM public.publish_brain_document_version(
        p_content => v_content,
        p_metadata => v_metadata,
        p_embedding => NULL,
        p_replace_current => true
      ) AS p
      LIMIT 1;
  EXCEPTION
    WHEN undefined_function THEN
      v_document_id := NULL;
  END;

  INSERT INTO brain.live_state_documents (
    domain,
    content,
    content_hash,
    updated_at,
    last_event_table,
    last_event_operation,
    last_document_id,
    metadata
  )
  VALUES (
    v_domain,
    v_content,
    v_hash,
    now(),
    p_event_table,
    p_event_operation,
    v_document_id,
    v_metadata
  )
  ON CONFLICT (domain) DO UPDATE
  SET
    content = EXCLUDED.content,
    content_hash = EXCLUDED.content_hash,
    updated_at = EXCLUDED.updated_at,
    last_event_table = EXCLUDED.last_event_table,
    last_event_operation = EXCLUDED.last_event_operation,
    last_document_id = coalesce(EXCLUDED.last_document_id, brain.live_state_documents.last_document_id),
    metadata = EXCLUDED.metadata;

  SELECT last_document_id INTO v_document_id
  FROM brain.live_state_documents
  WHERE domain = v_domain;

  RETURN v_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_live_state_all(
  p_event_table text DEFAULT NULL,
  p_event_operation text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
DECLARE
  v_domain text;
  v_doc_id uuid;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOREACH v_domain IN ARRAY ARRAY['overview', 'comercial', 'crm', 'clientes', 'propostas', 'contratos', 'financeiro', 'projetos', 'tarefas', 'usuarios', 'acoes', 'prazos'] LOOP
    v_doc_id := public.refresh_live_state_document(
      p_domain => v_domain,
      p_event_table => p_event_table,
      p_event_operation => p_event_operation,
      p_force => p_force
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'domain', v_domain,
      'document_id', v_doc_id
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'refreshed_at', now(),
    'items', v_results
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_live_state_documents(
  p_domains text[] DEFAULT NULL,
  p_max_age_minutes int DEFAULT 240
)
RETURNS TABLE (
  domain text,
  content text,
  updated_at timestamptz,
  is_stale boolean,
  document_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, brain
AS $$
  SELECT
    d.domain,
    d.content,
    d.updated_at,
    (
      d.updated_at < now() - make_interval(mins => greatest(coalesce(p_max_age_minutes, 240), 1))
    ) AS is_stale,
    d.last_document_id AS document_id
  FROM brain.live_state_documents d
  WHERE (
    p_domains IS NULL
    OR cardinality(p_domains) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(p_domains) AS x(domain_name)
      WHERE lower(x.domain_name) = lower(d.domain)
    )
  )
  ORDER BY
    CASE lower(d.domain)
      WHEN 'overview' THEN 0
      WHEN 'comercial' THEN 1
      WHEN 'crm' THEN 2
      WHEN 'clientes' THEN 3
      WHEN 'propostas' THEN 4
      WHEN 'contratos' THEN 5
      WHEN 'financeiro' THEN 6
      WHEN 'projetos' THEN 7
      WHEN 'tarefas' THEN 8
      WHEN 'prazos' THEN 9
      WHEN 'usuarios' THEN 10
      WHEN 'acoes' THEN 11
      ELSE 12
    END,
    d.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION brain.handle_crm_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_lead_id uuid;
  v_stage_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'crm_leads' THEN
    v_lead_id := coalesce(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'crm_lead_activities' THEN
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);
  ELSIF TG_TABLE_NAME = 'crm_followups' THEN
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);
  ELSIF TG_TABLE_NAME = 'crm_lead_stage_history' THEN
    v_lead_id := coalesce(NEW.lead_id, OLD.lead_id);
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
  END IF;

  IF v_lead_id IS NOT NULL THEN
    INSERT INTO brain.sync_queue (source_table, source_id, operation)
    VALUES ('crm_leads', v_lead_id, TG_OP);
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_brain_sync_crm_leads ON public.crm_leads;
CREATE TRIGGER trg_brain_sync_crm_leads
AFTER INSERT OR UPDATE OR DELETE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DROP TRIGGER IF EXISTS trg_brain_sync_crm_lead_activities ON public.crm_lead_activities;
CREATE TRIGGER trg_brain_sync_crm_lead_activities
AFTER INSERT OR UPDATE OR DELETE ON public.crm_lead_activities
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DROP TRIGGER IF EXISTS trg_brain_sync_crm_followups ON public.crm_followups;
CREATE TRIGGER trg_brain_sync_crm_followups
AFTER INSERT OR UPDATE OR DELETE ON public.crm_followups
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DROP TRIGGER IF EXISTS trg_brain_sync_crm_lead_stage_history ON public.crm_lead_stage_history;
CREATE TRIGGER trg_brain_sync_crm_lead_stage_history
AFTER INSERT OR UPDATE OR DELETE ON public.crm_lead_stage_history
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DROP TRIGGER IF EXISTS trg_brain_sync_crm_pipeline_stages ON public.crm_pipeline_stages;
CREATE TRIGGER trg_brain_sync_crm_pipeline_stages
AFTER INSERT OR UPDATE OR DELETE ON public.crm_pipeline_stages
FOR EACH ROW EXECUTE FUNCTION brain.handle_crm_change();

DO $$
BEGIN
  IF to_regclass('public.crm_leads') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_crm_leads ON public.crm_leads';
    EXECUTE 'CREATE TRIGGER trg_live_state_crm_leads AFTER INSERT OR UPDATE OR DELETE ON public.crm_leads FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.crm_lead_activities') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_crm_lead_activities ON public.crm_lead_activities';
    EXECUTE 'CREATE TRIGGER trg_live_state_crm_lead_activities AFTER INSERT OR UPDATE OR DELETE ON public.crm_lead_activities FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.crm_followups') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_crm_followups ON public.crm_followups';
    EXECUTE 'CREATE TRIGGER trg_live_state_crm_followups AFTER INSERT OR UPDATE OR DELETE ON public.crm_followups FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.crm_lead_stage_history') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_crm_lead_stage_history ON public.crm_lead_stage_history';
    EXECUTE 'CREATE TRIGGER trg_live_state_crm_lead_stage_history AFTER INSERT OR UPDATE OR DELETE ON public.crm_lead_stage_history FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.crm_pipeline_stages') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_crm_pipeline_stages ON public.crm_pipeline_stages';
    EXECUTE 'CREATE TRIGGER trg_live_state_crm_pipeline_stages AFTER INSERT OR UPDATE OR DELETE ON public.crm_pipeline_stages FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_crm_live_state_markdown() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.live_state_domains_for_source(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_live_state_document(text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_live_state_all(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_live_state_documents(text[], int) TO authenticated, service_role;

SELECT public.refresh_live_state_document(
  p_domain => 'crm',
  p_event_table => 'crm_bootstrap',
  p_event_operation => 'seed',
  p_force => true
);

