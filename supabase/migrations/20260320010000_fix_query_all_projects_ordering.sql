-- ============================================================
-- Fix: query_all_projects — ordem por data de ativação DESC
--
-- Problema: ORDER BY company_name (alfabético) fazia o LLM
-- escolher o projeto errado quando perguntado pelo "mais recente".
--
-- Fix: adicionar activated_at (= a.created_at da acceptance)
-- ao SELECT e ordenar por activated_at DESC.
-- Resultado: o projeto mais recente sempre aparece primeiro.
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_all_projects(
    p_service_type  text DEFAULT NULL,
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
    SELECT json_agg(proj ORDER BY proj.activated_at DESC) INTO result
    FROM (
        SELECT
            tp.id::text,
            a.id::text                AS acceptance_id,
            'Gestão de Tráfego'       AS service_type,
            'traffic'                 AS service_type_key,
            a.company_name,
            tp.survey_status,
            tp.account_setup_status,
            a.status                  AS client_status,
            tp.responsible_user_id::text,
            u.name                    AS responsible_user_name,
            u.email                   AS responsible_user_email,
            (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id) AS total_campaigns,
            (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id AND tc.status = 'active') AS active_campaigns,
            tp.created_at,
            a.timestamp               AS activated_at
        FROM traffic_projects tp
        JOIN acceptances a ON a.id = tp.acceptance_id
        LEFT JOIN app_users u ON u.id = tp.responsible_user_id
        WHERE (p_service_type IS NULL OR p_service_type = 'traffic')

        UNION ALL

        SELECT
            wp.id::text,
            a.id::text                AS acceptance_id,
            'Criação de Site'          AS service_type,
            'website'                  AS service_type_key,
            a.company_name,
            wp.survey_status,
            wp.account_setup_status,
            a.status                   AS client_status,
            wp.responsible_user_id::text,
            u.name                     AS responsible_user_name,
            u.email                    AS responsible_user_email,
            (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id) AS total_campaigns,
            (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id AND w.status != 'delivered') AS active_campaigns,
            wp.created_at,
            a.timestamp               AS activated_at
        FROM website_projects wp
        JOIN acceptances a ON a.id = wp.acceptance_id
        LEFT JOIN app_users u ON u.id = wp.responsible_user_id
        WHERE (p_service_type IS NULL OR p_service_type = 'website')

        UNION ALL

        SELECT
            lp.id::text,
            a.id::text                AS acceptance_id,
            'Landing Page'             AS service_type,
            'landing_page'             AS service_type_key,
            a.company_name,
            lp.survey_status,
            lp.account_setup_status,
            a.status                   AS client_status,
            lp.responsible_user_id::text,
            u.name                     AS responsible_user_name,
            u.email                    AS responsible_user_email,
            (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id) AS total_campaigns,
            (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id AND l.status != 'delivered') AS active_campaigns,
            lp.created_at,
            a.timestamp               AS activated_at
        FROM landing_page_projects lp
        JOIN acceptances a ON a.id = lp.acceptance_id
        LEFT JOIN app_users u ON u.id = lp.responsible_user_id
        WHERE (p_service_type IS NULL OR p_service_type = 'landing_page')
    ) proj
    WHERE (p_status_filter IS NULL OR proj.client_status = p_status_filter);

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_projects(text, text) TO authenticated, service_role;
