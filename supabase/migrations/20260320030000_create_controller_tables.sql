-- ============================================================
-- Controller Observability Tables
--
-- Persiste cada observation do loop ReAct e cada sessão do
-- Controller para auditoria, debug e consulta pelo brain.
--
-- Tabelas:
--   controller_observations  — 1 linha por tool call no loop
--   controller_sessions      — 1 linha por execução do Controller
-- ============================================================

-- -----------------------------------------------------------
-- 1. Observações individuais (uma por tool call)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.controller_observations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_run_id  text        NOT NULL,   -- sessionId + '_' + timestamp
    user_id         uuid,
    agent_name      text,
    iteration       int,
    tool_name       text,
    tool_input      jsonb,
    raw_output      text,                   -- output original (cap 5000 chars)
    summary         text,                   -- versão compactada (perception)
    signal_kind     text CHECK (signal_kind IN ('data','empty','error','partial')),
    row_count       int,
    key_facts       text[],
    success         boolean,
    needs_retry     boolean     DEFAULT false,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctrl_obs_session    ON public.controller_observations (session_run_id);
CREATE INDEX IF NOT EXISTS idx_ctrl_obs_user       ON public.controller_observations (user_id);
CREATE INDEX IF NOT EXISTS idx_ctrl_obs_tool       ON public.controller_observations (tool_name);
CREATE INDEX IF NOT EXISTS idx_ctrl_obs_created    ON public.controller_observations (created_at DESC);

ALTER TABLE public.controller_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestor_access_ctrl_obs" ON public.controller_observations
    FOR ALL TO authenticated
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.id = auth.uid() AND u.role IN ('gestor','admin')
    ));

-- -----------------------------------------------------------
-- 2. Sessões (uma por execução completa do Controller)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.controller_sessions (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_run_id  text        UNIQUE NOT NULL,
    user_id         uuid,
    agent_name      text,
    query           text,
    answer          text,
    iterations      int,
    obs_count       int,
    eval_score      numeric(5,4),
    eval_pass       boolean,
    total_cost_est  numeric(12,8),
    total_input_tokens  int,
    total_output_tokens int,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctrl_sess_user    ON public.controller_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ctrl_sess_created ON public.controller_sessions (created_at DESC);

ALTER TABLE public.controller_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestor_access_ctrl_sess" ON public.controller_sessions
    FOR ALL TO authenticated
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.id = auth.uid() AND u.role IN ('gestor','admin')
    ));

-- -----------------------------------------------------------
-- 3. RPC de consulta (usada pelo brain e pelo dashboard)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.query_controller_sessions(
    p_limit int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_agg(s ORDER BY s.created_at DESC)
    INTO result
    FROM (
        SELECT
            cs.id,
            cs.session_run_id,
            cs.agent_name,
            cs.query,
            cs.answer,
            cs.iterations,
            cs.obs_count,
            cs.eval_score,
            cs.eval_pass,
            cs.total_cost_est,
            cs.created_at,
            -- Observações aninhadas
            (
                SELECT json_agg(o ORDER BY o.iteration ASC)
                FROM controller_observations o
                WHERE o.session_run_id = cs.session_run_id
            ) AS observations
        FROM controller_sessions cs
        ORDER BY cs.created_at DESC
        LIMIT COALESCE(p_limit, 20)
    ) s;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_controller_sessions(int) TO authenticated, service_role;
GRANT INSERT, SELECT ON public.controller_observations TO service_role;
GRANT INSERT, SELECT ON public.controller_sessions     TO service_role;
