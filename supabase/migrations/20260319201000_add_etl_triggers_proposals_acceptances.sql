-- ============================================================
-- ETL Triggers: proposals e acceptances → brain.sync_queue
--
-- Problema: O trigger brain.handle_project_change só disparava
-- para tabelas de projetos. Propostas e aceites (contratos)
-- nunca eram indexados no banco vetorial, causando alucinação.
--
-- Solução: Adicionar fila e triggers dedicados para proposals
-- (BIGINT id) e acceptances (UUID id).
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Fila separada para proposals (id BIGINT, não UUID)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brain.proposals_sync_queue (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_table    TEXT        NOT NULL,
    source_id       TEXT        NOT NULL, -- BIGINT ou UUID como text
    operation       TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    processed_at    TIMESTAMPTZ,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_sync_queue_status
    ON brain.proposals_sync_queue(status) WHERE status = 'pending';

-- ---------------------------------------------------------------
-- 2. Função de trigger unificada para proposals e acceptances
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION brain.handle_commercial_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_id   TEXT;
    target_table TEXT;
BEGIN
    IF TG_TABLE_NAME = 'proposals' THEN
        target_table := 'proposals';
        target_id    := COALESCE(NEW.id, OLD.id)::text;

    ELSIF TG_TABLE_NAME = 'acceptances' THEN
        target_table := 'acceptances';
        target_id    := COALESCE(NEW.id, OLD.id)::text;
    END IF;

    IF target_id IS NOT NULL THEN
        INSERT INTO brain.proposals_sync_queue (source_table, source_id, operation)
        VALUES (target_table, target_id, TG_OP);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------
-- 3. Triggers em proposals
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS T_brain_sync_proposals ON public.proposals;
CREATE TRIGGER T_brain_sync_proposals
    AFTER INSERT OR UPDATE OR DELETE ON public.proposals
    FOR EACH ROW EXECUTE FUNCTION brain.handle_commercial_change();

-- ---------------------------------------------------------------
-- 4. Triggers em acceptances
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS T_brain_sync_acceptances ON public.acceptances;
CREATE TRIGGER T_brain_sync_acceptances
    AFTER INSERT OR UPDATE OR DELETE ON public.acceptances
    FOR EACH ROW EXECUTE FUNCTION brain.handle_commercial_change();

-- ---------------------------------------------------------------
-- 5. RPC para o brain-sync buscar itens pendentes desta fila
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_commercial_sync_items(
    p_limit int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE result json;
BEGIN
    -- Marcar como 'processing' atomicamente
    WITH selected AS (
        SELECT id FROM brain.proposals_sync_queue
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT COALESCE(p_limit, 10)
        FOR UPDATE SKIP LOCKED
    )
    UPDATE brain.proposals_sync_queue q
    SET status = 'processing'
    FROM selected
    WHERE q.id = selected.id;

    SELECT json_agg(row)
    INTO result
    FROM (
        SELECT id, source_table, source_id, operation
        FROM brain.proposals_sync_queue
        WHERE status = 'processing'
        ORDER BY created_at
        LIMIT COALESCE(p_limit, 10)
    ) row;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_commercial_sync_items(int) TO service_role;

-- ---------------------------------------------------------------
-- 6. RPC para atualizar status de item da fila commercial
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_commercial_sync_item_status(
    p_id            BIGINT,
    p_status        TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, brain
AS $$
BEGIN
    UPDATE brain.proposals_sync_queue
    SET
        status        = p_status,
        processed_at  = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE processed_at END,
        error_message = p_error_message
    WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_commercial_sync_item_status(bigint, text, text) TO service_role;
