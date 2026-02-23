-- ============================================================
-- v9.0 Telemetry RPC + Autonomy Suggestions
-- ============================================================

-- ============================================================
-- 1. query_telemetry_summary  (dashboard de telemetria)
-- ============================================================
CREATE OR REPLACE FUNCTION public.query_telemetry_summary(
    p_days INT DEFAULT 7
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_cutoff       TIMESTAMPTZ;
    v_total        BIGINT;
    v_success      BIGINT;
    v_errors       BIGINT;
    v_avg_latency  NUMERIC;
    v_top_actions  JSONB;
    v_error_by_day JSONB;
    v_top_projects JSONB;
BEGIN
    v_cutoff := now() - (p_days || ' days')::INTERVAL;

    -- Totais gerais
    SELECT
        count(*),
        count(*) FILTER (WHERE el.status = 'success'),
        count(*) FILTER (WHERE el.status = 'error'),
        round(avg(el.latency_ms)::NUMERIC, 2)
      INTO v_total, v_success, v_errors, v_avg_latency
      FROM brain.execution_logs el
     WHERE el.created_at >= v_cutoff;

    -- Top actions por contagem e latência média
    SELECT coalesce(jsonb_agg(t ORDER BY t.count DESC), '[]'::jsonb)
      INTO v_top_actions
      FROM (
          SELECT
              el.action,
              count(*) AS count,
              round(avg(el.latency_ms)::NUMERIC, 2) AS avg_latency_ms,
              count(*) FILTER (WHERE el.status = 'error') AS error_count
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.action
           ORDER BY count DESC
           LIMIT 10
      ) t;

    -- Taxa de erro por dia
    SELECT coalesce(jsonb_agg(t ORDER BY t.date), '[]'::jsonb)
      INTO v_error_by_day
      FROM (
          SELECT
              el.created_at::DATE AS date,
              count(*) AS total,
              count(*) FILTER (WHERE el.status = 'error') AS errors,
              count(*) FILTER (WHERE el.status = 'success') AS successes
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.created_at::DATE
           ORDER BY el.created_at::DATE
      ) t;

    -- Projetos mais ativos (por client_name nos params)
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
        'period_days',       p_days,
        'cutoff_date',       v_cutoff::DATE,
        'total_executions',  coalesce(v_total, 0),
        'success_count',     coalesce(v_success, 0),
        'error_count',       coalesce(v_errors, 0),
        'success_rate',      CASE WHEN coalesce(v_total,0) > 0
                                  THEN round((v_success::NUMERIC / v_total) * 100, 1)
                                  ELSE 0 END,
        'avg_latency_ms',    coalesce(v_avg_latency, 0),
        'top_actions',       coalesce(v_top_actions, '[]'::jsonb),
        'error_rate_by_day', coalesce(v_error_by_day, '[]'::jsonb),
        'most_active_projects', coalesce(v_top_projects, '[]'::jsonb)
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.query_telemetry_summary TO authenticated, service_role;


-- ============================================================
-- 2. query_autonomy_suggestions  (sugestões proativas do agente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.query_autonomy_suggestions(
    p_project_id BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_suggestions JSONB := '[]'::jsonb;
    v_item        JSONB;
    v_rec         RECORD;
BEGIN
    -- 1. Tarefas atrasadas (due_date < hoje, status != done)
    FOR v_rec IN
        SELECT
            pt.title      AS task_title,
            pt.due_date,
            a.company_name AS project_name,
            pt.project_id
          FROM project_tasks pt
          JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.due_date < CURRENT_DATE
           AND pt.status != 'done'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.due_date ASC
         LIMIT 5
    LOOP
        v_item := jsonb_build_object(
            'type', 'overdue_task',
            'message', format('Tarefa "%s" está atrasada (venceu em %s).', v_rec.task_title, v_rec.due_date),
            'project_name', v_rec.project_name,
            'task_title', v_rec.task_title,
            'due_date', v_rec.due_date
        );
        v_suggestions := v_suggestions || jsonb_build_array(v_item);
    END LOOP;

    -- 2. Tarefas em backlog há mais de 7 dias sem responsável
    FOR v_rec IN
        SELECT
            pt.title      AS task_title,
            pt.created_at,
            a.company_name AS project_name,
            pt.project_id
          FROM project_tasks pt
          JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.status = 'backlog'
           AND pt.assignee IS NULL
           AND pt.created_at < now() - INTERVAL '7 days'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at ASC
         LIMIT 5
    LOOP
        v_item := jsonb_build_object(
            'type', 'unassigned_backlog',
            'message', format('Tarefa "%s" está no backlog há mais de 7 dias sem responsável.', v_rec.task_title),
            'project_name', v_rec.project_name,
            'task_title', v_rec.task_title
        );
        v_suggestions := v_suggestions || jsonb_build_array(v_item);
    END LOOP;

    -- 3. Projetos com todas as tarefas concluídas (sugerir marcar como Inativo)
    FOR v_rec IN
        SELECT
            a.id          AS project_id,
            a.company_name AS project_name,
            count(pt.id)  AS total_tasks,
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
        v_item := jsonb_build_object(
            'type', 'all_tasks_done',
            'message', format('Projeto "%s" tem todas as %s tarefas concluídas. Considere marcar como Inativo.',
                v_rec.project_name, v_rec.total_tasks),
            'project_name', v_rec.project_name,
            'task_title', null,
            'total_tasks', v_rec.total_tasks
        );
        v_suggestions := v_suggestions || jsonb_build_array(v_item);
    END LOOP;

    RETURN v_suggestions;
END; $$;

GRANT EXECUTE ON FUNCTION public.query_autonomy_suggestions TO authenticated, service_role;
