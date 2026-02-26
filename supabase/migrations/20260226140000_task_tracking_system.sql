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
