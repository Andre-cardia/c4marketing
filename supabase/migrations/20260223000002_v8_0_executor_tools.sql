-- Migração v8.0: Ferramentas de Escrita para Agentes (Task & Project Management)
-- Data: 23 de Fevereiro de 2026

-- 1. RPC para Criar Tarefa de Tráfego de forma segura
CREATE OR REPLACE FUNCTION brain.execute_create_traffic_task(
    p_session_id TEXT,
    p_client_id UUID,
    p_project_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_due_date DATE DEFAULT NULL,
    p_priority TEXT DEFAULT 'medium',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task_id UUID;
    v_log_id UUID;
BEGIN
    -- Verificação de Idempotência
    IF p_idempotency_key IS NOT NULL AND EXISTS (
        SELECT 1 FROM brain.execution_logs 
        WHERE session_id = p_session_id AND params->>'idempotency_key' = p_idempotency_key
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Duplicated action (idempotency)');
    END IF;

    -- Inserção na tabela de tarefas (assumindo a estrutura existente de traffic_projects ou similar)
    -- Nota: Aqui usamos as tabelas reais do sistema. No caso, tasks/projects.
    INSERT INTO public.tasks (
        client_id, project_id, title, description, due_date, priority, status
    )
    VALUES (
        p_client_id, p_project_id, p_title, p_description, p_due_date, p_priority, 'pending'
    )
    RETURNING id INTO v_task_id;

    -- Log de Execução Auditado
    PERFORM brain.log_agent_execution(
        p_session_id,
        'Agent_Executor',
        'create_task',
        'success',
        jsonb_build_object(
            'idempotency_key', p_idempotency_key,
            'client_id', p_client_id,
            'project_id', p_project_id,
            'title', p_title
        ),
        jsonb_build_object('task_id', v_task_id)
    );

    RETURN jsonb_build_object(
        'status', 'success', 
        'task_id', v_task_id, 
        'message', 'Tarefa criada com sucesso e auditada.'
    );
END;
$$;

-- 2. RPC para Atualizar Status de Projeto
CREATE OR REPLACE FUNCTION brain.execute_update_project_status(
    p_session_id TEXT,
    p_project_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    -- Verificação de Idempotência
    IF p_idempotency_key IS NOT NULL AND EXISTS (
        SELECT 1 FROM brain.execution_logs 
        WHERE session_id = p_session_id AND params->>'idempotency_key' = p_idempotency_key
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Duplicated action (idempotency)');
    END IF;

    -- Atualização do Projeto
    UPDATE public.traffic_projects
    SET 
        status = p_new_status,
        updated_at = now()
    WHERE id = p_project_id;

    -- Registrar como "Nota de Sistema" ou histórico se necessário
    -- ...

    -- Log de Execução Auditado
    PERFORM brain.log_agent_execution(
        p_session_id,
        'Agent_Executor',
        'update_project_status',
        'success',
        jsonb_build_object(
            'idempotency_key', p_idempotency_key,
            'project_id', p_project_id,
            'new_status', p_new_status
        ),
        jsonb_build_object('updated_at', now())
    );

    RETURN jsonb_build_object(
        'status', 'success', 
        'message', 'Status do projeto atualizado com sucesso.'
    );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION brain.execute_create_traffic_task TO authenticated;
GRANT EXECUTE ON FUNCTION brain.execute_update_project_status TO authenticated;
GRANT EXECUTE ON FUNCTION brain.execute_create_traffic_task TO service_role;
GRANT EXECUTE ON FUNCTION brain.execute_update_project_status TO service_role;
