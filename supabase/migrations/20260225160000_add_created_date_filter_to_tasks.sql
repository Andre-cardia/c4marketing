-- Add p_created_date filter to query_all_tasks so the brain can find tasks created on a specific date.

DROP FUNCTION IF EXISTS public.query_all_tasks(bigint, text, boolean, date, text);
CREATE OR REPLACE FUNCTION public.query_all_tasks(
  p_project_id   bigint  DEFAULT NULL,
  p_status       text    DEFAULT NULL,
  p_overdue      boolean DEFAULT NULL,
  p_reference_date date  DEFAULT NULL,
  p_reference_tz text    DEFAULT NULL,
  p_created_date date    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_status text;
  v_reference_date date;
BEGIN
  v_status := nullif(lower(trim(coalesce(p_status, ''))), '');

  -- Backward compatibility with legacy labels used by older router prompts.
  IF v_status = 'todo' THEN
    v_status := 'backlog';
  ELSIF v_status = 'review' THEN
    v_status := 'approval';
  END IF;

  v_reference_date := COALESCE(
    p_reference_date,
    CASE
      WHEN nullif(trim(coalesce(p_reference_tz, '')), '') IS NULL
        THEN CURRENT_DATE
      ELSE (now() AT TIME ZONE p_reference_tz)::date
    END
  );

  SELECT json_agg(t ORDER BY t.created_at DESC) INTO result
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
      pt.created_at,
      (pt.due_date IS NOT NULL AND pt.due_date::date < v_reference_date AND pt.status <> 'done') AS is_overdue
    FROM project_tasks pt
    JOIN acceptances a ON a.id = pt.project_id
    WHERE (p_project_id IS NULL OR pt.project_id = p_project_id)
      AND (v_status IS NULL OR pt.status = v_status)
      AND (
        COALESCE(p_overdue, false) = false
        OR (
          pt.due_date IS NOT NULL
          AND pt.due_date::date < v_reference_date
          AND pt.status <> 'done'
        )
      )
      AND (p_created_date IS NULL OR (pt.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_created_date)
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
GRANT EXECUTE ON FUNCTION public.query_all_tasks(bigint, text, boolean, date, text, date) TO authenticated, service_role;
