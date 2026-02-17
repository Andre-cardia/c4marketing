-- ============================================================
-- RPC: query_all_proposals (UPDATED)
-- Adiciona filtro de status para separar propostas abertas/aceitas
-- ============================================================

DROP FUNCTION IF EXISTS public.query_all_proposals();

CREATE OR REPLACE FUNCTION public.query_all_proposals(
  p_status_filter text DEFAULT 'all' -- 'all', 'open', 'accepted'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(p ORDER BY p.created_at DESC) INTO result
  FROM (
    SELECT
      p.id,
      p.slug,
      p.company_name,
      p.responsible_name,
      p.monthly_fee,
      p.setup_fee,
      p.media_limit,
      p.contract_duration,
      p.services,
      p.created_at,
      -- Verificar se foi aceita
      (SELECT count(*) FROM acceptances a WHERE a.proposal_id = p.id) > 0 AS was_accepted,
      (SELECT a.status FROM acceptances a WHERE a.proposal_id = p.id LIMIT 1) AS acceptance_status
    FROM proposals p
    WHERE 
        (p_status_filter = 'all') OR
        (p_status_filter = 'open' AND NOT EXISTS (SELECT 1 FROM acceptances a WHERE a.proposal_id = p.id)) OR
        (p_status_filter = 'accepted' AND EXISTS (SELECT 1 FROM acceptances a WHERE a.proposal_id = p.id))
  ) p;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_proposals(text) TO authenticated, service_role;
