-- ============================================================
-- v9.0 Notifications — Trigger de atribuição de tarefas → notices
-- ============================================================

-- Função chamada pelo trigger
CREATE OR REPLACE FUNCTION public.notify_task_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_project_name TEXT;
BEGIN
    -- Só dispara se o assignee mudou (nova atribuição)
    IF (OLD.assignee IS NOT DISTINCT FROM NEW.assignee) THEN
        RETURN NEW;
    END IF;

    -- Só processa se há um novo assignee
    IF NEW.assignee IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar nome do projeto
    SELECT a.company_name
      INTO v_project_name
      FROM acceptances a
     WHERE a.id = NEW.project_id
     LIMIT 1;

    -- Inserir aviso no mural de avisos
    BEGIN
        INSERT INTO notices (message, author_email, author_name, priority)
        VALUES (
            format('Você foi atribuído à tarefa "%s" no projeto %s.',
                NEW.title,
                coalesce(v_project_name, 'desconhecido')),
            'sistema@c4marketing.com.br',
            'Sistema',
            'importante'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Fail-safe: não bloquear a atualização da tarefa por falha na notificação
        NULL;
    END;

    RETURN NEW;
END; $$;
-- Criar trigger na tabela project_tasks
DROP TRIGGER IF EXISTS trg_task_assignee_notify ON project_tasks;
CREATE TRIGGER trg_task_assignee_notify
    AFTER INSERT OR UPDATE ON project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_assignee();
-- Habilitar realtime na tabela notices para o frontend receber atualizações em tempo real
-- (Execute manualmente no painel do Supabase se necessário):
-- ALTER TABLE notices REPLICA IDENTITY FULL;
-- SELECT supabase_realtime.quote_wal2json('{notices}'::name[]);;
