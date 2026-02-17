-- ============================================================
-- RPC: query_all_projects
-- Consulta SQL direta que retorna TODOS os projetos unificados
-- Suporta filtro por tipo de serviço e escala para 500+ registros
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_all_projects(
  p_service_type text DEFAULT NULL,   -- 'traffic', 'website', 'landing_page' ou NULL para todos
  p_status_filter text DEFAULT NULL   -- 'active', 'pending', 'completed' ou NULL para todos
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(proj ORDER BY proj.company_name) INTO result
  FROM (
    -- Projetos de Tráfego
    SELECT
      tp.id::text,
      'traffic' AS service_type,
      a.company_name,
      tp.survey_status,
      tp.account_setup_status,
      COALESCE(tp.survey_status = 'completed' AND tp.account_setup_status = 'completed', false) AS is_fully_setup,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id) AS total_campaigns,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id AND tc.status = 'active') AS active_campaigns,
      tp.created_at
    FROM traffic_projects tp
    JOIN acceptances a ON a.id = tp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'traffic')
      AND (p_status_filter IS NULL 
           OR (p_status_filter = 'active' AND a.status = 'accepted')
           OR (p_status_filter = 'pending' AND (tp.survey_status = 'pending' OR tp.account_setup_status = 'pending'))
           OR (p_status_filter = 'completed' AND tp.survey_status = 'completed' AND tp.account_setup_status = 'completed')
          )

    UNION ALL

    -- Projetos de Website
    SELECT
      wp.id::text,
      'website' AS service_type,
      a.company_name,
      wp.survey_status,
      wp.account_setup_status,
      COALESCE(wp.survey_status = 'completed' AND wp.account_setup_status = 'completed', false) AS is_fully_setup,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id) AS total_campaigns,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id AND w.status != 'delivered') AS active_campaigns,
      wp.created_at
    FROM website_projects wp
    JOIN acceptances a ON a.id = wp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'website')
      AND (p_status_filter IS NULL
           OR (p_status_filter = 'active' AND a.status = 'accepted')
           OR (p_status_filter = 'pending' AND (wp.survey_status = 'pending' OR wp.account_setup_status = 'pending'))
           OR (p_status_filter = 'completed' AND wp.survey_status = 'completed' AND wp.account_setup_status = 'completed')
          )

    UNION ALL

    -- Projetos de Landing Page
    SELECT
      lp.id::text,
      'landing_page' AS service_type,
      a.company_name,
      lp.survey_status,
      lp.account_setup_status,
      COALESCE(lp.survey_status = 'completed' AND lp.account_setup_status = 'completed', false) AS is_fully_setup,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id) AS total_campaigns,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id AND l.status != 'delivered') AS active_campaigns,
      lp.created_at
    FROM landing_page_projects lp
    JOIN acceptances a ON a.id = lp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'landing_page')
      AND (p_status_filter IS NULL
           OR (p_status_filter = 'active' AND a.status = 'accepted')
           OR (p_status_filter = 'pending' AND (lp.survey_status = 'pending' OR lp.account_setup_status = 'pending'))
           OR (p_status_filter = 'completed' AND lp.survey_status = 'completed' AND lp.account_setup_status = 'completed')
          )
  ) proj;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_projects TO authenticated;
GRANT EXECUTE ON FUNCTION public.query_all_projects TO service_role;
