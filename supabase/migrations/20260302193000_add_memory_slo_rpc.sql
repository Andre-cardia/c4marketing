-- ============================================================
-- Memory SLO RPC (recall consistency + canary critical failures)
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_memory_slo(
  p_days int DEFAULT 1,
  p_target_recall_hit_rate numeric DEFAULT 95,
  p_max_critical_canary_failures int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_cutoff timestamptz;
  v_jwt_role text;
  v_user_role text;

  v_recall_total bigint := 0;
  v_recall_hits bigint := 0;
  v_recall_misses bigint := 0;
  v_recall_hit_rate numeric := NULL;

  v_canary_runs bigint := 0;
  v_canary_critical_failures bigint := 0;
  v_last_canary_status text := 'no_data';
  v_last_canary_at timestamptz := NULL;

  v_recall_below_slo boolean := false;
  v_canary_alert boolean := false;
  v_overall text := 'ok';
BEGIN
  v_jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');

  -- Security rule:
  -- - service_role can query directly (automation/ops).
  -- - authenticated users must be gestor.
  IF coalesce(v_jwt_role, '') <> 'service_role' THEN
    SELECT role
      INTO v_user_role
      FROM public.app_users
     WHERE email = auth.jwt() ->> 'email'
     LIMIT 1;

    IF v_user_role IS DISTINCT FROM 'gestor' THEN
      RAISE EXCEPTION 'Access denied: only gestores can access memory SLO.';
    END IF;
  END IF;

  v_cutoff := now() - (greatest(1, p_days) || ' days')::interval;

  -- Recall events are inferred from canonical assistant recall answers saved in cognitive memory.
  WITH recall_events AS (
    SELECT
      d.created_at,
      CASE
        WHEN d.content ILIKE '%A ultima informacao que voce pediu para salvar foi:%'
          OR d.content ILIKE '%A última informação que você pediu para salvar foi:%'
          THEN 'hit'
        WHEN d.content ILIKE '%Nao encontrei uma memoria explicita salva recentemente para recuperar agora.%'
          OR d.content ILIKE '%Nao encontrei uma memoria explicita salva recentemente para recuperar agora.%'
          OR d.content ILIKE '%Não encontrei uma memória explícita salva recentemente para recuperar agora.%'
          THEN 'miss'
        ELSE NULL
      END AS recall_result
    FROM brain.documents d
    WHERE d.created_at >= v_cutoff
      AND d.metadata->>'source' = 'cognitive_live_memory'
      AND d.metadata->>'role' = 'assistant'
      AND (
        d.content ILIKE '%A ultima informacao que voce pediu para salvar foi:%'
        OR d.content ILIKE '%A última informação que você pediu para salvar foi:%'
        OR d.content ILIKE '%Nao encontrei uma memoria explicita salva recentemente para recuperar agora.%'
        OR d.content ILIKE '%Não encontrei uma memória explícita salva recentemente para recuperar agora.%'
      )
  )
  SELECT
    count(*) FILTER (WHERE recall_result IN ('hit', 'miss')),
    count(*) FILTER (WHERE recall_result = 'hit'),
    count(*) FILTER (WHERE recall_result = 'miss')
  INTO v_recall_total, v_recall_hits, v_recall_misses
  FROM recall_events;

  IF v_recall_total > 0 THEN
    v_recall_hit_rate := round((v_recall_hits::numeric / v_recall_total::numeric) * 100, 2);
  END IF;

  -- Canary runs are captured in brain.execution_logs by scripts/check_brain_canary.js
  -- when SUPABASE_SERVICE_ROLE_KEY is configured.
  SELECT
    count(*),
    count(*) FILTER (
      WHERE el.status <> 'success'
         OR coalesce((el.params->>'critical_failed')::int, 0) > 0
    )
  INTO v_canary_runs, v_canary_critical_failures
  FROM brain.execution_logs el
  WHERE el.created_at >= v_cutoff
    AND el.agent_name = 'Canary_BrainMemory'
    AND el.action = 'memory_canary';

  SELECT el.status, el.created_at
    INTO v_last_canary_status, v_last_canary_at
  FROM brain.execution_logs el
  WHERE el.agent_name = 'Canary_BrainMemory'
    AND el.action = 'memory_canary'
  ORDER BY el.created_at DESC
  LIMIT 1;

  v_recall_below_slo := (
    v_recall_total > 0
    AND v_recall_hit_rate IS NOT NULL
    AND v_recall_hit_rate < p_target_recall_hit_rate
  );

  v_canary_alert := v_canary_critical_failures > p_max_critical_canary_failures;

  IF v_recall_total = 0 AND v_canary_runs = 0 THEN
    v_overall := 'no_data';
  ELSIF v_recall_below_slo OR v_canary_alert THEN
    v_overall := 'alert';
  ELSE
    v_overall := 'ok';
  END IF;

  RETURN jsonb_build_object(
    'period_days', greatest(1, p_days),
    'cutoff_date', v_cutoff::date,
    'targets', jsonb_build_object(
      'recall_hit_rate_min', p_target_recall_hit_rate,
      'critical_canary_failures_max', p_max_critical_canary_failures
    ),
    'recall', jsonb_build_object(
      'total_requests', coalesce(v_recall_total, 0),
      'hits', coalesce(v_recall_hits, 0),
      'misses', coalesce(v_recall_misses, 0),
      'hit_rate', v_recall_hit_rate
    ),
    'canary', jsonb_build_object(
      'runs', coalesce(v_canary_runs, 0),
      'critical_failures', coalesce(v_canary_critical_failures, 0),
      'last_status', coalesce(v_last_canary_status, 'no_data'),
      'last_run_at', v_last_canary_at
    ),
    'alerts', jsonb_build_object(
      'recall_below_slo', v_recall_below_slo,
      'canary_critical_failures', v_canary_alert,
      'overall', v_overall
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_memory_slo(int, numeric, int) TO authenticated, service_role;

