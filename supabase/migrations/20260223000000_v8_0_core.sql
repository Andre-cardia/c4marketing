-- Migração v8.0 (REVISADA): Infraestrutura de Observabilidade do Segundo Cérebro
-- Data: 23 de Fevereiro de 2026

-- 0. Garantir existência do schema brain
CREATE SCHEMA IF NOT EXISTS brain;

-- 1. Tabela de Logs de Execução para Agentes
CREATE TABLE IF NOT EXISTS brain.execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT, -- ID opcional da mensagem do chat
    session_id TEXT NOT NULL,
    user_id UUID,
    agent_name TEXT NOT NULL,
    action TEXT NOT NULL, -- Ex: 'create_task', 'update_project', 'sql_query'
    status TEXT NOT NULL, -- 'success', 'error', 'pending'
    params JSONB DEFAULT '{}'::jsonb,
    result JSONB DEFAULT '{}'::jsonb,
    latency_ms INTEGER,
    cost_est NUMERIC(10, 6), -- Custo estimado em USD
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance de busca em logs
CREATE INDEX IF NOT EXISTS idx_execution_logs_session_id ON brain.execution_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_name ON brain.execution_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON brain.execution_logs(created_at);

-- 2. Evolução da Tabela de Sessões para Telemetria
-- Nota: Caso a tabela 'sessions' não esteja no schema brain, ajuste conforme necessário.
-- Como vi em sessões anteriores que 'sessions' é usada para chat-brain, assume-se schema brain ou public.
-- Pelo contexto do erro 42P01, o usuário tentou SELECT em brain.execution_logs.
DO $$ 
BEGIN 
    -- Verifica se a tabela brain.sessions existe antes de tentar alterá-la
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'brain' AND table_name = 'sessions') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'brain' AND table_name = 'sessions' AND column_name = 'total_latency_ms') THEN
            ALTER TABLE brain.sessions ADD COLUMN total_latency_ms INTEGER DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'brain' AND table_name = 'sessions' AND column_name = 'total_cost_est') THEN
            ALTER TABLE brain.sessions ADD COLUMN total_cost_est NUMERIC(10, 6) DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'brain' AND table_name = 'sessions' AND column_name = 'last_interaction_at') THEN
            ALTER TABLE brain.sessions ADD COLUMN last_interaction_at TIMESTAMPTZ DEFAULT now();
        END IF;
    END IF;
END $$;

-- 3. Curadoria de Memória: Flag de Verdade Canônica
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'brain' AND table_name = 'documents') THEN
        CREATE INDEX IF NOT EXISTS idx_brain_docs_canonical_truth 
        ON brain.documents (((metadata->>'is_canonical_truth')::boolean))
        WHERE (metadata->>'is_canonical_truth') IS NOT NULL;
    END IF;
END $$;

-- 4. Função para Registrar Logs de Execução (em public para compatibilidade com supabase.rpc())
CREATE OR REPLACE FUNCTION public.log_agent_execution(
    p_session_id TEXT,
    p_agent_name TEXT,
    p_action TEXT,
    p_status TEXT,
    p_params JSONB DEFAULT '{}'::jsonb,
    p_result JSONB DEFAULT '{}'::jsonb,
    p_latency_ms INTEGER DEFAULT 0,
    p_cost_est NUMERIC DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_message_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO brain.execution_logs (
        session_id, agent_name, action, status, params, result, 
        latency_ms, cost_est, error_message, message_id
    )
    VALUES (
        p_session_id, p_agent_name, p_action, p_status, p_params, p_result,
        p_latency_ms, p_cost_est, p_error_message, p_message_id
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
EXCEPTION WHEN undefined_table OR undefined_schema THEN
    -- fail-safe: não bloqueia a operação se brain.execution_logs não existir
    RETURN NULL;
END;
$$;

-- Grant de acesso
GRANT USAGE ON SCHEMA brain TO authenticated;
GRANT USAGE ON SCHEMA brain TO service_role;
GRANT EXECUTE ON FUNCTION public.log_agent_execution TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_agent_execution TO service_role;
GRANT ALL ON brain.execution_logs TO service_role;
