-- ============================================================
-- SEGURANÇA ALTA: Adiciona verificação de role nas RPCs query_all_*
-- Impede que usuários "cliente" ou "operacional" listem dados
-- globais de todos os clientes/projetos/propostas/usuários.
-- Apenas roles admin e gestor têm acesso a estas funções.
-- ============================================================

-- 1. query_all_projects — restrito a admin/gestor
CREATE OR REPLACE FUNCTION public.query_all_projects(
  p_service_type text DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin e gestor podem listar todos os projetos.';
  END IF;

  SELECT json_agg(proj ORDER BY proj.company_name) INTO result
  FROM (
    SELECT
      tp.id::text,
      'Gestão de Tráfego' AS service_type,
      a.company_name,
      tp.survey_status,
      tp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id) AS total_campaigns,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id AND tc.status = 'active') AS active_campaigns,
      tp.created_at
    FROM traffic_projects tp
    JOIN acceptances a ON a.id = tp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'traffic')

    UNION ALL

    SELECT
      wp.id::text,
      'Criação de Site' AS service_type,
      a.company_name,
      wp.survey_status,
      wp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id) AS total_campaigns,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id AND w.status != 'delivered') AS active_campaigns,
      wp.created_at
    FROM website_projects wp
    JOIN acceptances a ON a.id = wp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'website')

    UNION ALL

    SELECT
      lp.id::text,
      'Landing Page' AS service_type,
      a.company_name,
      lp.survey_status,
      lp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id) AS total_campaigns,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id AND l.status != 'delivered') AS active_campaigns,
      lp.created_at
    FROM landing_page_projects lp
    JOIN acceptances a ON a.id = lp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'landing_page')
  ) proj
  WHERE (p_status_filter IS NULL OR proj.client_status = p_status_filter);

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 2. query_all_clients — restrito a admin/gestor
CREATE OR REPLACE FUNCTION public.query_all_clients(
  p_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin e gestor podem listar todos os clientes.';
  END IF;

  SELECT json_agg(c ORDER BY c.company_name) INTO result
  FROM (
    SELECT
      a.id,
      a.company_name,
      a.name AS responsible_name,
      a.email,
      a.status,
      a.timestamp AS accepted_at,
      a.expiration_date,
      (SELECT count(*) FROM traffic_projects tp WHERE tp.acceptance_id = a.id) > 0 AS has_traffic,
      (SELECT count(*) FROM website_projects wp WHERE wp.acceptance_id = a.id) > 0 AS has_website,
      (SELECT count(*) FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) > 0 AS has_landing_page,
      (SELECT count(*) FROM project_tasks pt WHERE pt.project_id = a.id) AS total_tasks,
      (SELECT count(*) FROM project_tasks pt WHERE pt.project_id = a.id AND pt.status NOT IN ('done')) AS pending_tasks
    FROM acceptances a
    WHERE (p_status IS NULL OR a.status = p_status)
  ) c;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 3. query_all_proposals — restrito a admin/gestor
CREATE OR REPLACE FUNCTION public.query_all_proposals(
  p_status_filter text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin e gestor podem listar todas as propostas.';
  END IF;

  SELECT json_agg(p ORDER BY p.created_at DESC) INTO result
  FROM (
    SELECT
      p.id,
      p.slug,
      p.company_name,
      p.responsible_name,
      p.monthly_fee,
      p.setup_fee,
      p.media_limit,
      p.contract_duration,
      p.services,
      p.created_at,
      (SELECT count(*) FROM acceptances a WHERE a.proposal_id = p.id) > 0 AS was_accepted,
      (SELECT a.status FROM acceptances a WHERE a.proposal_id = p.id LIMIT 1) AS acceptance_status
    FROM proposals p
    WHERE
      p_status_filter = 'all'
      OR (p_status_filter = 'open' AND NOT EXISTS (
        SELECT 1
        FROM acceptances a
        WHERE a.proposal_id = p.id
      ))
      OR (p_status_filter = 'accepted' AND EXISTS (
        SELECT 1
        FROM acceptances a
        WHERE a.proposal_id = p.id
      ))
  ) p;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 4. query_all_users — restrito a admin
CREATE OR REPLACE FUNCTION public.query_all_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin pode listar todos os usuários.';
  END IF;

  SELECT json_agg(u ORDER BY u.name) INTO result
  FROM (
    SELECT
      u.id::text,
      u.name,
      u.email,
      u.phone,
      u.role,
      u.full_name,
      u.created_at,
      (SELECT al.accessed_at FROM access_logs al WHERE al.user_id = u.id ORDER BY al.accessed_at DESC LIMIT 1) AS last_access
    FROM app_users u
  ) u;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 5. query_all_tasks — restrito a admin/gestor
CREATE OR REPLACE FUNCTION public.query_all_tasks(
  p_project_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_overdue boolean DEFAULT NULL,
  p_reference_date date DEFAULT NULL,
  p_reference_tz text DEFAULT NULL,
  p_created_date date DEFAULT NULL
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
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin e gestor podem listar todas as tarefas.';
  END IF;

  v_status := nullif(lower(trim(coalesce(p_status, ''))), '');

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

-- 6. query_access_summary — restrito a admin
CREATE OR REPLACE FUNCTION public.query_access_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin pode consultar o resumo de acessos.';
  END IF;

  SELECT json_agg(s ORDER BY s.last_access DESC) INTO result
  FROM (
    SELECT
      al.user_email,
      count(*) AS total_accesses,
      max(al.accessed_at) AS last_access,
      min(al.accessed_at) AS first_access
    FROM access_logs al
    GROUP BY al.user_email
  ) s;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Permissões mantidas (o controle de acesso agora é feito dentro das funções)
GRANT EXECUTE ON FUNCTION public.query_all_projects(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_clients(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_proposals(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_tasks(bigint, text, boolean, date, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_access_summary() TO authenticated, service_role;
