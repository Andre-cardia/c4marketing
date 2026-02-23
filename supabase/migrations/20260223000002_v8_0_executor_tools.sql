-- Migração v8.0 (REVISADA): Ferramentas de Escrita para Agentes
-- Corrigido: funções em schema PUBLIC (compatível com supabase.rpc()),
-- tabela correta (project_tasks) e log de auditoria funcional.

-- 1. RPC para Criar Tarefa em project_tasks
CREATE OR REPLACE FUNCTION public.execute_create_traffic_task(
    p_session_id TEXT DEFAULT NULL,
    p_project_id BIGINT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_due_date DATE DEFAULT NULL,
    p_priority TEXT DEFAULT 'medium',
    p_status TEXT DEFAULT 'backlog',
    p_assignee TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task_id BIGINT;
    v_client_name TEXT;
BEGIN
    -- Validação básica
    IF p_project_id IS NULL OR p_title IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'p_project_id e p_title são obrigatórios.'
        );
    END IF;

    -- Verificação de Idempotência
    IF p_idempotency_key IS NOT NULL THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM brain.execution_logs 
                WHERE params->>'idempotency_key' = p_idempotency_key
                  AND status = 'success'
            ) THEN
                RETURN jsonb_build_object('status', 'skipped', 'message', 'Ação duplicada (idempotency_key já existe).');
            END IF;
        EXCEPTION WHEN undefined_table OR undefined_schema THEN
            -- brain.execution_logs pode não existir ainda, prosseguir
        END;
    END IF;

    -- Buscar nome do cliente para contexto
    SELECT a.company_name INTO v_client_name
    FROM acceptances a WHERE a.id = p_project_id;

    -- Inserção na tabela real de tarefas
    INSERT INTO project_tasks (
        project_id, title, description, due_date, priority, status, assignee
    )
    VALUES (
        p_project_id, p_title, p_description, p_due_date, p_priority, p_status, p_assignee
    )
    RETURNING id INTO v_task_id;

    -- Log de Execução Auditado (fail-safe)
    BEGIN
        INSERT INTO brain.execution_logs (
            session_id, agent_name, action, status, params, result, latency_ms
        ) VALUES (
            coalesce(p_session_id, 'unknown'),
            'Agent_Executor',
            'create_task',
            'success',
            jsonb_build_object(
                'idempotency_key', p_idempotency_key,
                'project_id', p_project_id,
                'title', p_title,
                'client_name', v_client_name
            ),
            jsonb_build_object('task_id', v_task_id),
            0
        );
    EXCEPTION WHEN undefined_table OR undefined_schema THEN
        -- Se brain.execution_logs não existir, a tarefa ainda foi criada
        RAISE WARNING 'brain.execution_logs não disponível para auditoria';
    END;

    RETURN jsonb_build_object(
        'status', 'success', 
        'task_id', v_task_id,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" criada com sucesso (ID: %s) para o cliente %s.', p_title, v_task_id, coalesce(v_client_name, 'desconhecido'))
    );
END;
$$;

-- 2. RPC para Atualizar Status de Projeto (traffic_projects)
CREATE OR REPLACE FUNCTION public.execute_update_project_status(
    p_session_id TEXT DEFAULT NULL,
    p_project_id UUID DEFAULT NULL,
    p_new_status TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_project_id IS NULL OR p_new_status IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'p_project_id e p_new_status são obrigatórios.'
        );
    END IF;

    -- Verificação de Idempotência
    IF p_idempotency_key IS NOT NULL THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM brain.execution_logs 
                WHERE params->>'idempotency_key' = p_idempotency_key
                  AND status = 'success'
            ) THEN
                RETURN jsonb_build_object('status', 'skipped', 'message', 'Ação duplicada (idempotency_key já existe).');
            END IF;
        EXCEPTION WHEN undefined_table OR undefined_schema THEN
            NULL;
        END;
    END IF;

    -- Atualização do Projeto
    UPDATE traffic_projects
    SET status = p_new_status, updated_at = now()
    WHERE id = p_project_id;

    -- Log de Execução Auditado (fail-safe)
    BEGIN
        INSERT INTO brain.execution_logs (
            session_id, agent_name, action, status, params, result, latency_ms
        ) VALUES (
            coalesce(p_session_id, 'unknown'),
            'Agent_Executor',
            'update_project_status',
            'success',
            jsonb_build_object(
                'idempotency_key', p_idempotency_key,
                'project_id', p_project_id,
                'new_status', p_new_status,
                'notes', p_notes
            ),
            jsonb_build_object('updated_at', now()),
            0
        );
    EXCEPTION WHEN undefined_table OR undefined_schema THEN
        RAISE WARNING 'brain.execution_logs não disponível para auditoria';
    END;

    RETURN jsonb_build_object(
        'status', 'success', 
        'message', format('Status do projeto atualizado para "%s".', p_new_status)
    );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.execute_create_traffic_task TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_update_project_status TO authenticated, service_role;
