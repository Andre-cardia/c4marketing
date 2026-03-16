-- ============================================================
-- SEGURANÇA CRÍTICA: Corrige acesso público irrestrito a proposals
-- Remove policy TO public USING (true) que expõe todas as propostas.
-- Substitui por:
--   - authenticated: leitura livre (gestores e clientes autenticados)
--   - anon: apenas via RPC get_proposal_by_slug (por slug específico)
-- ============================================================

-- 1. Remover política permissiva pública
DROP POLICY IF EXISTS "Public proposals access" ON public.proposals;

-- 2. Usuários autenticados podem ler propostas
--    (gestores veem todas; controle adicional pode ser aplicado via RLS por role)
CREATE POLICY "authenticated_can_read_proposals"
  ON public.proposals
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. RPC pública para acesso por slug (clientes/prospects via link)
--    Retorna apenas a proposta correspondente ao slug — nunca lista todas.
CREATE OR REPLACE FUNCTION public.get_proposal_by_slug(p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'Slug invalido';
  END IF;

  SELECT row_to_json(p)
    INTO result
    FROM (
      SELECT
        id, title, slug, description,
        monthly_fee, setup_fee, validity_days,
        services, status, created_at
      FROM public.proposals
      WHERE slug = trim(p_slug)
        AND status = 'active'
      LIMIT 1
    ) p;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Proposta nao encontrada ou inativa';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_proposal_by_slug(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_proposal_by_slug IS
  'Acesso publico controlado: retorna apenas UMA proposta pelo slug. Nao permite listagem.';
