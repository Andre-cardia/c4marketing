-- ─── Migration: Task Tracking System ──────────────────────────────────────────
-- Adds overdue_flagged_at + completed_at to project_tasks
-- Creates BEFORE trigger that auto-populates task_history on every state change
-- Registers overdue events permanently, even after task is completed
-- Schedules daily pg_cron job to flag overdue tasks at 06:00 Brasília
-- Backfills existing done tasks and currently overdue tasks
-- Date: 2026-02-26
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── 1. New columns in project_tasks ─────────────────────────────────────────

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS overdue_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz;

COMMENT ON COLUMN public.project_tasks.overdue_flagged_at IS
  'Timestamp when task first became overdue. Never cleared — even if task is later completed.';
COMMENT ON COLUMN public.project_tasks.completed_at IS
  'Timestamp when task status changed to done. Cleared if task is reopened.';

-- ─── 2. Trigger function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_task_history_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- ── INSERT: record task creation ────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(
      id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details
    ) VALUES (
      gen_random_uuid(), NEW.id, NEW.project_id,
      'created', NULL, NEW.status,
      NEW.created_by, now(),
      jsonb_build_object(
        'title',    NEW.title,
        'assignee', NEW.assignee,
        'due_date', NEW.due_date,
        'priority', NEW.priority
      )
    );

    -- If created directly as done, stamp completed_at
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  -- ── UPDATE: record status transitions ──────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_history(
      id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details
    ) VALUES (
      gen_random_uuid(), NEW.id, NEW.project_id,
      'status_change', OLD.status, NEW.status,
      NEW.assignee, now(),
      jsonb_build_object(
        'title',       NEW.title,
        'assignee',    NEW.assignee,
        'due_date',    NEW.due_date,
        'was_overdue', (NEW.overdue_flagged_at IS NOT NULL)
      )
    );

    -- Task moved to done → stamp completed_at
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
      NEW.completed_at := now();
    END IF;

    -- Task reopened from done → clear completed_at
    IF OLD.status = 'done' AND NEW.status != 'done' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3. Attach trigger ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_project_tasks_history ON public.project_tasks;

CREATE TRIGGER trg_project_tasks_history
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_history_fn();

-- ─── 4. Daily overdue-flagging function ──────────────────────────────────────
-- Called by pg_cron every day at 06:00 Brasília (09:00 UTC)
-- Sets overdue_flagged_at ONCE and NEVER clears it (permanent record)

CREATE OR REPLACE FUNCTION public.flag_overdue_tasks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today   date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_flagged integer := 0;
BEGIN
  -- Flag tasks that are now overdue and haven't been flagged yet
  UPDATE public.project_tasks
  SET overdue_flagged_at = now()
  WHERE due_date IS NOT NULL
    AND due_date::date < v_today
    AND status != 'done'
    AND overdue_flagged_at IS NULL;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  -- Record overdue event in task_history for newly flagged tasks
  IF v_flagged > 0 THEN
    INSERT INTO public.task_history(
      id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details
    )
    SELECT
      gen_random_uuid(), pt.id, pt.project_id,
      'overdue_flagged', pt.status, pt.status,
      'system', now(),
      jsonb_build_object(
        'title',       pt.title,
        'due_date',    pt.due_date,
        'assignee',    pt.assignee,
        'days_overdue', (v_today - pt.due_date::date)
      )
    FROM public.project_tasks pt
    WHERE pt.due_date IS NOT NULL
      AND pt.due_date::date < v_today
      AND pt.status != 'done'
      AND pt.overdue_flagged_at::date = now()::date; -- only newly flagged today
  END IF;

  RETURN v_flagged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_overdue_tasks() TO service_role;

-- ─── 5. Schedule daily pg_cron job ───────────────────────────────────────────

SELECT cron.schedule(
  'flag-overdue-tasks-daily',
  '0 9 * * *',  -- 09:00 UTC = 06:00 Brasília
  $$SELECT public.flag_overdue_tasks()$$
);

-- ─── 6. Backfill: completed_at for existing done tasks ───────────────────────
-- Best approximation: use created_at (no updated_at column exists)

UPDATE public.project_tasks
SET completed_at = created_at
WHERE status = 'done'
  AND completed_at IS NULL;

-- ─── 7. Backfill: overdue_flagged_at for currently overdue tasks ──────────────

UPDATE public.project_tasks
SET overdue_flagged_at = now()
WHERE due_date IS NOT NULL
  AND due_date::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND status != 'done'
  AND overdue_flagged_at IS NULL;

-- ─── 8. Performance indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_tasks_overdue_flagged
  ON public.project_tasks(overdue_flagged_at)
  WHERE overdue_flagged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_completed_at
  ON public.project_tasks(completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_history_changed_at
  ON public.task_history(changed_at);

CREATE INDEX IF NOT EXISTS idx_task_history_action
  ON public.task_history(action);
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
