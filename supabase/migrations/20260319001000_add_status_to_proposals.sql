-- ============================================================
-- FIX: Adiciona coluna status à tabela proposals
--
-- Raiz do erro "Ocorreu um erro ao salvar":
--   A migração 20260313203000_fix_submit_acceptance_duplicate
--   adicionou SELECT status FROM proposals na RPC, mas a coluna
--   nunca foi criada. Isto causava:
--     ERROR: column "status" does not exist
--
-- Esta migração:
--   1. Adiciona status TEXT NOT NULL DEFAULT 'active' a proposals
--   2. Restaura política de leitura pública apenas para propostas ativas
--      (a 20260313202000 removeu o acesso anônimo sem substituto funcional)
-- ============================================================

-- 1. Adicionar coluna status (todos os registros existentes ficam 'active')
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2. Política anônima: leitura apenas de propostas ativas
--    (necessária para clientes acessarem o link da proposta sem login)
DROP POLICY IF EXISTS "anon_can_read_active_proposals" ON public.proposals;
CREATE POLICY "anon_can_read_active_proposals"
    ON public.proposals
    FOR SELECT
    TO anon
    USING (status = 'active');

COMMENT ON COLUMN public.proposals.status IS
    'Status da proposta: active (disponível para aceite), inactive (encerrada/arquivada)';
