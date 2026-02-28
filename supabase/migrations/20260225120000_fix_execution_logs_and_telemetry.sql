-- ============================================================
-- Fix: Adiciona colunas faltantes em brain.execution_logs
-- e cria as RPCs de telemetria (query_telemetry_summary,
-- query_autonomy_suggestions)
-- ============================================================

-- 1. Garantir schema
CREATE SCHEMA IF NOT EXISTS brain;
-- 2. Criar tabela se não existir (caso completo)
CREATE TABLE IF NOT EXISTS brain.execution_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id     TEXT,
    session_id     TEXT NOT NULL,
    user_id        UUID,
    agent_name     TEXT NOT NULL,
    action         TEXT NOT NULL,
    status         TEXT NOT NULL,
    params         JSONB DEFAULT '{}'::jsonb,
    result         JSONB DEFAULT '{}'::jsonb,
    latency_ms     INTEGER,
    cost_est       NUMERIC(10, 6),
    tokens_input   INTEGER DEFAULT 0,
    tokens_output  INTEGER DEFAULT 0,
    tokens_total   INTEGER DEFAULT 0,
    error_message  TEXT,
    created_at     TIMESTAMPTZ DEFAULT now()
);
-- 3. Adicionar colunas faltantes (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'latency_ms') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN latency_ms INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'cost_est') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN cost_est NUMERIC(10, 6);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'error_message') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN error_message TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'message_id') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN message_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'user_id') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN user_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'params') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN params JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'result') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN result JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'tokens_input') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN tokens_input INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'tokens_output') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN tokens_output INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'brain' AND table_name = 'execution_logs'
                   AND column_name = 'tokens_total') THEN
        ALTER TABLE brain.execution_logs ADD COLUMN tokens_total INTEGER DEFAULT 0;
    END IF;
END $$;
-- Backfill: preencher tokens de registros antigos que têm params.token_usage
UPDATE brain.execution_logs
SET
    tokens_input  = coalesce((params->'token_usage'->>'prompt_tokens')::INTEGER, 0),
    tokens_output = coalesce((params->'token_usage'->>'completion_tokens')::INTEGER, 0),
    tokens_total  = coalesce((params->'token_usage'->>'total_tokens')::INTEGER, 0)
WHERE tokens_total = 0
  AND params->'token_usage' IS NOT NULL;
-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_execution_logs_session_id  ON brain.execution_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_name  ON brain.execution_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at  ON brain.execution_logs(created_at);
-- 5. Grants de schema
-- Acesso direto à tabela: apenas service_role (backend)
-- Usuários autenticados acessam somente via RPCs com verificação de cargo
GRANT USAGE ON SCHEMA brain TO authenticated, service_role;
GRANT ALL   ON brain.execution_logs TO service_role;
-- ============================================================
-- 6. log_agent_execution (upsert seguro)
-- ============================================================
-- Remover todas as versões anteriores para evitar conflito de overload
DROP FUNCTION IF EXISTS public.log_agent_execution(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, INTEGER, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.log_agent_execution(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, INTEGER, NUMERIC, TEXT, TEXT, INTEGER, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.log_agent_execution(
    p_session_id    TEXT,
    p_agent_name    TEXT,
    p_action        TEXT,
    p_status        TEXT,
    p_params        JSONB    DEFAULT '{}'::jsonb,
    p_result        JSONB    DEFAULT '{}'::jsonb,
    p_latency_ms    INTEGER  DEFAULT 0,
    p_cost_est      NUMERIC  DEFAULT 0,
    p_error_message TEXT     DEFAULT NULL,
    p_message_id    TEXT     DEFAULT NULL,
    p_tokens_input  INTEGER  DEFAULT 0,
    p_tokens_output INTEGER  DEFAULT 0,
    p_tokens_total  INTEGER  DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
    INSERT INTO brain.execution_logs
        (session_id, agent_name, action, status, params, result,
         latency_ms, cost_est, error_message, message_id,
         tokens_input, tokens_output, tokens_total)
    VALUES
        (p_session_id, p_agent_name, p_action, p_status, p_params, p_result,
         p_latency_ms, p_cost_est, p_error_message, p_message_id,
         p_tokens_input, p_tokens_output, p_tokens_total)
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END; $$;
GRANT EXECUTE ON FUNCTION public.log_agent_execution TO authenticated, service_role;
-- ============================================================
-- 7. query_telemetry_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.query_telemetry_summary(
    p_days INT DEFAULT 7
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_cutoff          TIMESTAMPTZ;
    v_total           BIGINT;
    v_success         BIGINT;
    v_errors          BIGINT;
    v_avg_latency     NUMERIC;
    v_tokens_input    BIGINT;
    v_tokens_output   BIGINT;
    v_tokens_total    BIGINT;
    v_cost_total      NUMERIC;
    v_top_actions     JSONB;
    v_error_by_day    JSONB;
    v_top_projects    JSONB;
    v_tokens_by_agent JSONB;
    v_user_role       TEXT;
BEGIN
    -- Verificação de acesso: somente gestores
    SELECT role INTO v_user_role FROM public.app_users WHERE email = auth.jwt() ->> 'email';
    IF v_user_role IS DISTINCT FROM 'gestor' THEN
        RAISE EXCEPTION 'Acesso negado: apenas gestores podem acessar dados de telemetria.';
    END IF;

    v_cutoff := now() - (p_days || ' days')::INTERVAL;

    SELECT
        count(*),
        count(*) FILTER (WHERE el.status = 'success'),
        count(*) FILTER (WHERE el.status = 'error'),
        round(avg(el.latency_ms)::NUMERIC, 2),
        coalesce(sum(el.tokens_input), 0),
        coalesce(sum(el.tokens_output), 0),
        coalesce(sum(el.tokens_total), 0),
        coalesce(round(sum(el.cost_est)::NUMERIC, 4), 0)
      INTO v_total, v_success, v_errors, v_avg_latency,
           v_tokens_input, v_tokens_output, v_tokens_total, v_cost_total
      FROM brain.execution_logs el
     WHERE el.created_at >= v_cutoff;

    SELECT coalesce(jsonb_agg(t ORDER BY t.count DESC), '[]'::jsonb)
      INTO v_top_actions
      FROM (
          SELECT
              el.action,
              count(*) AS count,
              round(avg(el.latency_ms)::NUMERIC, 2) AS avg_latency_ms,
              count(*) FILTER (WHERE el.status = 'error') AS error_count,
              coalesce(sum(el.tokens_total), 0) AS tokens_total
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.action
           ORDER BY count DESC
           LIMIT 10
      ) t;

    -- Tokens por agente
    SELECT coalesce(jsonb_agg(t ORDER BY t.tokens_total DESC), '[]'::jsonb)
      INTO v_tokens_by_agent
      FROM (
          SELECT
              el.agent_name,
              coalesce(sum(el.tokens_input), 0)  AS tokens_input,
              coalesce(sum(el.tokens_output), 0) AS tokens_output,
              coalesce(sum(el.tokens_total), 0)  AS tokens_total,
              coalesce(round(sum(el.cost_est)::NUMERIC, 4), 0) AS cost_est,
              count(*) AS executions
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.agent_name
           ORDER BY tokens_total DESC
      ) t;

    SELECT coalesce(jsonb_agg(t ORDER BY t.date), '[]'::jsonb)
      INTO v_error_by_day
      FROM (
          SELECT
              el.created_at::DATE AS date,
              count(*) AS total,
              count(*) FILTER (WHERE el.status = 'error')   AS errors,
              count(*) FILTER (WHERE el.status = 'success') AS successes
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.created_at::DATE
           ORDER BY el.created_at::DATE
      ) t;

    SELECT coalesce(jsonb_agg(t ORDER BY t.count DESC), '[]'::jsonb)
      INTO v_top_projects
      FROM (
          SELECT
              coalesce(el.params->>'client_name', 'Sem projeto') AS client_name,
              count(*) AS count
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
             AND el.params->>'client_name' IS NOT NULL
           GROUP BY el.params->>'client_name'
           ORDER BY count DESC
           LIMIT 10
      ) t;

    RETURN jsonb_build_object(
        'period_days',          p_days,
        'cutoff_date',          v_cutoff::DATE,
        'total_executions',     coalesce(v_total, 0),
        'success_count',        coalesce(v_success, 0),
        'error_count',          coalesce(v_errors, 0),
        'success_rate',         CASE WHEN coalesce(v_total,0) > 0
                                     THEN round((v_success::NUMERIC / v_total) * 100, 1)
                                     ELSE 0 END,
        'avg_latency_ms',       coalesce(v_avg_latency, 0),
        'tokens_input',         coalesce(v_tokens_input, 0),
        'tokens_output',        coalesce(v_tokens_output, 0),
        'tokens_total',         coalesce(v_tokens_total, 0),
        'cost_total_usd',       coalesce(v_cost_total, 0),
        'top_actions',          coalesce(v_top_actions, '[]'::jsonb),
        'error_rate_by_day',    coalesce(v_error_by_day, '[]'::jsonb),
        'most_active_projects', coalesce(v_top_projects, '[]'::jsonb),
        'tokens_by_agent',      coalesce(v_tokens_by_agent, '[]'::jsonb)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.query_telemetry_summary TO authenticated, service_role;
-- ============================================================
-- 8. query_autonomy_suggestions
-- ============================================================
CREATE OR REPLACE FUNCTION public.query_autonomy_suggestions(
    p_project_id BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_suggestions JSONB := '[]'::jsonb;
    v_item        JSONB;
    v_rec         RECORD;
    v_user_role   TEXT;
BEGIN
    -- Verificação de acesso: somente gestores
    SELECT role INTO v_user_role FROM public.app_users WHERE email = auth.jwt() ->> 'email';
    IF v_user_role IS DISTINCT FROM 'gestor' THEN
        RAISE EXCEPTION 'Acesso negado: apenas gestores podem acessar sugestões de telemetria.';
    END IF;

    FOR v_rec IN
        SELECT pt.title, pt.due_date, a.company_name AS project_name, pt.project_id
          FROM project_tasks pt
          JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.due_date < CURRENT_DATE
           AND pt.status != 'done'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.due_date ASC LIMIT 5
    LOOP
        v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
            'type', 'overdue_task',
            'message', format('Tarefa "%s" está atrasada (venceu em %s).', v_rec.title, v_rec.due_date),
            'project_name', v_rec.project_name,
            'task_title', v_rec.title,
            'due_date', v_rec.due_date
        ));
    END LOOP;

    FOR v_rec IN
        SELECT pt.title, pt.created_at, a.company_name AS project_name, pt.project_id
          FROM project_tasks pt
          JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.status = 'backlog'
           AND pt.assignee IS NULL
           AND pt.created_at < now() - INTERVAL '7 days'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at ASC LIMIT 5
    LOOP
        v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
            'type', 'unassigned_backlog',
            'message', format('Tarefa "%s" está no backlog há mais de 7 dias sem responsável.', v_rec.title),
            'project_name', v_rec.project_name,
            'task_title', v_rec.title
        ));
    END LOOP;

    FOR v_rec IN
        SELECT a.id, a.company_name AS project_name,
               count(pt.id) AS total_tasks,
               count(pt.id) FILTER (WHERE pt.status = 'done') AS done_tasks
          FROM acceptances a
          JOIN project_tasks pt ON pt.project_id = a.id
         WHERE a.status = 'Ativo'
           AND (p_project_id IS NULL OR a.id = p_project_id)
         GROUP BY a.id, a.company_name
        HAVING count(pt.id) > 0
           AND count(pt.id) = count(pt.id) FILTER (WHERE pt.status = 'done')
         LIMIT 3
    LOOP
        v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
            'type', 'all_tasks_done',
            'message', format('Projeto "%s" tem todas as %s tarefas concluídas. Considere marcar como Inativo.',
                v_rec.project_name, v_rec.total_tasks),
            'project_name', v_rec.project_name,
            'task_title', null,
            'total_tasks', v_rec.total_tasks
        ));
    END LOOP;

    RETURN v_suggestions;
END; $$;
GRANT EXECUTE ON FUNCTION public.query_autonomy_suggestions TO authenticated, service_role;
