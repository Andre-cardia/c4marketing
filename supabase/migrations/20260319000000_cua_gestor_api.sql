-- ==============================================================
-- CUA v10.0 — GestorAPI
--   brain.is_gestor() / brain.assert_gestor()
--   Tabelas: cua_sessions, autonomous_actions, reports
--   RPCs de escrita: execute_create_proposal, execute_update_proposal,
--     execute_update_proposal_status, execute_add_proposal_service,
--     execute_create_task, execute_assign_task,
--     execute_invite_user, execute_update_user_role, execute_deactivate_user,
--     execute_update_document, execute_generate_contract,
--     execute_mark_clause_reviewed,
--     brain_save_report, brain_schedule_report, brain_deliver_report
-- Data: 2026-03-19
-- Política: TODA RPC inicia com PERFORM brain.assert_gestor()
-- ==============================================================

-- ---------------------------------------------------------------
-- 0. Funções de segurança gestor
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION brain.is_gestor()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, brain AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.app_users
        WHERE email = auth.jwt() ->> 'email'
          AND role = 'gestor'
    );
END; $$;

CREATE OR REPLACE FUNCTION brain.assert_gestor()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, brain AS $$
DECLARE v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.app_users
    WHERE email = auth.jwt() ->> 'email';
    IF v_role IS DISTINCT FROM 'gestor' THEN
        RAISE EXCEPTION 'Acesso negado: apenas gestores podem usar o Agente Autônomo.';
    END IF;
END; $$;

GRANT EXECUTE ON FUNCTION brain.is_gestor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION brain.assert_gestor() TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 1. brain.cua_sessions
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brain.cua_sessions (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    session_type    TEXT        NOT NULL DEFAULT 'one_shot', -- 'one_shot','monitoring','scheduled'
    objective       TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'active',   -- 'active','paused','stopped','completed'
    created_by      TEXT        NOT NULL,                    -- email do gestor
    interval_minutes INTEGER    DEFAULT 30,
    max_hours       INTEGER     DEFAULT 24,
    iteration_count INTEGER     DEFAULT 0,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    result          TEXT,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE brain.cua_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor_only_cua_sessions" ON brain.cua_sessions;
CREATE POLICY "gestor_only_cua_sessions" ON brain.cua_sessions
    USING (brain.is_gestor());
GRANT ALL ON brain.cua_sessions TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. brain.autonomous_actions
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brain.autonomous_actions (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id       UUID        REFERENCES brain.cua_sessions(id),
    action_type      TEXT        NOT NULL,
    severity         TEXT        NOT NULL DEFAULT 'info', -- 'info','warning','critical'
    params           JSONB       DEFAULT '{}',
    result           JSONB       DEFAULT '{}',
    status           TEXT        NOT NULL DEFAULT 'pending', -- 'pending','executed','failed','rolled_back'
    can_rollback     BOOLEAN     DEFAULT false,
    rollback_deadline TIMESTAMPTZ,
    executed_at      TIMESTAMPTZ,
    rolled_back_at   TIMESTAMPTZ,
    executed_by      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE brain.autonomous_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor_only_autonomous_actions" ON brain.autonomous_actions;
CREATE POLICY "gestor_only_autonomous_actions" ON brain.autonomous_actions
    USING (brain.is_gestor());
GRANT ALL ON brain.autonomous_actions TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. brain.reports
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brain.reports (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    report_type TEXT        NOT NULL DEFAULT 'custom', -- 'ops_daily','contract_pulse','proposal_pipeline','client_health','custom','contract'
    session_id  TEXT,
    status      TEXT        NOT NULL DEFAULT 'draft',  -- 'draft','scheduled','delivered'
    deliver_at  TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE brain.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor_only_reports" ON brain.reports;
CREATE POLICY "gestor_only_reports" ON brain.reports
    USING (brain.is_gestor());
GRANT ALL ON brain.reports TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. execute_create_proposal
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_create_proposal(
    p_session_id        TEXT    DEFAULT NULL,
    p_company_name      TEXT    DEFAULT NULL,
    p_responsible_name  TEXT    DEFAULT NULL,
    p_services          JSONB   DEFAULT '[]'::jsonb,
    p_monthly_fee       NUMERIC DEFAULT 0,
    p_setup_fee         NUMERIC DEFAULT 0,
    p_media_limit       NUMERIC DEFAULT 0,
    p_contract_duration INTEGER DEFAULT 6,
    p_notes             TEXT    DEFAULT NULL,
    p_idempotency_key   TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_proposal_id BIGINT;
    v_slug        TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_company_name IS NULL OR p_responsible_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_company_name e p_responsible_name são obrigatórios.');
    END IF;

    v_slug := lower(regexp_replace(trim(p_company_name), '[^a-zA-Z0-9]+', '-', 'g'))
              || '-' || extract(epoch from now())::bigint;

    INSERT INTO proposals (slug, company_name, responsible_name, monthly_fee,
                           setup_fee, media_limit, contract_duration, services)
    VALUES (v_slug, p_company_name, p_responsible_name,
            p_monthly_fee, p_setup_fee, p_media_limit,
            p_contract_duration, coalesce(p_services, '[]'::jsonb))
    RETURNING id INTO v_proposal_id;

    BEGIN
        INSERT INTO brain.execution_logs
            (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'create_proposal', 'success',
                jsonb_build_object('company_name',p_company_name,'monthly_fee',p_monthly_fee,'setup_fee',p_setup_fee),
                jsonb_build_object('proposal_id',v_proposal_id,'slug',v_slug), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status',      'success',
        'proposal_id', v_proposal_id,
        'slug',        v_slug,
        'message', format('Proposta criada para %s (ID: %s). Rollback disponível por 24h.',
                          p_company_name, v_proposal_id)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_create_proposal TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. execute_update_proposal
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_update_proposal(
    p_session_id      TEXT    DEFAULT NULL,
    p_proposal_id     BIGINT  DEFAULT NULL,
    p_field           TEXT    DEFAULT NULL,
    p_value           TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_allowed_fields TEXT[] := ARRAY['company_name','responsible_name','monthly_fee',
                                     'setup_fee','media_limit','contract_duration'];
    v_company_name TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_proposal_id IS NULL OR p_field IS NULL OR p_value IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_proposal_id, p_field e p_value são obrigatórios.');
    END IF;

    IF NOT (p_field = ANY(v_allowed_fields)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Campo "%s" não permitido. Use: %s',
                              p_field, array_to_string(v_allowed_fields, ', ')));
    END IF;

    SELECT company_name INTO v_company_name FROM proposals WHERE id = p_proposal_id;
    IF v_company_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Proposta ID %s não encontrada.', p_proposal_id));
    END IF;

    EXECUTE format('UPDATE proposals SET %I = $1 WHERE id = $2', p_field)
    USING p_value, p_proposal_id;

    RETURN jsonb_build_object(
        'status',      'success',
        'proposal_id', p_proposal_id,
        'field',       p_field,
        'new_value',   p_value,
        'message', format('Proposta "%s" atualizada: %s = %s.', v_company_name, p_field, p_value)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_update_proposal TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 6. execute_update_proposal_status
--    Atualiza o status do acceptance vinculado à proposta
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_update_proposal_status(
    p_session_id      TEXT   DEFAULT NULL,
    p_proposal_id     BIGINT DEFAULT NULL,
    p_status          TEXT   DEFAULT NULL,
    p_idempotency_key TEXT   DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_allowed  TEXT[] := ARRAY['Ativo','Inativo','Suspenso','Cancelado','Finalizado'];
    v_company_name TEXT;
    v_old_status   TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_proposal_id IS NULL OR p_status IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_proposal_id e p_status são obrigatórios.');
    END IF;

    IF NOT (p_status = ANY(v_allowed)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Status "%s" inválido. Use: %s',
                              p_status, array_to_string(v_allowed, ', ')));
    END IF;

    SELECT a.status, a.company_name
      INTO v_old_status, v_company_name
      FROM acceptances a WHERE a.proposal_id = p_proposal_id LIMIT 1;

    IF v_company_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Nenhum contrato ativo encontrado para proposta ID %s.', p_proposal_id));
    END IF;

    UPDATE acceptances SET status = p_status WHERE proposal_id = p_proposal_id;

    RETURN jsonb_build_object(
        'status',      'success',
        'proposal_id', p_proposal_id,
        'company_name', v_company_name,
        'old_status',  v_old_status,
        'new_status',  p_status,
        'message', format('Status de "%s" atualizado: %s → %s.',
                          v_company_name, v_old_status, p_status)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_update_proposal_status TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 7. execute_add_proposal_service
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_add_proposal_service(
    p_session_id      TEXT    DEFAULT NULL,
    p_proposal_id     BIGINT  DEFAULT NULL,
    p_service_type    TEXT    DEFAULT NULL,
    p_value           NUMERIC DEFAULT 0,
    p_description     TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_company_name TEXT;
    v_new_service  JSONB;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_proposal_id IS NULL OR p_service_type IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_proposal_id e p_service_type são obrigatórios.');
    END IF;

    SELECT company_name INTO v_company_name FROM proposals WHERE id = p_proposal_id;
    IF v_company_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Proposta ID %s não encontrada.', p_proposal_id));
    END IF;

    v_new_service := jsonb_build_object(
        'type',        p_service_type,
        'value',       p_value,
        'description', coalesce(p_description, p_service_type),
        'added_at',    now()::text
    );

    UPDATE proposals
       SET services = services || jsonb_build_array(v_new_service)
     WHERE id = p_proposal_id;

    RETURN jsonb_build_object(
        'status',        'success',
        'proposal_id',   p_proposal_id,
        'service_added', v_new_service,
        'message', format('Serviço "%s" adicionado à proposta de %s.',
                          p_service_type, v_company_name)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_add_proposal_service TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 8. execute_create_task  (versão gestor — usa brain.assert_gestor)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_create_task(
    p_session_id      TEXT    DEFAULT NULL,
    p_project_id      BIGINT  DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_title           TEXT    DEFAULT NULL,
    p_description     TEXT    DEFAULT NULL,
    p_due_date        DATE    DEFAULT NULL,
    p_priority        TEXT    DEFAULT 'medium',
    p_status          TEXT    DEFAULT 'backlog',
    p_assignee        TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_task_id     UUID;
    v_client_name TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        SELECT a.id, a.company_name
          INTO p_project_id, v_client_name
          FROM acceptances a
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    END IF;

    IF p_project_id IS NULL OR p_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_project_id (ou p_project_name) e p_title são obrigatórios.');
    END IF;

    IF v_client_name IS NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    INSERT INTO project_tasks (project_id, title, description, due_date, priority, status, assignee)
    VALUES (p_project_id, p_title, p_description, p_due_date, p_priority, p_status, p_assignee)
    RETURNING id INTO v_task_id;

    BEGIN
        INSERT INTO brain.execution_logs
            (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'create_task', 'success',
                jsonb_build_object('project_id',p_project_id,'title',p_title,'client_name',v_client_name),
                jsonb_build_object('task_id',v_task_id), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status',      'success',
        'task_id',     v_task_id,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" criada (ID: %s) para %s.',
                          p_title, v_task_id, coalesce(v_client_name,'desconhecido'))
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_create_task TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 9. execute_assign_task
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_assign_task(
    p_session_id      TEXT    DEFAULT NULL,
    p_task_id         UUID    DEFAULT NULL,
    p_task_title      TEXT    DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_assignee_email  TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_task_title   TEXT;
    v_old_assignee TEXT;
    v_client_name  TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_assignee_email IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_assignee_email é obrigatório.');
    END IF;

    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title.');
    END IF;

    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title, pt.assignee, a.company_name
          INTO p_task_id, v_task_title, v_old_assignee, v_client_name
          FROM project_tasks pt
          LEFT JOIN acceptances a ON a.id = pt.project_id
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_name IS NULL
                OR lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%')
         ORDER BY pt.created_at DESC LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada.', p_task_title));
        END IF;
    ELSE
        SELECT pt.title, pt.assignee, a.company_name
          INTO v_task_title, v_old_assignee, v_client_name
          FROM project_tasks pt
          LEFT JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.id = p_task_id;
    END IF;

    UPDATE project_tasks SET assignee = p_assignee_email WHERE id = p_task_id;

    RETURN jsonb_build_object(
        'status',       'success',
        'task_id',      p_task_id,
        'task_title',   v_task_title,
        'old_assignee', v_old_assignee,
        'new_assignee', p_assignee_email,
        'message', format('Tarefa "%s" atribuída a %s%s.',
                          v_task_title, p_assignee_email,
                          CASE WHEN v_client_name IS NOT NULL
                               THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_assign_task TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 10. execute_invite_user
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_invite_user(
    p_session_id      TEXT    DEFAULT NULL,
    p_email           TEXT    DEFAULT NULL,
    p_name            TEXT    DEFAULT NULL,
    p_role            TEXT    DEFAULT 'leitor',
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_user_id      UUID;
    v_allowed TEXT[] := ARRAY['gestor','operacional','comercial','leitor','cliente'];
BEGIN
    PERFORM brain.assert_gestor();

    IF p_email IS NULL OR p_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_email e p_name são obrigatórios.');
    END IF;

    IF NOT (p_role = ANY(v_allowed)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Role "%s" inválido. Use: %s',
                              p_role, array_to_string(v_allowed, ', ')));
    END IF;

    IF EXISTS (SELECT 1 FROM app_users WHERE email = lower(trim(p_email))) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Usuário com email "%s" já existe no sistema.', p_email));
    END IF;

    INSERT INTO app_users (name, email, role)
    VALUES (p_name, lower(trim(p_email)), p_role)
    RETURNING id INTO v_user_id;

    BEGIN
        INSERT INTO brain.execution_logs
            (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'invite_user', 'success',
                jsonb_build_object('email',p_email,'name',p_name,'role',p_role),
                jsonb_build_object('user_id',v_user_id), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status',  'success',
        'user_id', v_user_id,
        'email',   lower(trim(p_email)),
        'role',    p_role,
        'message', format('Usuário "%s" (%s) criado com role "%s". Convite por e-mail será enviado.',
                          p_name, p_email, p_role)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_invite_user TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 11. execute_update_user_role
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_update_user_role(
    p_session_id      TEXT    DEFAULT NULL,
    p_user_id         UUID    DEFAULT NULL,
    p_user_email      TEXT    DEFAULT NULL,
    p_new_role        TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_allowed TEXT[] := ARRAY['gestor','operacional','comercial','leitor','cliente'];
    v_user_name TEXT;
    v_old_role  TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_new_role IS NULL OR NOT (p_new_role = ANY(v_allowed)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Role "%s" inválido. Use: %s',
                              coalesce(p_new_role,'(vazio)'), array_to_string(v_allowed, ', ')));
    END IF;

    IF p_user_id IS NOT NULL THEN
        SELECT name, role INTO v_user_name, v_old_role FROM app_users WHERE id = p_user_id;
    ELSIF p_user_email IS NOT NULL THEN
        SELECT id, name, role
          INTO p_user_id, v_user_name, v_old_role
          FROM app_users WHERE email = lower(trim(p_user_email));
    END IF;

    IF v_user_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Usuário não encontrado. Informe p_user_id ou p_user_email.');
    END IF;

    UPDATE app_users SET role = p_new_role WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'status',    'success',
        'user_id',   p_user_id,
        'user_name', v_user_name,
        'old_role',  v_old_role,
        'new_role',  p_new_role,
        'message', format('Role de "%s" atualizado: %s → %s.',
                          v_user_name, v_old_role, p_new_role)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_update_user_role TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 12. execute_deactivate_user
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_deactivate_user(
    p_session_id      TEXT    DEFAULT NULL,
    p_user_id         UUID    DEFAULT NULL,
    p_user_email      TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_user_name TEXT;
    v_old_role  TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_user_id IS NOT NULL THEN
        SELECT name, role INTO v_user_name, v_old_role FROM app_users WHERE id = p_user_id;
    ELSIF p_user_email IS NOT NULL THEN
        SELECT id, name, role
          INTO p_user_id, v_user_name, v_old_role
          FROM app_users WHERE email = lower(trim(p_user_email));
    END IF;

    IF v_user_name IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Usuário não encontrado. Informe p_user_id ou p_user_email.');
    END IF;

    IF v_old_role = 'gestor' THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Não é possível desativar gestor "%s". Altere o role primeiro.',
                              v_user_name));
    END IF;

    UPDATE app_users SET role = 'leitor' WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'status',        'success',
        'user_id',       p_user_id,
        'user_name',     v_user_name,
        'previous_role', v_old_role,
        'message', format('Usuário "%s" desativado (role alterado para "leitor").', v_user_name)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_deactivate_user TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 13. execute_update_document
--     Atualiza content em brain.documents com verificação de conflito
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_update_document(
    p_session_id      TEXT    DEFAULT NULL,
    p_document_id     UUID    DEFAULT NULL,
    p_old_value       TEXT    DEFAULT NULL,
    p_new_value       TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_title           TEXT;
    v_current_content TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_document_id IS NULL OR p_new_value IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_document_id e p_new_value são obrigatórios.');
    END IF;

    SELECT metadata->>'title', content
      INTO v_title, v_current_content
      FROM brain.documents WHERE id = p_document_id;

    IF v_current_content IS NULL AND v_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Documento %s não encontrado.', p_document_id));
    END IF;

    IF p_old_value IS NOT NULL AND v_current_content IS DISTINCT FROM p_old_value THEN
        RETURN jsonb_build_object('status','conflict',
            'message','Conflito: conteúdo atual não corresponde a p_old_value. Recarregue e tente novamente.');
    END IF;

    UPDATE brain.documents
       SET content = p_new_value,
           metadata = metadata || jsonb_build_object('updated_at', now()::text)
     WHERE id = p_document_id;

    RETURN jsonb_build_object(
        'status',      'success',
        'document_id', p_document_id,
        'title',       coalesce(v_title, p_document_id::text),
        'message', format('Documento "%s" atualizado.', coalesce(v_title, p_document_id::text))
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_update_document TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 14. execute_generate_contract
--     Gera rascunho de contrato em brain.reports a partir da proposta
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_generate_contract(
    p_session_id      TEXT    DEFAULT NULL,
    p_proposal_id     BIGINT  DEFAULT NULL,
    p_notes           TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_contract_id UUID;
    v_proposal    proposals%ROWTYPE;
    v_content     TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_proposal_id IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_proposal_id é obrigatório.');
    END IF;

    SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id;
    IF v_proposal.id IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Proposta ID %s não encontrada.', p_proposal_id));
    END IF;

    v_content := format(
        E'# Contrato — %s\n\n'
        || E'**Proposta ID:** %s\n'
        || E'**Empresa:** %s\n'
        || E'**Responsável:** %s\n'
        || E'**Mensalidade:** R$ %s\n'
        || E'**Setup:** R$ %s\n'
        || E'**Limite de mídia:** R$ %s\n'
        || E'**Duração:** %s meses\n'
        || E'\n---\n\n%s',
        v_proposal.company_name,
        p_proposal_id,
        v_proposal.company_name,
        v_proposal.responsible_name,
        v_proposal.monthly_fee,
        v_proposal.setup_fee,
        v_proposal.media_limit,
        v_proposal.contract_duration,
        coalesce(p_notes, '_Contrato gerado automaticamente pelo Agente Autônomo. Revise antes de enviar ao cliente._')
    );

    INSERT INTO brain.reports (title, content, report_type, session_id, status, created_by)
    VALUES (
        'Contrato — ' || v_proposal.company_name,
        v_content,
        'contract',
        coalesce(p_session_id, 'manual'),
        'draft',
        auth.jwt() ->> 'email'
    )
    RETURNING id INTO v_contract_id;

    RETURN jsonb_build_object(
        'status',       'success',
        'contract_id',  v_contract_id,
        'company_name', v_proposal.company_name,
        'message', format('Contrato gerado para %s (ID: %s). Status: rascunho. Revise antes de enviar.',
                          v_proposal.company_name, v_contract_id)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_generate_contract TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 15. execute_mark_clause_reviewed
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_mark_clause_reviewed(
    p_session_id      TEXT    DEFAULT NULL,
    p_contract_id     UUID    DEFAULT NULL,
    p_clause          TEXT    DEFAULT NULL,
    p_note            TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_title    TEXT;
    v_reviewer TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_contract_id IS NULL OR p_clause IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_contract_id e p_clause são obrigatórios.');
    END IF;

    SELECT title INTO v_title
      FROM brain.reports
     WHERE id = p_contract_id AND report_type = 'contract';

    IF v_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Contrato ID %s não encontrado.', p_contract_id));
    END IF;

    v_reviewer := coalesce(auth.jwt() ->> 'email', 'agente');

    UPDATE brain.reports
       SET content = content || format(
               E'\n\n---\n**Cláusula %s revisada por %s em %s.**\n%s',
               p_clause, v_reviewer, now()::date, coalesce(p_note, '')),
           updated_at = now()
     WHERE id = p_contract_id;

    RETURN jsonb_build_object(
        'status',      'success',
        'contract_id', p_contract_id,
        'clause',      p_clause,
        'reviewed_by', v_reviewer,
        'message', format('Cláusula "%s" do contrato "%s" marcada como revisada.', p_clause, v_title)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_mark_clause_reviewed TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 16. brain_save_report
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brain_save_report(
    p_session_id      TEXT    DEFAULT NULL,
    p_title           TEXT    DEFAULT NULL,
    p_content         TEXT    DEFAULT NULL,
    p_report_type     TEXT    DEFAULT 'custom',
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_report_id UUID;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_title IS NULL OR p_content IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_title e p_content são obrigatórios.');
    END IF;

    INSERT INTO brain.reports (title, content, report_type, session_id, status, created_by)
    VALUES (
        p_title,
        p_content,
        coalesce(p_report_type, 'custom'),
        coalesce(p_session_id, 'manual'),
        'draft',
        auth.jwt() ->> 'email'
    )
    RETURNING id INTO v_report_id;

    RETURN jsonb_build_object(
        'status',    'success',
        'report_id', v_report_id,
        'message', format('Relatório "%s" salvo (ID: %s).', p_title, v_report_id)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.brain_save_report TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 17. brain_schedule_report
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brain_schedule_report(
    p_session_id      TEXT        DEFAULT NULL,
    p_report_id       UUID        DEFAULT NULL,
    p_deliver_at      TIMESTAMPTZ DEFAULT NULL,
    p_idempotency_key TEXT        DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_title TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_report_id IS NULL OR p_deliver_at IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_report_id e p_deliver_at são obrigatórios.');
    END IF;

    SELECT title INTO v_title FROM brain.reports WHERE id = p_report_id;
    IF v_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Relatório ID %s não encontrado.', p_report_id));
    END IF;

    UPDATE brain.reports
       SET status     = 'scheduled',
           deliver_at = p_deliver_at,
           updated_at = now()
     WHERE id = p_report_id;

    RETURN jsonb_build_object(
        'status',     'success',
        'report_id',  p_report_id,
        'deliver_at', p_deliver_at,
        'message', format('Relatório "%s" agendado para %s.', v_title, p_deliver_at::date)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.brain_schedule_report TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 18. brain_deliver_report
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brain_deliver_report(
    p_session_id      TEXT    DEFAULT NULL,
    p_report_id       UUID    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE
    v_title  TEXT;
    v_status TEXT;
BEGIN
    PERFORM brain.assert_gestor();

    IF p_report_id IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_report_id é obrigatório.');
    END IF;

    SELECT title, status INTO v_title, v_status FROM brain.reports WHERE id = p_report_id;
    IF v_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Relatório ID %s não encontrado.', p_report_id));
    END IF;

    UPDATE brain.reports
       SET status       = 'delivered',
           delivered_at = now(),
           updated_at   = now()
     WHERE id = p_report_id;

    RETURN jsonb_build_object(
        'status',    'success',
        'report_id', p_report_id,
        'title',     v_title,
        'message', format('Relatório "%s" marcado como entregue.', v_title)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.brain_deliver_report TO authenticated, service_role;
