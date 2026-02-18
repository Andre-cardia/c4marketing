-- Create RPC to query survey responses from all project types
CREATE OR REPLACE FUNCTION public.query_survey_responses(
  p_client_name text DEFAULT NULL,
  p_project_type text DEFAULT NULL, -- 'traffic', 'landing_page', 'website'
  p_limit int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      a.client_name,
      'traffic' as project_type,
      tp.survey_status,
      tp.survey_data,
      tp.created_at
    FROM traffic_projects tp
    JOIN acceptances a ON tp.acceptance_id = a.id
    LEFT JOIN proposals p ON a.proposal_id = p.id
    WHERE 
      (p_client_name IS NULL OR a.client_name ILIKE '%' || p_client_name || '%')
      AND (p_project_type IS NULL OR p_project_type = 'traffic')
      AND tp.survey_data IS NOT NULL

    UNION ALL

    SELECT 
      a.client_name,
      'landing_page' as project_type,
      lp.survey_status,
      lp.survey_data,
      lp.created_at
    FROM landing_page_projects lp
    JOIN acceptances a ON lp.acceptance_id = a.id
    LEFT JOIN proposals p ON a.proposal_id = p.id
    WHERE 
      (p_client_name IS NULL OR a.client_name ILIKE '%' || p_client_name || '%')
      AND (p_project_type IS NULL OR p_project_type = 'landing_page')
      AND lp.survey_data IS NOT NULL

    UNION ALL

    SELECT 
      a.client_name,
      'website' as project_type,
      wp.survey_status,
      wp.survey_data,
      wp.created_at
    FROM website_projects wp
    JOIN acceptances a ON wp.acceptance_id = a.id
    LEFT JOIN proposals p ON a.proposal_id = p.id
    WHERE 
      (p_client_name IS NULL OR a.client_name ILIKE '%' || p_client_name || '%')
      AND (p_project_type IS NULL OR p_project_type = 'website')
      AND wp.survey_data IS NOT NULL
    
    ORDER BY created_at DESC
    LIMIT p_limit
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
