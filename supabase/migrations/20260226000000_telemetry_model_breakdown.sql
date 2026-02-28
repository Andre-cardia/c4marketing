-- ============================================================
-- Evolução Telemetria: Quebra por Modelo de IA
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
    v_usage_by_model  JSONB;
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

    -- NOVO: Uso por Modelo
    -- Extrai do campo params->'model_usage' o detalhamento acumulado
    SELECT coalesce(jsonb_agg(t ORDER BY t.cost DESC), '[]'::jsonb)
      INTO v_usage_by_model
      FROM (
          WITH expanded AS (
              SELECT 
                m.model_name,
                (m.data->>'input_tokens')::INT as input_tokens,
                (m.data->>'output_tokens')::INT as output_tokens,
                (m.data->>'cost')::NUMERIC as cost
              FROM brain.execution_logs el
              CROSS JOIN LATERAL (
                  SELECT key as model_name, value as data
                  FROM jsonb_each(el.params->'model_usage')
                  WHERE jsonb_typeof(el.params->'model_usage') = 'object'
              ) m
              WHERE el.created_at >= v_cutoff
          )
          SELECT 
            model_name,
            sum(input_tokens) as tokens_input,
            sum(output_tokens) as tokens_output,
            sum(input_tokens + output_tokens) as tokens_total,
            round(sum(cost)::NUMERIC, 4) as cost
          FROM expanded
          GROUP BY model_name
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
           LIMIT 30
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
        'tokens_by_agent',      coalesce(v_tokens_by_agent, '[]'::jsonb),
        'usage_by_model',       coalesce(v_usage_by_model, '[]'::jsonb)
    );
END; $$;
