-- ─── Migration: Resilient query_task_telemetry RPC ────────────────────────────
-- Replaces the previous version with one that works even if migration
-- 20260226140000 (overdue_flagged_at / completed_at columns) hasn't been applied.
-- Uses information_schema check + EXECUTE to avoid compile-time column errors.
-- Date: 2026-02-26
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.query_task_telemetry(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today            date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cutoff           date    := v_today - p_days;
  v_has_overdue_col  boolean := false;
  v_has_completed_col boolean := false;
  v_summary          jsonb;
  v_monthly_trend    jsonb;
  v_by_assignee      jsonb;
  v_by_client        jsonb;
  v_snapshot_history jsonb   := '[]'::jsonb;
  v_status_dist      jsonb;
BEGIN

  -- ── 1. Detect which columns are available ────────────────────────────────────
  SELECT
    bool_or(column_name = 'overdue_flagged_at'),
    bool_or(column_name = 'completed_at')
  INTO v_has_overdue_col, v_has_completed_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'project_tasks'
    AND column_name  IN ('overdue_flagged_at', 'completed_at');

  -- ── 2. Summary KPIs ──────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT jsonb_build_object(
        'total',               count(*),
        'open',                count(*) FILTER (WHERE status NOT IN ('done','paused')),
        'done',                count(*) FILTER (WHERE status = 'done'),
        'paused',              count(*) FILTER (WHERE status = 'paused'),
        'overdue_now',         count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done'),
        'ever_overdue',        count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL),
        'overdue_completed',   count(*) FILTER (
                                 WHERE overdue_flagged_at IS NOT NULL
                                   AND status = 'done'),
        'overdue_still_open',  count(*) FILTER (
                                 WHERE overdue_flagged_at IS NOT NULL
                                   AND status != 'done')
      )
      FROM public.project_tasks
    $q$, v_today) INTO v_summary;
  ELSE
    -- Fallback: compute overdue on-the-fly from due_date
    EXECUTE format($q$
      SELECT jsonb_build_object(
        'total',               count(*),
        'open',                count(*) FILTER (WHERE status NOT IN ('done','paused')),
        'done',                count(*) FILTER (WHERE status = 'done'),
        'paused',              count(*) FILTER (WHERE status = 'paused'),
        'overdue_now',         count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done'),
        'ever_overdue',        count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done'),
        'overdue_completed',   0,
        'overdue_still_open',  count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done')
      )
      FROM public.project_tasks
    $q$, v_today, v_today, v_today) INTO v_summary;
  END IF;

  -- ── 3. Monthly trend ─────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.month_date), '[]'::jsonb)
      FROM (
        SELECT
          to_char(date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'), 'MM/YY') AS month,
          date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')                    AS month_date,
          count(*)                                                AS criadas,
          count(*) FILTER (WHERE status = 'done')                AS concluidas,
          count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL)  AS atrasadas
        FROM public.project_tasks
        WHERE created_at >= %L
        GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
      ) r
    $q$, (v_cutoff - interval '2 months')::timestamptz) INTO v_monthly_trend;
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.month_date), '[]'::jsonb)
      FROM (
        SELECT
          to_char(date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'), 'MM/YY') AS month,
          date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')                    AS month_date,
          count(*)                                               AS criadas,
          count(*) FILTER (WHERE status = 'done')               AS concluidas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS atrasadas
        FROM public.project_tasks
        WHERE created_at >= %L
        GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
      ) r
    $q$, v_today, (v_cutoff - interval '2 months')::timestamptz) INTO v_monthly_trend;
  END IF;

  -- ── 4. By assignee ───────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(trim(assignee),''), 'Sem responsável') AS assignee,
          count(*)                                                AS total_tasks,
          count(*) FILTER (WHERE status = 'done')                AS concluidas,
          count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
          count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL)  AS ja_atrasadas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS atrasadas_agora
        FROM public.project_tasks
        GROUP BY COALESCE(NULLIF(trim(assignee),''), 'Sem responsável')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today) INTO v_by_assignee;
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(trim(assignee),''), 'Sem responsável') AS assignee,
          count(*)                                                AS total_tasks,
          count(*) FILTER (WHERE status = 'done')                AS concluidas,
          count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS ja_atrasadas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS atrasadas_agora
        FROM public.project_tasks
        GROUP BY COALESCE(NULLIF(trim(assignee),''), 'Sem responsável')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today, v_today) INTO v_by_assignee;
  END IF;

  -- ── 5. By client ─────────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(a.company_name, 'Sem cliente')                  AS client,
          count(pt.*)                                               AS total_tasks,
          count(pt.*) FILTER (WHERE pt.status = 'done')            AS concluidas,
          count(pt.*) FILTER (WHERE pt.status NOT IN ('done','paused')) AS abertas,
          count(pt.*) FILTER (WHERE pt.overdue_flagged_at IS NOT NULL)  AS ja_atrasadas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < %L
              AND pt.status != 'done')                             AS atrasadas_agora
        FROM public.project_tasks pt
        LEFT JOIN public.acceptances a ON pt.project_id = a.id
        GROUP BY COALESCE(a.company_name, 'Sem cliente')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today) INTO v_by_client;
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(a.company_name, 'Sem cliente')                  AS client,
          count(pt.*)                                               AS total_tasks,
          count(pt.*) FILTER (WHERE pt.status = 'done')            AS concluidas,
          count(pt.*) FILTER (WHERE pt.status NOT IN ('done','paused')) AS abertas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < %L
              AND pt.status != 'done')                             AS ja_atrasadas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < %L
              AND pt.status != 'done')                             AS atrasadas_agora
        FROM public.project_tasks pt
        LEFT JOIN public.acceptances a ON pt.project_id = a.id
        GROUP BY COALESCE(a.company_name, 'Sem cliente')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today, v_today) INTO v_by_client;
  END IF;

  -- ── 6. Snapshot history (only if table exists) ───────────────────────────────

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'task_monthly_snapshots'
  ) THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r.snapshot_month), '[]'::jsonb)
    INTO v_snapshot_history
    FROM (
      SELECT
        to_char(snapshot_month, 'MM/YY')                       AS month,
        snapshot_month,
        count(*)                                               AS total,
        count(*) FILTER (WHERE status = 'done')                AS concluidas,
        count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
        count(*) FILTER (WHERE was_overdue = true)             AS atrasadas
      FROM public.task_monthly_snapshots
      WHERE snapshot_month >= (v_cutoff - interval '1 month')::date
      GROUP BY snapshot_month
      ORDER BY snapshot_month
    ) r;
  END IF;

  -- ── 7. Status distribution ───────────────────────────────────────────────────

  SELECT COALESCE(jsonb_agg(r ORDER BY r.count DESC), '[]'::jsonb)
  INTO v_status_dist
  FROM (
    SELECT status, count(*) AS count
    FROM public.project_tasks
    GROUP BY status
  ) r;

  -- ── 8. Return ────────────────────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'summary',            v_summary,
    'monthly_trend',      COALESCE(v_monthly_trend,    '[]'::jsonb),
    'by_assignee',        COALESCE(v_by_assignee,      '[]'::jsonb),
    'by_client',          COALESCE(v_by_client,        '[]'::jsonb),
    'snapshot_history',   v_snapshot_history,
    'status_distribution', COALESCE(v_status_dist,    '[]'::jsonb),
    'has_overdue_tracking', v_has_overdue_col
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.query_task_telemetry(int) TO authenticated, service_role;
