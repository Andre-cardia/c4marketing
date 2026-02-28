-- Align query_all_tasks with canonical task statuses and overdue filtering.
-- Canonical statuses: backlog, in_progress, approval, done, paused.
-- Backward compatibility:
-- - todo   -> backlog
-- - review -> approval

DROP FUNCTION IF EXISTS public.query_all_tasks(bigint, text);
CREATE OR REPLACE FUNCTION public.query_all_tasks(
  p_project_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_overdue boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_status text;
BEGIN
  v_status := nullif(lower(trim(coalesce(p_status, ''))), '');

  -- Backward compatibility with legacy labels used by older router prompts.
  IF v_status = 'todo' THEN
    v_status := 'backlog';
  ELSIF v_status = 'review' THEN
    v_status := 'approval';
  END IF;

  SELECT json_agg(t ORDER BY t.due_date NULLS LAST) INTO result
  FROM (
    SELECT
      pt.id::text,
      a.company_name AS client_name,
      pt.title,
      pt.description,
      pt.status,
      pt.priority,
      pt.assignee,
      pt.due_date,
      pt.created_at
    FROM project_tasks pt
    JOIN acceptances a ON a.id = pt.project_id
    WHERE (p_project_id IS NULL OR pt.project_id = p_project_id)
      AND (v_status IS NULL OR pt.status = v_status)
      AND (
        COALESCE(p_overdue, false) = false
        OR (
          pt.due_date IS NOT NULL
          AND pt.due_date < now()
          AND pt.status <> 'done'
        )
      )
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
GRANT EXECUTE ON FUNCTION public.query_all_tasks(bigint, text, boolean) TO authenticated, service_role;
