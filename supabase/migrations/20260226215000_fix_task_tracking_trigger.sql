DROP TRIGGER IF EXISTS trg_project_tasks_history ON public.project_tasks;
DROP TRIGGER IF EXISTS trg_project_tasks_timestamps ON public.project_tasks;
DROP FUNCTION IF EXISTS public.trg_task_history_fn();
DROP FUNCTION IF EXISTS public.trg_task_timestamps_fn();

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS overdue_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz;

CREATE OR REPLACE FUNCTION public.trg_task_timestamps_fn()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := now();
    END IF;
    IF OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_project_tasks_timestamps
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_timestamps_fn();

CREATE OR REPLACE FUNCTION public.trg_task_history_fn()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
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
  END IF;

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
  END IF;

  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_project_tasks_history
  AFTER INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_history_fn();
