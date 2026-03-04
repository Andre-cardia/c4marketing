-- ============================================================
-- Add RPC for daily memory stability streak (canary + long horizon)
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_memory_stability_daily(
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_days int := greatest(1, p_days);
  v_today_utc date := (now() AT TIME ZONE 'utc')::date;
  v_cutoff_utc date := v_today_utc - (v_days - 1);
  v_jwt_role text;
  v_user_role text;
  v_daily jsonb := '[]'::jsonb;
BEGIN
  v_jwt_role := coalesce(auth.role(), nullif(current_setting('request.jwt.claim.role', true), ''));

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
      RAISE EXCEPTION 'Access denied: only gestores can access memory stability daily.';
    END IF;
  END IF;

  WITH day_series AS (
    SELECT generate_series(v_cutoff_utc, v_today_utc, interval '1 day')::date AS day_utc
  ),
  canary_daily AS (
    SELECT
      (el.created_at AT TIME ZONE 'utc')::date AS day_utc,
      (array_agg(el.status ORDER BY el.created_at DESC))[1] AS status
    FROM brain.execution_logs el
    WHERE el.agent_name = 'Canary_BrainMemory'
      AND el.action = 'memory_canary'
      AND (el.created_at AT TIME ZONE 'utc')::date >= v_cutoff_utc
    GROUP BY 1
  ),
  long_horizon_daily AS (
    SELECT
      (el.created_at AT TIME ZONE 'utc')::date AS day_utc,
      (array_agg(el.status ORDER BY el.created_at DESC))[1] AS status
    FROM brain.execution_logs el
    WHERE el.agent_name = 'Canary_BrainMemory'
      AND el.action = 'memory_long_horizon'
      AND (el.created_at AT TIME ZONE 'utc')::date >= v_cutoff_utc
    GROUP BY 1
  ),
  daily AS (
    SELECT
      ds.day_utc,
      coalesce(cd.status, 'no_data') AS canary_status,
      coalesce(ld.status, 'no_data') AS long_horizon_status,
      (coalesce(cd.status, 'no_data') = 'success' AND coalesce(ld.status, 'no_data') = 'success') AS stable
    FROM day_series ds
    LEFT JOIN canary_daily cd
      ON cd.day_utc = ds.day_utc
    LEFT JOIN long_horizon_daily ld
      ON ld.day_utc = ds.day_utc
    ORDER BY ds.day_utc DESC
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'day', to_char(day_utc, 'YYYY-MM-DD'),
             'canary', canary_status,
             'long_horizon', long_horizon_status,
             'stable', stable
           )
         )
    INTO v_daily
    FROM daily;

  RETURN jsonb_build_object(
    'period_days', v_days,
    'daily', coalesce(v_daily, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_memory_stability_daily(int) TO authenticated, service_role;

