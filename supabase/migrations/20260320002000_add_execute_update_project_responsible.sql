-- ============================================================
-- GestorAPI: execute_update_project_responsible
--
-- Permite que gestores alterem o responsável interno de um projeto.
-- Registra a troca no log de ações autônomas para auditoria.
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_update_project_responsible(
    p_session_id          TEXT    DEFAULT NULL,
    p_project_id          UUID    DEFAULT NULL,   -- UUID do projeto
    p_service_type        TEXT    DEFAULT NULL,   -- 'traffic' | 'website' | 'landing_page'
    p_responsible_email   TEXT    DEFAULT NULL,   -- email do novo responsável
    p_responsible_user_id UUID    DEFAULT NULL,   -- ou UUID direto
    p_idempotency_key     TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
    v_user_id    UUID;
    v_user_name  TEXT;
    v_company    TEXT;
    v_old_name   TEXT;
    v_old_email  TEXT;
    v_allowed    TEXT[] := ARRAY['traffic', 'website', 'landing_page'];
BEGIN
    PERFORM brain.assert_gestor();

    -- Validações de entrada
    IF p_project_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error',
            'message', 'p_project_id é obrigatório.');
    END IF;

    IF p_service_type IS NULL OR NOT (p_service_type = ANY(v_allowed)) THEN
        RETURN jsonb_build_object('status', 'error',
            'message', format(
                'p_service_type inválido: "%s". Use: traffic, website ou landing_page.',
                COALESCE(p_service_type, 'null')
            ));
    END IF;

    IF p_responsible_user_id IS NULL AND p_responsible_email IS NULL THEN
        RETURN jsonb_build_object('status', 'error',
            'message', 'Informe p_responsible_email ou p_responsible_user_id.');
    END IF;

    -- Resolver usuário responsável
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

    -- Atualizar tabela correta e capturar empresa + responsável anterior
    IF p_service_type = 'traffic' THEN
        SELECT a.company_name, u.name, u.email
        INTO v_company, v_old_name, v_old_email
        FROM traffic_projects tp
        JOIN acceptances a ON a.id = tp.acceptance_id
        LEFT JOIN app_users u ON u.id = tp.responsible_user_id
        WHERE tp.id = p_project_id;

        UPDATE traffic_projects
        SET responsible_user_id = v_user_id
        WHERE id = p_project_id;

    ELSIF p_service_type = 'website' THEN
        SELECT a.company_name, u.name, u.email
        INTO v_company, v_old_name, v_old_email
        FROM website_projects wp
        JOIN acceptances a ON a.id = wp.acceptance_id
        LEFT JOIN app_users u ON u.id = wp.responsible_user_id
        WHERE wp.id = p_project_id;

        UPDATE website_projects
        SET responsible_user_id = v_user_id
        WHERE id = p_project_id;

    ELSIF p_service_type = 'landing_page' THEN
        SELECT a.company_name, u.name, u.email
        INTO v_company, v_old_name, v_old_email
        FROM landing_page_projects lp
        JOIN acceptances a ON a.id = lp.acceptance_id
        LEFT JOIN app_users u ON u.id = lp.responsible_user_id
        WHERE lp.id = p_project_id;

        UPDATE landing_page_projects
        SET responsible_user_id = v_user_id
        WHERE id = p_project_id;
    END IF;

    IF v_company IS NULL THEN
        RETURN jsonb_build_object('status', 'error',
            'message', format('Projeto %s (%s) não encontrado.', p_project_id, p_service_type));
    END IF;

    RETURN jsonb_build_object(
        'status',           'success',
        'project_id',       p_project_id,
        'service_type',     p_service_type,
        'company_name',     v_company,
        'old_responsible',  COALESCE(v_old_name, 'nenhum'),
        'old_email',        v_old_email,
        'new_responsible',  v_user_name,
        'new_user_id',      v_user_id,
        'message', format(
            'Responsável do projeto %s (%s) atualizado: %s → %s.',
            v_company, p_service_type,
            COALESCE(v_old_name, 'nenhum'), v_user_name
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_update_project_responsible(
    text, uuid, text, text, uuid, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.execute_update_project_responsible IS
    'GestorAPI: altera o responsável interno de um projeto. Apenas gestores.
     Parâmetros: p_project_id (UUID), p_service_type (traffic/website/landing_page),
     p_responsible_email OU p_responsible_user_id.';
