-- ============================================================
-- v8.0 Executor Tools — RPCs de escrita para Agent_Executor
-- ============================================================

-- ============================================================
-- 1. execute_create_traffic_task  (criar tarefa)
--    Aceita p_project_id (BIGINT) OU p_project_name (TEXT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_create_traffic_task(
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_task_id     UUID;
    v_client_name TEXT;
BEGIN
    -- Resolver projeto por nome se ID não fornecido
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        SELECT a.id, a.company_name
          INTO p_project_id, v_client_name
          FROM acceptances a
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado. Verifique o nome e tente novamente.', p_project_name));
        END IF;
    END IF;

    IF p_project_id IS NULL OR p_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_project_id (ou p_project_name) e p_title são obrigatórios.');
    END IF;

    -- Buscar nome do cliente se ainda não temos
    IF v_client_name IS NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    INSERT INTO project_tasks (project_id, title, description, due_date, priority, status, assignee)
    VALUES (p_project_id, p_title, p_description, p_due_date, p_priority, p_status, p_assignee)
    RETURNING id INTO v_task_id;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'create_task', 'success',
            jsonb_build_object('project_id',p_project_id,'title',p_title,'client_name',v_client_name),
            jsonb_build_object('task_id',v_task_id), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status','success',
        'task_id', v_task_id,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" criada (ID: %s) para %s.', p_title, v_task_id, coalesce(v_client_name,'desconhecido'))
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_create_traffic_task TO authenticated, service_role;
-- ============================================================
-- 2. execute_delete_task  (deletar tarefa)
--    Aceita p_task_id (UUID) OU p_task_title + p_project_id/name
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_delete_task(
    p_session_id      TEXT    DEFAULT NULL,
    p_project_id      BIGINT  DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_task_title      TEXT    DEFAULT NULL,
    p_task_id         UUID    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_deleted_title TEXT;
    v_client_name   TEXT;
BEGIN
    -- Resolver projeto por nome se necessário
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

    -- Buscar nome do cliente
    IF v_client_name IS NULL AND p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title para identificar a tarefa.');
    END IF;

    -- Resolver tarefa por título se ID não fornecido
    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title
          INTO p_task_id, v_deleted_title
          FROM project_tasks pt
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at DESC
         LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada%s.',
                    p_task_title,
                    CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END));
        END IF;
    ELSE
        SELECT pt.title INTO v_deleted_title FROM project_tasks pt WHERE pt.id = p_task_id;
        IF v_deleted_title IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa com ID %s não encontrada.', p_task_id));
        END IF;
    END IF;

    DELETE FROM project_tasks WHERE id = p_task_id;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'delete_task', 'success',
            jsonb_build_object('task_id',p_task_id,'title',v_deleted_title,'client_name',v_client_name),
            jsonb_build_object('deleted',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status','success',
        'deleted_task_id', p_task_id,
        'deleted_title', v_deleted_title,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" deletada com sucesso%s.',
            v_deleted_title,
            CASE WHEN v_client_name IS NOT NULL THEN ' do projeto ' || v_client_name ELSE '' END)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_delete_task TO authenticated, service_role;
-- ============================================================
-- 3. execute_move_task  (mover tarefa entre colunas do Kanban)
--    Status válidos: backlog, in_progress, approval, done, paused
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_move_task(
    p_session_id      TEXT    DEFAULT NULL,
    p_project_id      BIGINT  DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_task_title      TEXT    DEFAULT NULL,
    p_task_id         UUID    DEFAULT NULL,
    p_new_status      TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_task_title   TEXT;
    v_old_status   TEXT;
    v_client_name  TEXT;
    v_valid_statuses TEXT[] := ARRAY['backlog','in_progress','approval','done','paused'];
BEGIN
    -- Validar status
    IF p_new_status IS NULL OR NOT (p_new_status = ANY(v_valid_statuses)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Status "%s" inválido. Use: backlog, in_progress, approval, done ou paused.',
                coalesce(p_new_status,'(vazio)')));
    END IF;

    -- Resolver projeto por nome se necessário
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

    -- Buscar nome do cliente
    IF v_client_name IS NULL AND p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title para identificar a tarefa.');
    END IF;

    -- Resolver tarefa por título se ID não fornecido
    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title, pt.status
          INTO p_task_id, v_task_title, v_old_status
          FROM project_tasks pt
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at DESC
         LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada%s.',
                    p_task_title,
                    CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END));
        END IF;
    ELSE
        SELECT pt.title, pt.status INTO v_task_title, v_old_status FROM project_tasks pt WHERE pt.id = p_task_id;
        IF v_task_title IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa com ID %s não encontrada.', p_task_id));
        END IF;
    END IF;

    -- Já está no status desejado?
    IF v_old_status = p_new_status THEN
        RETURN jsonb_build_object('status','info',
            'message', format('Tarefa "%s" já está em "%s".', v_task_title, p_new_status));
    END IF;

    UPDATE project_tasks SET status = p_new_status WHERE id = p_task_id;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'move_task', 'success',
            jsonb_build_object('task_id',p_task_id,'title',v_task_title,'from',v_old_status,'to',p_new_status,'client_name',v_client_name),
            jsonb_build_object('moved',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status','success',
        'task_id', p_task_id,
        'task_title', v_task_title,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" movida de "%s" para "%s"%s.',
            v_task_title, v_old_status, p_new_status,
            CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_move_task TO authenticated, service_role;
-- ============================================================
-- 4. execute_update_project_status (já existia, adicionar p_project_name)
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_update_project_status(
    p_session_id      TEXT    DEFAULT NULL,
    p_project_id      UUID    DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_new_status      TEXT    DEFAULT NULL,
    p_notes           TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_old_status  TEXT;
    v_table       TEXT;
    v_client_name TEXT;
BEGIN
    IF p_new_status IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_new_status é obrigatório.');
    END IF;

    -- Resolver projeto por nome se UUID não fornecido
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        -- Tenta traffic_projects primeiro
        SELECT tp.id INTO p_project_id
          FROM traffic_projects tp
          JOIN acceptances a ON a.id = tp.acceptance_id
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            SELECT lp.id INTO p_project_id
              FROM landing_page_projects lp
              JOIN acceptances a ON a.id = lp.acceptance_id
             WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
             LIMIT 1;
        END IF;
        IF p_project_id IS NULL THEN
            SELECT wp.id INTO p_project_id
              FROM website_projects wp
              JOIN acceptances a ON a.id = wp.acceptance_id
             WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
             LIMIT 1;
        END IF;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    END IF;

    IF p_project_id IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_project_id ou p_project_name é obrigatório.');
    END IF;

    -- Identificar tabela e status atual
    SELECT tp.status, 'traffic_projects', a.company_name
      INTO v_old_status, v_table, v_client_name
      FROM traffic_projects tp
      JOIN acceptances a ON a.id = tp.acceptance_id
     WHERE tp.id = p_project_id;

    IF v_old_status IS NULL THEN
        SELECT lp.status, 'landing_page_projects', a.company_name
          INTO v_old_status, v_table, v_client_name
          FROM landing_page_projects lp
          JOIN acceptances a ON a.id = lp.acceptance_id
         WHERE lp.id = p_project_id;
    END IF;

    IF v_old_status IS NULL THEN
        SELECT wp.status, 'website_projects', a.company_name
          INTO v_old_status, v_table, v_client_name
          FROM website_projects wp
          JOIN acceptances a ON a.id = wp.acceptance_id
         WHERE wp.id = p_project_id;
    END IF;

    IF v_old_status IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Projeto %s não encontrado em nenhuma tabela de projetos.', p_project_id));
    END IF;

    EXECUTE format('UPDATE %I SET status = $1 WHERE id = $2', v_table)
    USING p_new_status, p_project_id;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'update_project_status', 'success',
            jsonb_build_object('project_id',p_project_id,'from',v_old_status,'to',p_new_status,'table',v_table,'client_name',v_client_name),
            jsonb_build_object('updated',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status','success',
        'project_id', p_project_id,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'client_name', v_client_name,
        'message', format('Projeto %s (%s) atualizado de "%s" para "%s".', coalesce(v_client_name,'desconhecido'), v_table, v_old_status, p_new_status)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_update_project_status TO authenticated, service_role;
-- ============================================================
-- 5. execute_update_task  (atualizar campos de tarefa existente)
--    Aceita p_task_id (UUID) OU p_task_title + p_project_id/name
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_update_task(
    p_session_id      TEXT    DEFAULT NULL,
    p_project_id      BIGINT  DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_task_title      TEXT    DEFAULT NULL,
    p_task_id         UUID    DEFAULT NULL,
    p_new_title       TEXT    DEFAULT NULL,
    p_new_description TEXT    DEFAULT NULL,
    p_new_due_date    DATE    DEFAULT NULL,
    p_new_priority    TEXT    DEFAULT NULL,
    p_new_assignee    TEXT    DEFAULT NULL,
    p_idempotency_key TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_task_title   TEXT;
    v_client_name  TEXT;
    v_changes      TEXT[] := '{}';
BEGIN
    -- Resolver projeto por nome se necessário
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

    -- Buscar nome do cliente
    IF v_client_name IS NULL AND p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title para identificar a tarefa.');
    END IF;

    -- Resolver tarefa por título se ID não fornecido
    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title
          INTO p_task_id, v_task_title
          FROM project_tasks pt
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at DESC
         LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada%s.',
                    p_task_title,
                    CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END));
        END IF;
    ELSE
        SELECT pt.title INTO v_task_title FROM project_tasks pt WHERE pt.id = p_task_id;
        IF v_task_title IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa com ID %s não encontrada.', p_task_id));
        END IF;
    END IF;

    -- Aplicar atualizações condicionais
    IF p_new_title IS NOT NULL THEN
        UPDATE project_tasks SET title = p_new_title WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'título');
    END IF;
    IF p_new_description IS NOT NULL THEN
        UPDATE project_tasks SET description = p_new_description WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'descrição');
    END IF;
    IF p_new_due_date IS NOT NULL THEN
        UPDATE project_tasks SET due_date = p_new_due_date WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'prazo');
    END IF;
    IF p_new_priority IS NOT NULL THEN
        UPDATE project_tasks SET priority = p_new_priority WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'prioridade');
    END IF;
    IF p_new_assignee IS NOT NULL THEN
        UPDATE project_tasks SET assignee = p_new_assignee WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'responsável');
    END IF;

    IF array_length(v_changes, 1) IS NULL OR array_length(v_changes, 1) = 0 THEN
        RETURN jsonb_build_object('status','info',
            'message','Nenhum campo para atualizar foi informado.');
    END IF;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'update_task', 'success',
            jsonb_build_object('task_id',p_task_id,'title',v_task_title,'changes',array_to_string(v_changes,', '),'client_name',v_client_name),
            jsonb_build_object('updated',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status','success',
        'task_id', p_task_id,
        'task_title', coalesce(p_new_title, v_task_title),
        'changes', array_to_string(v_changes, ', '),
        'client_name', v_client_name,
        'message', format('Tarefa "%s" atualizada (%s)%s.',
            coalesce(p_new_title, v_task_title),
            array_to_string(v_changes, ', '),
            CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_update_task TO authenticated, service_role;
