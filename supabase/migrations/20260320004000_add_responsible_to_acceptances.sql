-- ============================================================
-- Responsável universal em acceptances
--
-- Contexto:
--   Alguns projetos não têm entradas em traffic_projects,
--   website_projects ou landing_page_projects (ex: Hospedagem,
--   E-commerce, Consultoria, Agentes de IA). Para esses casos,
--   a tabela acceptances é a âncora universal do responsável.
--
-- execute_update_responsible_by_acceptance: única RPC que atualiza
-- TANTO a acceptance QUANTO todas as tabelas de projeto existentes.
-- ============================================================

-- 1. Coluna responsible_user_id em acceptances
ALTER TABLE public.acceptances
    ADD COLUMN IF NOT EXISTS responsible_user_id UUID
        REFERENCES public.app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptances_responsible_user_id
    ON public.acceptances(responsible_user_id);

-- 2. Backfill: puxar responsável das tabelas de projeto (ou Lucas como fallback)
DO $$
DECLARE v_lucas_id UUID;
BEGIN
    SELECT id INTO v_lucas_id
    FROM public.app_users
    WHERE email = 'lucas@c4marketing.com.br'
    LIMIT 1;

    UPDATE public.acceptances a
    SET responsible_user_id = COALESCE(
        (SELECT tp.responsible_user_id FROM traffic_projects      tp WHERE tp.acceptance_id = a.id AND tp.responsible_user_id IS NOT NULL LIMIT 1),
        (SELECT wp.responsible_user_id FROM website_projects      wp WHERE wp.acceptance_id = a.id AND wp.responsible_user_id IS NOT NULL LIMIT 1),
        (SELECT lp.responsible_user_id FROM landing_page_projects lp WHERE lp.acceptance_id = a.id AND lp.responsible_user_id IS NOT NULL LIMIT 1),
        v_lucas_id
    )
    WHERE a.responsible_user_id IS NULL
      AND a.status = 'Ativo';

    RAISE NOTICE 'Backfill de acceptances.responsible_user_id concluído.';
END $$;

COMMENT ON COLUMN public.acceptances.responsible_user_id IS
    'Membro da equipe C4 responsável por este projeto. Âncora universal para serviços sem tabela específica (hospedagem, e-commerce, etc.).';

-- 3. Nova RPC: atualiza responsável em acceptances + todas as tabelas de projeto
CREATE OR REPLACE FUNCTION public.execute_update_responsible_by_acceptance(
    p_acceptance_id       UUID    DEFAULT NULL,
    p_responsible_email   TEXT    DEFAULT NULL,
    p_responsible_user_id UUID    DEFAULT NULL,
    p_session_id          TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
    v_user_id       UUID;
    v_user_name     TEXT;
    v_company       TEXT;
    v_old_name      TEXT;
    v_updated       TEXT[] := '{}';
BEGIN
    PERFORM brain.assert_gestor();

    IF p_acceptance_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'p_acceptance_id é obrigatório.');
    END IF;

    IF p_responsible_user_id IS NULL AND p_responsible_email IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Informe p_responsible_email ou p_responsible_user_id.');
    END IF;

    -- Resolver usuário
    IF p_responsible_user_id IS NOT NULL THEN
        SELECT id, name INTO v_user_id, v_user_name
        FROM app_users WHERE id = p_responsible_user_id LIMIT 1;
    ELSE
        SELECT id, name INTO v_user_id, v_user_name
        FROM app_users WHERE lower(trim(email)) = lower(trim(p_responsible_email)) LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error',
            'message', format('Usuário não encontrado: %s',
                COALESCE(p_responsible_email, p_responsible_user_id::text)));
    END IF;

    -- Buscar empresa + responsável anterior
    SELECT a.company_name, u.name
    INTO v_company, v_old_name
    FROM acceptances a
    LEFT JOIN app_users u ON u.id = a.responsible_user_id
    WHERE a.id = p_acceptance_id;

    IF v_company IS NULL THEN
        RETURN jsonb_build_object('status', 'error',
            'message', format('Acceptance %s não encontrado.', p_acceptance_id));
    END IF;

    -- Atualizar acceptances (âncora universal)
    UPDATE acceptances SET responsible_user_id = v_user_id WHERE id = p_acceptance_id;
    v_updated := array_append(v_updated, 'acceptances');

    -- Atualizar tabelas de projeto (se existirem)
    UPDATE traffic_projects      SET responsible_user_id = v_user_id WHERE acceptance_id = p_acceptance_id;
    IF FOUND THEN v_updated := array_append(v_updated, 'traffic'); END IF;

    UPDATE website_projects      SET responsible_user_id = v_user_id WHERE acceptance_id = p_acceptance_id;
    IF FOUND THEN v_updated := array_append(v_updated, 'website'); END IF;

    UPDATE landing_page_projects SET responsible_user_id = v_user_id WHERE acceptance_id = p_acceptance_id;
    IF FOUND THEN v_updated := array_append(v_updated, 'landing_page'); END IF;

    RETURN jsonb_build_object(
        'status',          'success',
        'acceptance_id',   p_acceptance_id,
        'company_name',    v_company,
        'old_responsible', COALESCE(v_old_name, 'nenhum'),
        'new_responsible', v_user_name,
        'new_user_id',     v_user_id,
        'updated_tables',  v_updated,
        'message', format('Responsável de %s atualizado: %s → %s.',
            v_company, COALESCE(v_old_name, 'nenhum'), v_user_name)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_update_responsible_by_acceptance(uuid, text, uuid, text)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.execute_update_responsible_by_acceptance IS
    'GestorAPI: atualiza responsável interno em acceptances + todas as tabelas de projeto (traffic/website/landing_page) de uma vez. Use sempre que possível no lugar de execute_update_project_responsible.';

-- 4. query_all_projects: usa COALESCE(project.responsible, acceptance.responsible)
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
            a.id::text                                                      AS acceptance_id,
            'Gestão de Tráfego'                                             AS service_type,
            'traffic'                                                       AS service_type_key,
            a.company_name,
            tp.survey_status,
            tp.account_setup_status,
            a.status                                                        AS client_status,
            COALESCE(tp.responsible_user_id, a.responsible_user_id)::text  AS responsible_user_id,
            u.name                                                          AS responsible_user_name,
            u.email                                                         AS responsible_user_email,
            (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id) AS total_campaigns,
            (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id AND tc.status = 'active') AS active_campaigns,
            tp.created_at
        FROM traffic_projects tp
        JOIN acceptances a ON a.id = tp.acceptance_id
        LEFT JOIN app_users u ON u.id = COALESCE(tp.responsible_user_id, a.responsible_user_id)
        WHERE (p_service_type IS NULL OR p_service_type = 'traffic')

        UNION ALL

        SELECT
            wp.id::text,
            a.id::text                                                      AS acceptance_id,
            'Criação de Site'                                               AS service_type,
            'website'                                                       AS service_type_key,
            a.company_name,
            wp.survey_status,
            wp.account_setup_status,
            a.status                                                        AS client_status,
            COALESCE(wp.responsible_user_id, a.responsible_user_id)::text  AS responsible_user_id,
            u.name                                                          AS responsible_user_name,
            u.email                                                         AS responsible_user_email,
            (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id) AS total_campaigns,
            (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id AND w.status != 'delivered') AS active_campaigns,
            wp.created_at
        FROM website_projects wp
        JOIN acceptances a ON a.id = wp.acceptance_id
        LEFT JOIN app_users u ON u.id = COALESCE(wp.responsible_user_id, a.responsible_user_id)
        WHERE (p_service_type IS NULL OR p_service_type = 'website')

        UNION ALL

        SELECT
            lp.id::text,
            a.id::text                                                      AS acceptance_id,
            'Landing Page'                                                  AS service_type,
            'landing_page'                                                  AS service_type_key,
            a.company_name,
            lp.survey_status,
            lp.account_setup_status,
            a.status                                                        AS client_status,
            COALESCE(lp.responsible_user_id, a.responsible_user_id)::text  AS responsible_user_id,
            u.name                                                          AS responsible_user_name,
            u.email                                                         AS responsible_user_email,
            (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id) AS total_campaigns,
            (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id AND l.status != 'delivered') AS active_campaigns,
            lp.created_at
        FROM landing_page_projects lp
        JOIN acceptances a ON a.id = lp.acceptance_id
        LEFT JOIN app_users u ON u.id = COALESCE(lp.responsible_user_id, a.responsible_user_id)
        WHERE (p_service_type IS NULL OR p_service_type = 'landing_page')
    ) proj
    WHERE (p_status_filter IS NULL OR proj.client_status = p_status_filter);

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_projects(text, text) TO authenticated, service_role;

-- 5. query_all_tasks: usa COALESCE com fallback em acceptances
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

            -- Responsável: project-table > acceptance fallback
            (
                SELECT u.name FROM app_users u
                WHERE u.id = COALESCE(
                    (SELECT tp.responsible_user_id FROM traffic_projects     tp WHERE tp.acceptance_id = a.id AND tp.responsible_user_id IS NOT NULL LIMIT 1),
                    (SELECT wp.responsible_user_id FROM website_projects     wp WHERE wp.acceptance_id = a.id AND wp.responsible_user_id IS NOT NULL LIMIT 1),
                    (SELECT lp.responsible_user_id FROM landing_page_projects lp WHERE lp.acceptance_id = a.id AND lp.responsible_user_id IS NOT NULL LIMIT 1),
                    a.responsible_user_id
                )
                LIMIT 1
            )                                                           AS project_responsible_name,
            (
                SELECT u.email FROM app_users u
                WHERE u.id = COALESCE(
                    (SELECT tp.responsible_user_id FROM traffic_projects     tp WHERE tp.acceptance_id = a.id AND tp.responsible_user_id IS NOT NULL LIMIT 1),
                    (SELECT wp.responsible_user_id FROM website_projects     wp WHERE wp.acceptance_id = a.id AND wp.responsible_user_id IS NOT NULL LIMIT 1),
                    (SELECT lp.responsible_user_id FROM landing_page_projects lp WHERE lp.acceptance_id = a.id AND lp.responsible_user_id IS NOT NULL LIMIT 1),
                    a.responsible_user_id
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
