-- ============================================================
-- v9.0 Scheduled Tasks — Agendamento recorrente de tarefas
-- ============================================================

-- ============================================================
-- 1. Tabela scheduled_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      BIGINT      REFERENCES acceptances(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    description     TEXT,
    priority        TEXT        DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    assignee        TEXT,
    recurrence_rule TEXT        NOT NULL, -- ex: 'weekly_monday', 'daily', 'monthly_1st', 'weekly_friday'
    next_run        DATE        NOT NULL,
    status          TEXT        DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON public.scheduled_tasks (next_run) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_project_id ON public.scheduled_tasks (project_id);
-- RLS
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read scheduled_tasks" ON public.scheduled_tasks;
CREATE POLICY "Authenticated can read scheduled_tasks"
    ON public.scheduled_tasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role manages scheduled_tasks" ON public.scheduled_tasks;
CREATE POLICY "Service role manages scheduled_tasks"
    ON public.scheduled_tasks FOR ALL TO service_role USING (true);
GRANT SELECT ON public.scheduled_tasks TO authenticated;
GRANT ALL ON public.scheduled_tasks TO service_role;
-- ============================================================
-- 2. Função auxiliar: calcular próxima data de execução
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_next_run(
    p_rule TEXT,
    p_from DATE DEFAULT CURRENT_DATE
) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_next DATE;
    v_day_of_week INT; -- 0=Sunday, 1=Monday...6=Saturday
BEGIN
    CASE p_rule
        WHEN 'daily' THEN
            v_next := p_from + INTERVAL '1 day';

        WHEN 'weekly_monday' THEN
            -- Próxima segunda-feira após p_from
            v_day_of_week := EXTRACT(DOW FROM p_from)::INT; -- 0=Sun,1=Mon...
            v_next := p_from + ((8 - v_day_of_week) % 7 + (CASE WHEN v_day_of_week = 1 THEN 7 ELSE 0 END)) * INTERVAL '1 day';
            IF v_next <= p_from THEN v_next := v_next + INTERVAL '7 days'; END IF;

        WHEN 'weekly_friday' THEN
            v_day_of_week := EXTRACT(DOW FROM p_from)::INT;
            v_next := p_from + ((5 - v_day_of_week + 7) % 7) * INTERVAL '1 day';
            IF v_next <= p_from THEN v_next := v_next + INTERVAL '7 days'; END IF;

        WHEN 'weekly' THEN
            v_next := p_from + INTERVAL '7 days';

        WHEN 'biweekly' THEN
            v_next := p_from + INTERVAL '14 days';

        WHEN 'monthly_1st' THEN
            -- Primeiro dia do próximo mês
            v_next := date_trunc('month', p_from + INTERVAL '1 month')::DATE;

        WHEN 'monthly_15th' THEN
            -- Dia 15 do próximo mês (ou deste se ainda não passou)
            IF EXTRACT(DAY FROM p_from) < 15 THEN
                v_next := date_trunc('month', p_from)::DATE + 14;
            ELSE
                v_next := date_trunc('month', p_from + INTERVAL '1 month')::DATE + 14;
            END IF;

        WHEN 'monthly' THEN
            v_next := (p_from + INTERVAL '1 month')::DATE;

        ELSE
            -- Regra desconhecida → amanhã
            v_next := p_from + INTERVAL '1 day';
    END CASE;

    RETURN v_next;
END; $$;
-- ============================================================
-- 3. execute_schedule_task  (criar agendamento recorrente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_schedule_task(
    p_session_id      TEXT    DEFAULT NULL,
    p_project_name    TEXT    DEFAULT NULL,
    p_project_id      BIGINT  DEFAULT NULL,
    p_title           TEXT    DEFAULT NULL,
    p_recurrence_rule TEXT    DEFAULT NULL,
    p_description     TEXT    DEFAULT NULL,
    p_priority        TEXT    DEFAULT 'medium',
    p_assignee        TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_client_name TEXT;
    v_schedule_id UUID;
    v_next_run    DATE;
BEGIN
    -- Validar obrigatórios
    IF p_title IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_title é obrigatório.');
    END IF;
    IF p_recurrence_rule IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_recurrence_rule é obrigatório. Ex: daily, weekly_monday, monthly_1st.');
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
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    ELSIF p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;

    IF p_project_id IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_project_id ou p_project_name é obrigatório.');
    END IF;

    -- Calcular próxima execução
    v_next_run := public.calculate_next_run(p_recurrence_rule, CURRENT_DATE);

    -- Inserir agendamento
    INSERT INTO public.scheduled_tasks (
        project_id, title, description, priority, assignee,
        recurrence_rule, next_run, status, created_by
    ) VALUES (
        p_project_id, p_title, p_description, p_priority, p_assignee,
        p_recurrence_rule, v_next_run, 'active', coalesce(p_session_id,'sistema')
    ) RETURNING id INTO v_schedule_id;

    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'schedule_task', 'success',
            jsonb_build_object('project_id',p_project_id,'title',p_title,'rule',p_recurrence_rule,'client_name',v_client_name),
            jsonb_build_object('schedule_id',v_schedule_id,'next_run',v_next_run), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'status','success',
        'schedule_id', v_schedule_id,
        'next_run', v_next_run,
        'recurrence_rule', p_recurrence_rule,
        'client_name', v_client_name,
        'message', format('Tarefa recorrente "%s" agendada (%s), próxima execução em %s%s.',
            p_title, p_recurrence_rule, v_next_run,
            CASE WHEN v_client_name IS NOT NULL THEN ' para ' || v_client_name ELSE '' END)
    );
END; $$;
GRANT EXECUTE ON FUNCTION public.execute_schedule_task TO authenticated, service_role;
-- ============================================================
-- 4. run_scheduled_tasks  (chamada pelo pg_cron diariamente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_scheduled_tasks()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rec        RECORD;
    v_task_id    UUID;
    v_processed  INT := 0;
BEGIN
    FOR v_rec IN
        SELECT st.*, a.company_name AS client_name
          FROM public.scheduled_tasks st
          LEFT JOIN acceptances a ON a.id = st.project_id
         WHERE st.next_run <= CURRENT_DATE
           AND st.status = 'active'
    LOOP
        -- Criar tarefa no Kanban
        BEGIN
            INSERT INTO project_tasks (project_id, title, description, priority, status, assignee)
            VALUES (v_rec.project_id, v_rec.title, v_rec.description, v_rec.priority, 'backlog', v_rec.assignee)
            RETURNING id INTO v_task_id;

            -- Calcular próxima execução
            UPDATE public.scheduled_tasks
               SET next_run = public.calculate_next_run(v_rec.recurrence_rule, CURRENT_DATE)
             WHERE id = v_rec.id;

            v_processed := v_processed + 1;

            -- Log fail-safe
            BEGIN
                INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
                VALUES ('cron', 'Agent_Executor', 'run_scheduled_task', 'success',
                    jsonb_build_object('schedule_id',v_rec.id,'title',v_rec.title,'project_id',v_rec.project_id),
                    jsonb_build_object('task_id',v_task_id), 0);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

        EXCEPTION WHEN OTHERS THEN
            -- Fail-safe: continua os outros itens mesmo se um falhar
            BEGIN
                INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms, error_message)
                VALUES ('cron', 'Agent_Executor', 'run_scheduled_task', 'error',
                    jsonb_build_object('schedule_id',v_rec.id,'title',v_rec.title),
                    '{}', 0, SQLERRM);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END;
    END LOOP;

    RETURN v_processed;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_scheduled_tasks TO service_role;
-- ============================================================
-- pg_cron: ativar manualmente no painel do Supabase
-- Requer extensão pg_cron habilitada.
-- ============================================================
-- SELECT cron.schedule('run-scheduled-tasks', '0 6 * * *', 'SELECT run_scheduled_tasks()');;
