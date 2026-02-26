-- ─── Migration: Task Monthly Snapshots + Telemetry RPC ────────────────────────
-- Creates task_monthly_snapshots table for permanent monthly archive
-- Creates create_task_monthly_snapshot() called by pg_cron on 1st of each month
-- Creates query_task_telemetry(p_days) RPC consumed by BrainTelemetry dashboard
-- Provides breakdowns: summary KPIs, monthly trend, by assignee, by client
-- Date: 2026-02-26
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── 1. Monthly snapshot table ────────────────────────────────────────────────
-- Each row = state of one task captured at end of a given month
-- was_overdue is a generated column: true if overdue_flagged_at is NOT NULL

CREATE TABLE IF NOT EXISTS public.task_monthly_snapshots (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month     date        NOT NULL,   -- e.g. 2026-02-01 = Feb 2026
  task_id            uuid        REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  project_id         bigint      REFERENCES public.acceptances(id) ON DELETE CASCADE,
  company_name       text,
  title              text,
  status             text,
  assignee           text,
  created_by         text,
  due_date           timestamptz,
  created_at         timestamptz,
  completed_at       timestamptz,
  overdue_flagged_at timestamptz,
  was_overdue        boolean     GENERATED ALWAYS AS (overdue_flagged_at IS NOT NULL) STORED,
  snapshotted_at     timestamptz DEFAULT now()
);

COMMENT ON TABLE public.task_monthly_snapshots IS
  'Permanent monthly archive of task state. Records overdue history even after task completion.';

-- Unique: one snapshot per task per month (upsert-safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_snapshots_month_task
  ON public.task_monthly_snapshots(snapshot_month, task_id);

CREATE INDEX IF NOT EXISTS idx_task_snapshots_month
  ON public.task_monthly_snapshots(snapshot_month);

CREATE INDEX IF NOT EXISTS idx_task_snapshots_assignee
  ON public.task_monthly_snapshots(assignee);

CREATE INDEX IF NOT EXISTS idx_task_snapshots_company
  ON public.task_monthly_snapshots(company_name);

ALTER TABLE public.task_monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor full access to task snapshots"
  ON public.task_monthly_snapshots
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('admin', 'gestor')
    )
  );

-- ─── 2. Monthly snapshot function ─────────────────────────────────────────────
-- Called by pg_cron on 1st of each month to snapshot previous month
-- Can also be called manually: SELECT create_task_monthly_snapshot('2026-02-01')

CREATE OR REPLACE FUNCTION public.create_task_monthly_snapshot(
  p_month date DEFAULT date_trunc('month', now() - interval '1 month')::date
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.task_monthly_snapshots(
    snapshot_month, task_id, project_id, company_name,
    title, status, assignee, created_by,
    due_date, created_at, completed_at, overdue_flagged_at,
    snapshotted_at
  )
  SELECT
    p_month,
    pt.id,
    pt.project_id,
    a.company_name,
    pt.title,
    pt.status,
    pt.assignee,
    pt.created_by,
    pt.due_date,
    pt.created_at,
    pt.completed_at,
    pt.overdue_flagged_at,
    now()
  FROM public.project_tasks pt
  LEFT JOIN public.acceptances a ON pt.project_id = a.id
  ON CONFLICT (snapshot_month, task_id) DO UPDATE SET
    company_name       = EXCLUDED.company_name,
    title              = EXCLUDED.title,
    status             = EXCLUDED.status,
    assignee           = EXCLUDED.assignee,
    completed_at       = EXCLUDED.completed_at,
    overdue_flagged_at = EXCLUDED.overdue_flagged_at,
    snapshotted_at     = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_monthly_snapshot(date) TO service_role;

-- ─── 3. Schedule monthly snapshot via pg_cron ─────────────────────────────────
-- Runs at 03:00 UTC on the 1st of each month (00:00 Brasília)
-- Snapshots the previous month

SELECT cron.schedule(
  'task-monthly-snapshot',
  '0 3 1 * *',
  $$SELECT public.create_task_monthly_snapshot(
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo' - interval '1 month')::date
  )$$
);

-- ─── 4. Seed: create snapshot for current month right now ─────────────────────
-- So the dashboard shows data immediately after migration

SELECT public.create_task_monthly_snapshot(
  date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
);

-- ─── 5. RPC: query_task_telemetry ─────────────────────────────────────────────
-- Returns structured JSONB consumed by BrainTelemetry.tsx
-- Breakdown: summary KPIs, monthly trend, by assignee, by client, snapshot history

CREATE OR REPLACE FUNCTION public.query_task_telemetry(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cutoff date := v_today - p_days;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(

    -- ── Summary KPIs ──────────────────────────────────────────────────────────
    'summary', (
      SELECT jsonb_build_object(
        'total',                count(*),
        'open',                 count(*) FILTER (WHERE status NOT IN ('done', 'paused')),
        'done',                 count(*) FILTER (WHERE status = 'done'),
        'paused',               count(*) FILTER (WHERE status = 'paused'),
        'overdue_now',          count(*) FILTER (
                                  WHERE due_date IS NOT NULL
                                    AND due_date::date < v_today
                                    AND status != 'done'
                                ),
        'ever_overdue',         count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL),
        'overdue_completed',    count(*) FILTER (
                                  WHERE overdue_flagged_at IS NOT NULL
                                    AND status = 'done'
                                ),
        'overdue_still_open',   count(*) FILTER (
                                  WHERE overdue_flagged_at IS NOT NULL
                                    AND status != 'done'
                                )
      )
      FROM public.project_tasks
    ),

    -- ── Monthly trend: tasks created, completed, and flagged overdue ──────────
    'monthly_trend', (
      SELECT COALESCE(jsonb_agg(row ORDER BY month_date), '[]'::jsonb)
      FROM (
        SELECT
          to_char(
            date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'),
            'MM/YY'
          ) AS month,
          date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo') AS month_date,
          count(*)                                               AS criadas,
          count(*) FILTER (WHERE status = 'done')               AS concluidas,
          count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL) AS atrasadas
        FROM public.project_tasks
        WHERE created_at >= (v_cutoff - interval '2 months')::timestamptz
        GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
      ) row
    ),

    -- ── By assignee: top 10 users by total tasks ──────────────────────────────
    'by_assignee', (
      SELECT COALESCE(jsonb_agg(row ORDER BY total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(trim(assignee), ''), 'Sem responsável') AS assignee,
          count(*)                                                  AS total_tasks,
          count(*) FILTER (WHERE status = 'done')                  AS concluidas,
          count(*) FILTER (WHERE status NOT IN ('done', 'paused'))  AS abertas,
          count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL)    AS ja_atrasadas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < v_today
              AND status != 'done'
          )                                                          AS atrasadas_agora
        FROM public.project_tasks
        GROUP BY COALESCE(NULLIF(trim(assignee), ''), 'Sem responsável')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) row
    ),

    -- ── By client: top 10 clients by total tasks ──────────────────────────────
    'by_client', (
      SELECT COALESCE(jsonb_agg(row ORDER BY total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(a.company_name, 'Sem cliente')                   AS client,
          count(pt.*)                                                 AS total_tasks,
          count(pt.*) FILTER (WHERE pt.status = 'done')              AS concluidas,
          count(pt.*) FILTER (WHERE pt.status NOT IN ('done','paused')) AS abertas,
          count(pt.*) FILTER (WHERE pt.overdue_flagged_at IS NOT NULL) AS ja_atrasadas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < v_today
              AND pt.status != 'done'
          )                                                           AS atrasadas_agora
        FROM public.project_tasks pt
        LEFT JOIN public.acceptances a ON pt.project_id = a.id
        GROUP BY COALESCE(a.company_name, 'Sem cliente')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) row
    ),

    -- ── Monthly snapshot history (from permanent archive) ─────────────────────
    'snapshot_history', (
      SELECT COALESCE(jsonb_agg(row ORDER BY snapshot_month), '[]'::jsonb)
      FROM (
        SELECT
          to_char(snapshot_month, 'MM/YY')                      AS month,
          count(*)                                               AS total,
          count(*) FILTER (WHERE status = 'done')               AS concluidas,
          count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
          count(*) FILTER (WHERE was_overdue = true)            AS atrasadas
        FROM public.task_monthly_snapshots
        WHERE snapshot_month >= (v_cutoff - interval '1 month')::date
        GROUP BY snapshot_month
        ORDER BY snapshot_month
      ) row
    ),

    -- ── Status distribution ───────────────────────────────────────────────────
    'status_distribution', (
      SELECT COALESCE(jsonb_agg(row ORDER BY count DESC), '[]'::jsonb)
      FROM (
        SELECT status, count(*) AS count
        FROM public.project_tasks
        GROUP BY status
      ) row
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_task_telemetry(int) TO authenticated, service_role;
