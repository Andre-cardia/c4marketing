-- Restore the text-signature overload of query_all_proposals.
-- Some database objects still call query_all_proposals(p_status_filter => ...),
-- and that overload is missing in production/local linked DB state.

CREATE OR REPLACE FUNCTION public.query_all_proposals(
  p_status_filter text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF (SELECT role FROM public.app_users WHERE id = auth.uid()) NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin e gestor podem listar todas as propostas.';
  END IF;

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
      (SELECT count(*) FROM public.acceptances a WHERE a.proposal_id = p.id) > 0 AS was_accepted,
      (SELECT a.status FROM public.acceptances a WHERE a.proposal_id = p.id LIMIT 1) AS acceptance_status
    FROM public.proposals p
    WHERE
      p_status_filter = 'all'
      OR (p_status_filter = 'open' AND NOT EXISTS (
        SELECT 1
        FROM public.acceptances a
        WHERE a.proposal_id = p.id
      ))
      OR (p_status_filter = 'accepted' AND EXISTS (
        SELECT 1
        FROM public.acceptances a
        WHERE a.proposal_id = p.id
      ))
  ) p;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.query_all_proposals()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.query_all_proposals('all');
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_proposals(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_proposals() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
