-- ============================================================
-- v9.0 Batch Operations — RPCs de escrita em lote para Agent_Executor
-- ============================================================

-- ============================================================
-- 1. execute_batch_move_tasks  (mover todas as tarefas de um status para outro)
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_batch_move_tasks(
    p_session_id    TEXT    DEFAULT NULL,
    p_project_name  TEXT    DEFAULT NULL,
    p_project_id    BIGINT  DEFAULT NULL,
    p_from_status   TEXT    DEFAULT NULL,
    p_to_status     TEXT    DEFAULT NULL,
    p_limit         INT     DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_client_name  TEXT;
    v_moved_count  INT;
    v_task_titles  TEXT[];
    v_valid_statuses TEXT[] := ARRAY['backlog','in_progress','approval','done','paused'];
BEGIN
    -- Validar parâmetros obrigatórios
    IF p_from_status IS NULL OR p_to_status IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_from_status e p_to_status são obrigatórios.');
    END IF;

    IF NOT (p_from_status = ANY(v_valid_statuses)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Status origem "%s" inválido. Use: backlog, in_progress, approval, done ou paused.', p_from_status));
    END IF;

    IF NOT (p_to_status = ANY(v_valid_statuses)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Status destino "%s" inválido. Use: backlog, in_progress, approval, done ou paused.', p_to_status));
    END IF;

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
    ELSIF p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    IF p_project_id IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_project_id ou p_project_name é obrigatório.');
    END IF;

    -- Coletar títulos das tarefas que serão movidas (para retornar ao usuário)
    SELECT array_agg(pt.title ORDER BY pt.created_at)
      INTO v_task_titles
      FROM (
          SELECT title, created_at
            FROM project_tasks
           WHERE project_id = p_project_id
             AND status = p_from_status
           LIMIT p_limit
      ) pt;

    -- Executar atualização em lote
    UPDATE project_tasks
       SET status = p_to_status
     WHERE project_id = p_project_id
       AND status = p_from_status
       AND id IN (
           SELECT id FROM project_tasks
            WHERE project_id = p_project_id
              AND status = p_from_status
            LIMIT p_limit
       );

    GET DIAGNOSTICS v_moved_count = ROW_COUNT;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'batch_move_tasks', 'success',
            jsonb_build_object('project_id',p_project_id,'from_status',p_from_status,'to_status',p_to_status,'client_name',v_client_name,'limit',p_limit),
            jsonb_build_object('moved_count',v_moved_count), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    IF v_moved_count = 0 THEN
        RETURN jsonb_build_object(
            'status','info',
            'moved_count', 0,
            'task_titles', '[]'::jsonb,
            'message', format('Nenhuma tarefa encontrada em "%s"%s.',
                p_from_status,
                CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
        );
    END IF;

    RETURN jsonb_build_object(
        'status','success',
        'moved_count', v_moved_count,
        'task_titles', to_jsonb(coalesce(v_task_titles, '{}'::TEXT[])),
        'message', format('%s tarefa(s) movida(s) de "%s" para "%s"%s.',
            v_moved_count, p_from_status, p_to_status,
            CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.execute_batch_move_tasks TO authenticated, service_role;


-- ============================================================
-- 2. execute_batch_delete_tasks  (deletar todas as tarefas de um status)
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_batch_delete_tasks(
    p_session_id    TEXT    DEFAULT NULL,
    p_project_name  TEXT    DEFAULT NULL,
    p_project_id    BIGINT  DEFAULT NULL,
    p_status        TEXT    DEFAULT NULL,
    p_limit         INT     DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_client_name    TEXT;
    v_deleted_count  INT;
    v_task_titles    TEXT[];
    v_valid_statuses TEXT[] := ARRAY['backlog','in_progress','approval','done','paused'];
BEGIN
    -- Validar parâmetros obrigatórios
    IF p_status IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_status é obrigatório para indicar quais tarefas deletar.');
    END IF;

    IF NOT (p_status = ANY(v_valid_statuses)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Status "%s" inválido. Use: backlog, in_progress, approval, done ou paused.', p_status));
    END IF;

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
    ELSIF p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    IF p_project_id IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_project_id ou p_project_name é obrigatório.');
    END IF;

    -- Coletar títulos das tarefas que serão deletadas (para retornar ao usuário)
    SELECT array_agg(pt.title ORDER BY pt.created_at)
      INTO v_task_titles
      FROM (
          SELECT title, created_at
            FROM project_tasks
           WHERE project_id = p_project_id
             AND status = p_status
           LIMIT p_limit
      ) pt;

    -- Executar deleção em lote
    DELETE FROM project_tasks
     WHERE id IN (
         SELECT id FROM project_tasks
          WHERE project_id = p_project_id
            AND status = p_status
          LIMIT p_limit
     );

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'batch_delete_tasks', 'success',
            jsonb_build_object('project_id',p_project_id,'status',p_status,'client_name',v_client_name,'limit',p_limit),
            jsonb_build_object('deleted_count',v_deleted_count), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    IF v_deleted_count = 0 THEN
        RETURN jsonb_build_object(
            'status','info',
            'deleted_count', 0,
            'task_titles', '[]'::jsonb,
            'message', format('Nenhuma tarefa encontrada com status "%s"%s.',
                p_status,
                CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
        );
    END IF;

    RETURN jsonb_build_object(
        'status','success',
        'deleted_count', v_deleted_count,
        'task_titles', to_jsonb(coalesce(v_task_titles, '{}'::TEXT[])),
        'message', format('%s tarefa(s) com status "%s" deletada(s)%s.',
            v_deleted_count, p_status,
            CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.execute_batch_delete_tasks TO authenticated, service_role;
