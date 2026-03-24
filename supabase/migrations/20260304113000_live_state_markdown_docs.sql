-- ============================================================
-- Live State Markdown Docs
-- Documento vivo por domínio (overview/comercial/clientes/propostas/
-- contratos/financeiro/projetos/tarefas/usuarios/acoes/prazos), atualizado
-- por eventos de tabelas-chave
-- e consumido pelo chat-brain em modo doc-first.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain.live_state_documents (
  domain text PRIMARY KEY,
  content text NOT NULL,
  content_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_event_table text,
  last_event_operation text,
  last_document_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_live_state_documents_updated_at
  ON brain.live_state_documents(updated_at DESC);

CREATE OR REPLACE FUNCTION public.live_state_domains_for_source(p_source_table text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_source text := lower(coalesce(trim(p_source_table), ''));
BEGIN
  IF v_source = 'proposals' THEN
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

CREATE OR REPLACE FUNCTION public.build_live_state_markdown(p_domain text DEFAULT 'overview')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_domain text := lower(coalesce(nullif(trim(p_domain), ''), 'overview'));
  v_reference_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_now_pt text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS');

  v_projects_raw jsonb := coalesce(public.query_all_projects(p_service_type => NULL, p_status_filter => NULL)::jsonb, '[]'::jsonb);
  v_clients_raw jsonb := coalesce(public.query_all_clients(p_status => NULL)::jsonb, '[]'::jsonb);
  v_proposals_raw jsonb := coalesce(public.query_all_proposals(p_status_filter => 'all')::jsonb, '[]'::jsonb);
  v_users_raw jsonb := coalesce(public.query_all_users()::jsonb, '[]'::jsonb);
  v_tasks_raw jsonb := coalesce(
    public.query_all_tasks(
      p_project_id => NULL,
      p_status => NULL,
      p_overdue => NULL,
      p_reference_date => v_reference_date,
      p_reference_tz => 'America/Sao_Paulo',
      p_created_date => NULL
    )::jsonb,
    '[]'::jsonb
  );
  v_access_raw jsonb := coalesce(public.query_access_summary()::jsonb, '[]'::jsonb);
  v_financial_raw jsonb := coalesce(
    public.query_financial_summary(
      p_reference_date => v_reference_date,
      p_status => 'Ativo',
      p_company_name => NULL,
      p_reference_tz => 'America/Sao_Paulo'
    )::jsonb,
    '{}'::jsonb
  );

  v_projects jsonb;
  v_clients jsonb;
  v_proposals jsonb;
  v_users jsonb;
  v_tasks jsonb;
  v_access jsonb;
  v_financial jsonb;
  v_financial_contracts jsonb;

  v_projects_total int := 0;
  v_projects_active int := 0;
  v_clients_total int := 0;
  v_clients_active int := 0;
  v_proposals_total int := 0;
  v_proposals_open int := 0;
  v_proposals_accepted int := 0;
  v_users_total int := 0;
  v_users_gestao int := 0;
  v_users_operacional int := 0;
  v_users_comercial int := 0;
  v_tasks_total int := 0;
  v_tasks_open int := 0;
  v_tasks_overdue int := 0;
  v_access_unique_users int := 0;

  v_actions_24h int := 0;
  v_actions_success_24h int := 0;
  v_actions_error_24h int := 0;

  v_mrr numeric := 0;
  v_arr numeric := 0;
  v_contracts_total int := 0;
  v_contracts_active int := 0;
  v_contracts_inactive int := 0;
  v_fin_active_contracts int := 0;
  v_fin_without_fee int := 0;

  v_clients_lines text;
  v_proposals_lines text;
  v_projects_lines text;
  v_tasks_deadline_lines text;
  v_users_lines text;
  v_access_lines text;
  v_actions_lines text;
  v_financial_lines text;

  v_markdown text;
BEGIN
  IF v_domain NOT IN ('overview', 'comercial', 'clientes', 'propostas', 'contratos', 'financeiro', 'projetos', 'tarefas', 'usuarios', 'acoes', 'prazos') THEN
    v_domain := 'overview';
  END IF;

  v_projects := CASE WHEN jsonb_typeof(v_projects_raw) = 'array' THEN v_projects_raw ELSE '[]'::jsonb END;
  v_clients := CASE WHEN jsonb_typeof(v_clients_raw) = 'array' THEN v_clients_raw ELSE '[]'::jsonb END;
  v_proposals := CASE WHEN jsonb_typeof(v_proposals_raw) = 'array' THEN v_proposals_raw ELSE '[]'::jsonb END;
  v_users := CASE WHEN jsonb_typeof(v_users_raw) = 'array' THEN v_users_raw ELSE '[]'::jsonb END;
  v_tasks := CASE WHEN jsonb_typeof(v_tasks_raw) = 'array' THEN v_tasks_raw ELSE '[]'::jsonb END;
  v_access := CASE WHEN jsonb_typeof(v_access_raw) = 'array' THEN v_access_raw ELSE '[]'::jsonb END;
  v_financial := CASE WHEN jsonb_typeof(v_financial_raw) = 'object' THEN v_financial_raw ELSE '{}'::jsonb END;
  v_financial_contracts := CASE
    WHEN jsonb_typeof(v_financial->'active_contracts') = 'array' THEN v_financial->'active_contracts'
    ELSE '[]'::jsonb
  END;

  SELECT count(*) INTO v_projects_total FROM jsonb_array_elements(v_projects) p;
  SELECT count(*) INTO v_projects_active
  FROM jsonb_array_elements(v_projects) p
  WHERE lower(coalesce(p->>'client_status', '')) IN ('ativo', 'onboarding', 'em andamento');

  SELECT count(*) INTO v_clients_total FROM jsonb_array_elements(v_clients) c;
  SELECT count(*) INTO v_clients_active
  FROM jsonb_array_elements(v_clients) c
  WHERE lower(coalesce(c->>'status', '')) IN ('ativo', 'onboarding', 'em andamento');

  SELECT count(*) INTO v_proposals_total FROM jsonb_array_elements(v_proposals) p;
  SELECT
    count(*) FILTER (WHERE lower(coalesce(p->>'was_accepted', 'false')) IN ('true', 't', '1', 'yes', 'on')),
    count(*) FILTER (WHERE lower(coalesce(p->>'was_accepted', 'false')) NOT IN ('true', 't', '1', 'yes', 'on'))
  INTO v_proposals_accepted, v_proposals_open
  FROM jsonb_array_elements(v_proposals) p;

  SELECT count(*) INTO v_users_total FROM jsonb_array_elements(v_users) u;
  SELECT
    count(*) FILTER (WHERE lower(coalesce(u->>'role', '')) IN ('admin', 'gestor')),
    count(*) FILTER (WHERE lower(coalesce(u->>'role', '')) = 'operacional'),
    count(*) FILTER (WHERE lower(coalesce(u->>'role', '')) = 'comercial')
  INTO v_users_gestao, v_users_operacional, v_users_comercial
  FROM jsonb_array_elements(v_users) u;

  SELECT count(*) INTO v_tasks_total FROM jsonb_array_elements(v_tasks) t;
  SELECT count(*) INTO v_tasks_open
  FROM jsonb_array_elements(v_tasks) t
  WHERE lower(coalesce(t->>'status', '')) NOT IN ('done', 'paused', 'cancelado', 'cancelled', 'canceled', 'finalizado');

  SELECT count(*) INTO v_tasks_overdue
  FROM jsonb_array_elements(v_tasks) t
  WHERE (
    lower(coalesce(t->>'is_overdue', 'false')) IN ('true', 't', '1', 'yes', 'on')
    OR (
      public.try_parse_timestamptz(t->>'due_date')::date < v_reference_date
      AND lower(coalesce(t->>'status', '')) <> 'done'
    )
  );

  SELECT count(*) INTO v_access_unique_users FROM jsonb_array_elements(v_access) a;

  v_mrr := coalesce(public.parse_financial_numeric(v_financial #>> '{totals,mrr}'), 0);
  v_arr := coalesce(public.parse_financial_numeric(v_financial #>> '{totals,arr}'), 0);
  v_fin_active_contracts := coalesce((v_financial #>> '{totals,active_contracts}')::int, 0);
  v_fin_without_fee := coalesce((v_financial #>> '{totals,active_contracts_without_monthly_fee}')::int, 0);
  v_contracts_total := v_clients_total;
  v_contracts_active := v_fin_active_contracts;
  v_contracts_inactive := greatest(v_contracts_total - v_contracts_active, 0);

  IF to_regclass('brain.execution_logs') IS NOT NULL THEN
    SELECT
      count(*),
      count(*) FILTER (WHERE status = 'success'),
      count(*) FILTER (WHERE status = 'error')
    INTO v_actions_24h, v_actions_success_24h, v_actions_error_24h
    FROM brain.execution_logs
    WHERE created_at >= now() - interval '24 hours';

    SELECT string_agg(
      format(
        '- %s | agent=%s | action=%s | status=%s',
        to_char((el.created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD HH24:MI'),
        coalesce(el.agent_name, 'n/a'),
        coalesce(el.action, 'n/a'),
        coalesce(el.status, 'n/a')
      ),
      E'\n'
    )
    INTO v_actions_lines
    FROM (
      SELECT created_at, agent_name, action, status
      FROM brain.execution_logs
      ORDER BY created_at DESC
      LIMIT 12
    ) el;
  END IF;

  SELECT string_agg(
    format(
      '- %s | status=%s | responsável=%s | aceite=%s | vencimento=%s | pendências=%s | serviços=%s',
      coalesce(c->>'company_name', 'Sem cliente'),
      coalesce(c->>'status', 'N/A'),
      coalesce(c->>'responsible_name', 'N/A'),
      coalesce(c->>'accepted_at', 'n/a'),
      coalesce(c->>'expiration_date', 'n/a'),
      coalesce(c->>'pending_tasks', '0'),
      coalesce(
        nullif(
          trim(both '+' FROM concat(
            CASE WHEN lower(coalesce(c->>'has_traffic', 'false')) IN ('true', 't', '1', 'yes', 'on') THEN 'trafego+' ELSE '' END,
            CASE WHEN lower(coalesce(c->>'has_website', 'false')) IN ('true', 't', '1', 'yes', 'on') THEN 'website+' ELSE '' END,
            CASE WHEN lower(coalesce(c->>'has_landing_page', 'false')) IN ('true', 't', '1', 'yes', 'on') THEN 'landing_page+' ELSE '' END
          )),
          ''
        ),
        'nenhum'
      )
    ),
    E'\n'
  )
  INTO v_clients_lines
  FROM (
    SELECT c
    FROM jsonb_array_elements(v_clients) c
    ORDER BY public.try_parse_timestamptz(c->>'accepted_at') DESC NULLS LAST
    LIMIT 12
  ) ranked_clients;

  SELECT string_agg(
    format(
      '- %s | status=%s | responsável=%s | criada_em=%s | mensalidade=%s | setup=%s',
      coalesce(p->>'company_name', 'Sem cliente'),
      CASE
        WHEN lower(coalesce(p->>'was_accepted', 'false')) IN ('true', 't', '1', 'yes', 'on')
          THEN coalesce(p->>'acceptance_status', 'aceita')
        ELSE 'aberta'
      END,
      coalesce(p->>'responsible_name', 'N/A'),
      coalesce(p->>'created_at', 'n/a'),
      coalesce(p->>'monthly_fee', '0'),
      coalesce(p->>'setup_fee', '0')
    ),
    E'\n'
  )
  INTO v_proposals_lines
  FROM (
    SELECT p
    FROM jsonb_array_elements(v_proposals) p
    ORDER BY public.try_parse_timestamptz(p->>'created_at') DESC NULLS LAST
    LIMIT 12
  ) ranked_proposals;

  SELECT string_agg(
    format(
      '- %s | serviço=%s | status_cliente=%s | survey=%s | setup=%s',
      coalesce(p->>'company_name', 'Sem cliente'),
      coalesce(p->>'service_type', 'N/A'),
      coalesce(p->>'client_status', 'N/A'),
      coalesce(p->>'survey_status', 'N/A'),
      coalesce(p->>'account_setup_status', 'N/A')
    ),
    E'\n'
  )
  INTO v_projects_lines
  FROM (
    SELECT p
    FROM jsonb_array_elements(v_projects) p
    ORDER BY public.try_parse_timestamptz(p->>'created_at') DESC NULLS LAST
    LIMIT 12
  ) ranked_projects;

  SELECT string_agg(
    format(
      '- %s | cliente=%s | status=%s | prazo=%s | responsável=%s',
      coalesce(t->>'title', 'Sem título'),
      coalesce(t->>'client_name', 'Sem cliente'),
      coalesce(t->>'status', 'N/A'),
      coalesce(t->>'due_date', 'sem prazo'),
      coalesce(t->>'assignee', 'não definido')
    ),
    E'\n'
  )
  INTO v_tasks_deadline_lines
  FROM (
    SELECT t
    FROM jsonb_array_elements(v_tasks) t
    ORDER BY public.try_parse_timestamptz(t->>'due_date') ASC NULLS LAST
    LIMIT 12
  ) ranked_tasks;

  SELECT string_agg(
    format(
      '- %s | role=%s | último_acesso=%s',
      coalesce(u->>'full_name', u->>'name', 'Sem nome'),
      coalesce(u->>'role', 'N/A'),
      coalesce(u->>'last_access', 'sem registro')
    ),
    E'\n'
  )
  INTO v_users_lines
  FROM (
    SELECT u
    FROM jsonb_array_elements(v_users) u
    ORDER BY public.try_parse_timestamptz(u->>'last_access') DESC NULLS LAST
    LIMIT 12
  ) ranked_users;

  SELECT string_agg(
    format(
      '- %s | total_acessos=%s | último=%s',
      coalesce(a->>'user_email', 'sem email'),
      coalesce(a->>'total_accesses', '0'),
      coalesce(a->>'last_access', 'sem registro')
    ),
    E'\n'
  )
  INTO v_access_lines
  FROM (
    SELECT a
    FROM jsonb_array_elements(v_access) a
    ORDER BY public.try_parse_timestamptz(a->>'last_access') DESC NULLS LAST
    LIMIT 12
  ) ranked_access;

  SELECT string_agg(
    format(
      '- %s | mensalidade=%s | início_faturamento=%s',
      coalesce(f->>'company_name', 'Sem cliente'),
      coalesce(f->>'monthly_fee', '0'),
      coalesce(f->>'effective_billing_start_date', coalesce(f->>'billing_start_date', 'n/a'))
    ),
    E'\n'
  )
  INTO v_financial_lines
  FROM (
    SELECT f
    FROM jsonb_array_elements(v_financial_contracts) f
    ORDER BY coalesce(f->>'company_name', '') ASC
    LIMIT 12
  ) ranked_financial;

  IF v_domain = 'overview' THEN
    v_markdown := format(
      E'# LIVE STATE - OVERVIEW\n\nAtualizado em (America/Sao_Paulo): %s\nData de referência financeira: %s\n\n## KPIs Executivos\n- Propostas: total=%s | abertas=%s | aceitas=%s\n- Clientes: total=%s | ativos=%s\n- Projetos: total=%s | ativos=%s\n- Tarefas: total=%s | abertas=%s | atrasadas=%s\n- Usuários: total=%s | gestão=%s | operacional=%s | comercial=%s\n- Acessos únicos monitorados: %s\n- Financeiro: contratos_ativos=%s | MRR=%s | ARR=%s | contratos_sem_mensalidade=%s\n- Ações no sistema (24h): total=%s | sucesso=%s | erro=%s\n\n## Projetos Recentes\n%s\n\n## Prazos e Tarefas\n%s\n\n## Últimas Ações do Sistema\n%s\n\n## Observações de Qualidade\n- Este documento é atualizado automaticamente por eventos de sistema e serve como contexto primário para o chat.\n- Quando houver dúvida de precisão pontual, o agente deve complementar com consulta SQL direta.',
      v_now_pt,
      v_reference_date::text,
      v_proposals_total,
      v_proposals_open,
      v_proposals_accepted,
      v_clients_total,
      v_clients_active,
      v_projects_total,
      v_projects_active,
      v_tasks_total,
      v_tasks_open,
      v_tasks_overdue,
      v_users_total,
      v_users_gestao,
      v_users_operacional,
      v_users_comercial,
      v_access_unique_users,
      v_fin_active_contracts,
      coalesce(v_mrr::text, '0'),
      coalesce(v_arr::text, '0'),
      v_fin_without_fee,
      v_actions_24h,
      v_actions_success_24h,
      v_actions_error_24h,
      coalesce(v_projects_lines, '- Sem projetos recentes.'),
      coalesce(v_tasks_deadline_lines, '- Sem tarefas com prazo registrado.'),
      coalesce(v_actions_lines, '- Sem ações recentes registradas.')
    );

  ELSIF v_domain = 'comercial' THEN
    v_markdown := format(
      E'# LIVE STATE - COMERCIAL\n\nAtualizado em (America/Sao_Paulo): %s\n\n## Pipeline Comercial\n- Propostas totais: %s\n- Propostas em aberto: %s\n- Propostas aceitas: %s\n- Clientes/contratos totais: %s\n- Clientes ativos: %s\n- Contratos ativos (financeiro): %s\n\n## Contexto de Propostas\n%s\n\n## Contexto de Clientes\n%s\n\n## Notas\n- Use este bloco para visão comercial macro.\n- Para confirmação pontual de contrato/proposta específica, complementar com SQL.',
      v_now_pt,
      v_proposals_total,
      v_proposals_open,
      v_proposals_accepted,
      v_clients_total,
      v_clients_active,
      v_fin_active_contracts,
      coalesce(v_proposals_lines, '- Sem propostas recentes.'),
      coalesce(v_clients_lines, '- Sem clientes/contratos recentes.')
    );

  ELSIF v_domain = 'clientes' THEN
    v_markdown := format(
      E'# LIVE STATE - CLIENTES\n\nAtualizado em (America/Sao_Paulo): %s\n\n## KPIs de Clientes\n- Total de clientes (base contratual): %s\n- Clientes ativos: %s\n- Clientes não ativos: %s\n- Contratos ativos (financeiro): %s\n\n## Clientes Recentes (aceites)\n%s\n\n## Propostas Relacionadas (amostra)\n%s\n\n## Notas\n- Cliente é derivado da base de contratos (acceptances).\n- Para auditoria detalhada por cliente, complementar com SQL.',
      v_now_pt,
      v_clients_total,
      v_clients_active,
      greatest(v_clients_total - v_clients_active, 0),
      v_fin_active_contracts,
      coalesce(v_clients_lines, '- Sem clientes na base atual.'),
      coalesce(v_proposals_lines, '- Sem propostas recentes associadas.')
    );

  ELSIF v_domain = 'propostas' THEN
    v_markdown := format(
      E'# LIVE STATE - PROPOSTAS\n\nAtualizado em (America/Sao_Paulo): %s\n\n## KPIs de Propostas\n- Total de propostas: %s\n- Em aberto: %s\n- Aceitas: %s\n\n## Propostas Recentes\n%s\n\n## Conversão para Contratos\n- Clientes/contratos totais na base: %s\n- Contratos ativos (financeiro): %s\n\n## Notas\n- Propostas aceitas são inferidas por vínculo com acceptances.\n- Para detalhes de uma proposta específica, complementar com SQL.',
      v_now_pt,
      v_proposals_total,
      v_proposals_open,
      v_proposals_accepted,
      coalesce(v_proposals_lines, '- Sem propostas recentes.'),
      v_clients_total,
      v_fin_active_contracts
    );

  ELSIF v_domain = 'contratos' THEN
    v_markdown := format(
      E'# LIVE STATE - CONTRATOS\n\nAtualizado em (America/Sao_Paulo): %s\nData de referência financeira: %s\n\n## KPIs Contratuais\n- Contratos totais (acceptances): %s\n- Contratos ativos (financeiro): %s\n- Contratos não ativos (estimado): %s\n- Contratos ativos sem mensalidade: %s\n- MRR: %s\n- ARR: %s\n\n## Base Contratual (aceites recentes)\n%s\n\n## Contratos Ativos com Mensalidade (amostra)\n%s\n\n## Notas\n- A base contratual oficial vem de acceptances.\n- Se houver contratos sem mensalidade, MRR/ARR podem estar subestimados.',
      v_now_pt,
      v_reference_date::text,
      v_contracts_total,
      v_contracts_active,
      v_contracts_inactive,
      v_fin_without_fee,
      coalesce(v_mrr::text, '0'),
      coalesce(v_arr::text, '0'),
      coalesce(v_clients_lines, '- Sem contratos recentes na base.'),
      coalesce(v_financial_lines, '- Sem contratos ativos listados para o filtro atual.')
    );

  ELSIF v_domain = 'financeiro' THEN
    v_markdown := format(
      E'# LIVE STATE - FINANCEIRO\n\nAtualizado em (America/Sao_Paulo): %s\nData de referência: %s\n\n## KPIs Financeiros\n- Contratos ativos: %s\n- MRR: %s\n- ARR: %s\n- Contratos ativos sem mensalidade cadastrada: %s\n\n## Contratos Ativos (amostra)\n%s\n\n## Avisos\n- Se houver contratos sem mensalidade, MRR/ARR podem estar subestimados.\n- Para auditoria de um cliente específico, complementar com query_financial_summary filtrado por empresa.',
      v_now_pt,
      v_reference_date::text,
      v_fin_active_contracts,
      coalesce(v_mrr::text, '0'),
      coalesce(v_arr::text, '0'),
      v_fin_without_fee,
      coalesce(v_financial_lines, '- Sem contratos ativos listados para o filtro atual.')
    );

  ELSIF v_domain = 'projetos' THEN
    v_markdown := format(
      E'# LIVE STATE - PROJETOS\n\nAtualizado em (America/Sao_Paulo): %s\n\n## Status Geral\n- Projetos totais: %s\n- Projetos ativos: %s\n- Tarefas abertas: %s\n- Tarefas atrasadas: %s\n\n## Projetos (amostra recente)\n%s\n\n## Próximos Prazos\n%s',
      v_now_pt,
      v_projects_total,
      v_projects_active,
      v_tasks_open,
      v_tasks_overdue,
      coalesce(v_projects_lines, '- Sem projetos recentes.'),
      coalesce(v_tasks_deadline_lines, '- Sem prazos próximos cadastrados.')
    );

  ELSIF v_domain = 'tarefas' THEN
    v_markdown := format(
      E'# LIVE STATE - TAREFAS\n\nAtualizado em (America/Sao_Paulo): %s\n\n## Visão de Tarefas\n- Total: %s\n- Em aberto: %s\n- Atrasadas: %s\n\n## Lista Prioritária\n%s\n\n## Observação\n- Esta lista é dinâmica e derivada do estado operacional atual.',
      v_now_pt,
      v_tasks_total,
      v_tasks_open,
      v_tasks_overdue,
      coalesce(v_tasks_deadline_lines, '- Sem tarefas prioritárias no momento.')
    );

  ELSIF v_domain = 'usuarios' THEN
    v_markdown := format(
      E'# LIVE STATE - USUÁRIOS\n\nAtualizado em (America/Sao_Paulo): %s\n\n## Estrutura de Equipe\n- Total usuários: %s\n- Gestão: %s\n- Operacional: %s\n- Comercial: %s\n\n## Usuários (último acesso)\n%s\n\n## Acessos Recentes\n%s',
      v_now_pt,
      v_users_total,
      v_users_gestao,
      v_users_operacional,
      v_users_comercial,
      coalesce(v_users_lines, '- Sem usuários cadastrados.'),
      coalesce(v_access_lines, '- Sem registros de acesso.')
    );

  ELSIF v_domain = 'acoes' THEN
    v_markdown := format(
      E'# LIVE STATE - AÇÕES NO SISTEMA\n\nAtualizado em (America/Sao_Paulo): %s\n\n## Execução (24h)\n- Total: %s\n- Sucesso: %s\n- Erro: %s\n\n## Últimas Ações\n%s',
      v_now_pt,
      v_actions_24h,
      v_actions_success_24h,
      v_actions_error_24h,
      coalesce(v_actions_lines, '- Sem ações recentes registradas.')
    );

  ELSE
    v_markdown := format(
      E'# LIVE STATE - PRAZOS\n\nAtualizado em (America/Sao_Paulo): %s\n\n## Risco de Prazo\n- Tarefas em aberto: %s\n- Tarefas atrasadas: %s\n\n## Agenda de Entregas\n%s',
      v_now_pt,
      v_tasks_open,
      v_tasks_overdue,
      coalesce(v_tasks_deadline_lines, '- Sem prazos cadastrados.')
    );
  END IF;

  RETURN v_markdown;
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
  IF v_domain NOT IN ('overview', 'comercial', 'clientes', 'propostas', 'contratos', 'financeiro', 'projetos', 'tarefas', 'usuarios', 'acoes', 'prazos') THEN
    v_domain := 'overview';
  END IF;

  SELECT content_hash, updated_at, last_document_id
    INTO v_prev_hash, v_prev_updated_at, v_prev_document_id
  FROM brain.live_state_documents
  WHERE domain = v_domain;

  -- Debounce para evitar tempestade de atualizações em operações em lote.
  IF NOT p_force AND v_prev_updated_at IS NOT NULL AND v_prev_updated_at > now() - interval '5 seconds' THEN
    RETURN v_prev_document_id;
  END IF;

  v_content := public.build_live_state_markdown(v_domain);
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
  FOREACH v_domain IN ARRAY ARRAY['overview', 'comercial', 'clientes', 'propostas', 'contratos', 'financeiro', 'projetos', 'tarefas', 'usuarios', 'acoes', 'prazos'] LOOP
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
      WHEN 'clientes' THEN 2
      WHEN 'propostas' THEN 3
      WHEN 'contratos' THEN 4
      WHEN 'financeiro' THEN 5
      WHEN 'projetos' THEN 6
      WHEN 'tarefas' THEN 7
      WHEN 'prazos' THEN 8
      WHEN 'usuarios' THEN 9
      WHEN 'acoes' THEN 10
      ELSE 11
    END,
    d.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.handle_live_state_event_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
DECLARE
  v_domains text[];
  v_domain text;
BEGIN
  v_domains := public.live_state_domains_for_source(TG_TABLE_NAME);

  IF v_domains IS NULL OR array_length(v_domains, 1) IS NULL THEN
    v_domains := ARRAY['overview'];
  END IF;

  IF NOT ('overview' = ANY(v_domains)) THEN
    v_domains := array_prepend('overview', v_domains);
  END IF;

  FOREACH v_domain IN ARRAY v_domains LOOP
    PERFORM public.refresh_live_state_document(
      p_domain => v_domain,
      p_event_table => TG_TABLE_NAME,
      p_event_operation => TG_OP,
      p_force => false
    );
  END LOOP;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.proposals') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_proposals ON public.proposals';
    EXECUTE 'CREATE TRIGGER trg_live_state_proposals AFTER INSERT OR UPDATE OR DELETE ON public.proposals FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.acceptances') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_acceptances ON public.acceptances';
    EXECUTE 'CREATE TRIGGER trg_live_state_acceptances AFTER INSERT OR UPDATE OR DELETE ON public.acceptances FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.contracts') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_contracts ON public.contracts';
    EXECUTE 'CREATE TRIGGER trg_live_state_contracts AFTER INSERT OR UPDATE OR DELETE ON public.contracts FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.addenda') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_addenda ON public.addenda';
    EXECUTE 'CREATE TRIGGER trg_live_state_addenda AFTER INSERT OR UPDATE OR DELETE ON public.addenda FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.project_tasks') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_project_tasks ON public.project_tasks';
    EXECUTE 'CREATE TRIGGER trg_live_state_project_tasks AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.app_users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_app_users ON public.app_users';
    EXECUTE 'CREATE TRIGGER trg_live_state_app_users AFTER INSERT OR UPDATE OR DELETE ON public.app_users FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.access_logs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_access_logs ON public.access_logs';
    EXECUTE 'CREATE TRIGGER trg_live_state_access_logs AFTER INSERT OR UPDATE OR DELETE ON public.access_logs FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.traffic_projects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_traffic_projects ON public.traffic_projects';
    EXECUTE 'CREATE TRIGGER trg_live_state_traffic_projects AFTER INSERT OR UPDATE OR DELETE ON public.traffic_projects FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.website_projects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_website_projects ON public.website_projects';
    EXECUTE 'CREATE TRIGGER trg_live_state_website_projects AFTER INSERT OR UPDATE OR DELETE ON public.website_projects FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;

  IF to_regclass('public.landing_page_projects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_live_state_landing_page_projects ON public.landing_page_projects';
    EXECUTE 'CREATE TRIGGER trg_live_state_landing_page_projects AFTER INSERT OR UPDATE OR DELETE ON public.landing_page_projects FOR EACH STATEMENT EXECUTE FUNCTION public.handle_live_state_event_trigger()';
  END IF;
END;
$$;

GRANT SELECT ON TABLE brain.live_state_documents TO service_role;
GRANT EXECUTE ON FUNCTION public.live_state_domains_for_source(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_live_state_markdown(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_live_state_document(text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_live_state_all(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_live_state_documents(text[], int) TO authenticated, service_role;

-- Seed inicial para garantir disponibilidade imediata dos documentos vivos.
SELECT public.refresh_live_state_all(
  p_event_table => 'bootstrap',
  p_event_operation => 'seed',
  p_force => true
);
