-- ============================================================
-- Atualiza RPCs para incluir responsible_user (responsável interno)
--
-- query_all_projects → adiciona responsible_user_id/name/email
-- query_all_tasks    → adiciona project_responsible_name/email
-- ============================================================

-- ---------------------------------------------------------------
-- 1. query_all_projects — com responsável interno
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.query_all_projects(text, text);
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
    SELECT json_agg(proj ORDER BY proj.company_name) INTO result
    FROM (
        SELECT
            tp.id::text,
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
            tp.created_at
        FROM traffic_projects tp
        JOIN acceptances a ON a.id = tp.acceptance_id
        LEFT JOIN app_users u ON u.id = tp.responsible_user_id
        WHERE (p_service_type IS NULL OR p_service_type = 'traffic')

        UNION ALL

        SELECT
            wp.id::text,
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
            wp.created_at
        FROM website_projects wp
        JOIN acceptances a ON a.id = wp.acceptance_id
        LEFT JOIN app_users u ON u.id = wp.responsible_user_id
        WHERE (p_service_type IS NULL OR p_service_type = 'website')

        UNION ALL

        SELECT
            lp.id::text,
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
            lp.created_at
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

-- ---------------------------------------------------------------
-- 2. query_all_tasks — com responsible_user do projeto
--
-- Resolução do responsável: um acceptance pode ter vários tipos
-- de projeto. Usa subquery para pegar o primeiro responsável
-- encontrado entre os 3 tipos (evita multiplicação de linhas).
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.query_all_tasks(bigint, text, boolean, date, text, date);
CREATE OR REPLACE FUNCTION public.query_all_tasks(
    p_project_id      bigint  DEFAULT NULL,
    p_status          text    DEFAULT NULL,
    p_overdue         boolean DEFAULT NULL,
    p_reference_date  date    DEFAULT NULL,
    p_reference_tz    text    DEFAULT NULL,
    p_created_date    date    DEFAULT NULL
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
    IF v_status = 'todo'   THEN v_status := 'backlog';  END IF;
    IF v_status = 'review' THEN v_status := 'approval'; END IF;

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
            a.company_name                                              AS client_name,
            pt.title,
            pt.description,
            pt.status,
            pt.priority,
            pt.assignee,
            pt.due_date,
            pt.created_at,
            (pt.due_date IS NOT NULL
             AND pt.due_date::date < v_reference_date
             AND pt.status <> 'done')                                  AS is_overdue,

            -- Responsável interno do projeto (primeiro encontrado entre os 3 tipos)
            (
                SELECT u.name FROM app_users u
                WHERE u.id = COALESCE(
                    (SELECT tp.responsible_user_id FROM traffic_projects     tp WHERE tp.acceptance_id = a.id LIMIT 1),
                    (SELECT wp.responsible_user_id FROM website_projects     wp WHERE wp.acceptance_id = a.id LIMIT 1),
                    (SELECT lp.responsible_user_id FROM landing_page_projects lp WHERE lp.acceptance_id = a.id LIMIT 1)
                )
                LIMIT 1
            )                                                           AS project_responsible_name,
            (
                SELECT u.email FROM app_users u
                WHERE u.id = COALESCE(
                    (SELECT tp.responsible_user_id FROM traffic_projects     tp WHERE tp.acceptance_id = a.id LIMIT 1),
                    (SELECT wp.responsible_user_id FROM website_projects     wp WHERE wp.acceptance_id = a.id LIMIT 1),
                    (SELECT lp.responsible_user_id FROM landing_page_projects lp WHERE lp.acceptance_id = a.id LIMIT 1)
                )
                LIMIT 1
            )                                                           AS project_responsible_email

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
            AND (p_created_date IS NULL
                OR (pt.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_created_date)
    ) t;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_tasks(bigint, text, boolean, date, text, date) TO authenticated, service_role;
