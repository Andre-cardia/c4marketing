-- ============================================================
-- query_recent_acceptances: RPC para o Segundo Cérebro
--
-- Problema resolvido:
--   query_all_proposals(p_status_filter='accepted') retornava TODAS
--   as propostas aceitas sem timestamp, fazendo o LLM identificar
--   aceites antigos como "de hoje".
--
-- Esta RPC retorna os aceites mais recentes com timestamp, nome do
--   cliente, empresa e serviços — permitindo filtrar por data exata.
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_recent_acceptances(
    p_date        date    DEFAULT NULL,   -- NULL = sem filtro de data
    p_limit       int     DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_agg(row ORDER BY row.acceptance_timestamp DESC)
    INTO result
    FROM (
        SELECT
            a.id                                        AS acceptance_id,
            a.name                                      AS client_name,
            a.email                                     AS client_email,
            a.company_name,
            a.status                                    AS acceptance_status,
            a.timestamp                                 AS acceptance_timestamp,
            (a.timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS acceptance_date_brasilia,
            p.id                                        AS proposal_id,
            p.slug                                      AS proposal_slug,
            p.monthly_fee,
            p.setup_fee,
            p.services
        FROM public.acceptances a
        LEFT JOIN public.proposals p ON p.id = a.proposal_id
        WHERE
            (p_date IS NULL OR (a.timestamp AT TIME ZONE 'America/Sao_Paulo')::date = p_date)
        ORDER BY a.timestamp DESC
        LIMIT COALESCE(p_limit, 10)
    ) row;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_recent_acceptances(date, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.query_recent_acceptances IS
    'Retorna os aceites mais recentes com timestamp. Use p_date (YYYY-MM-DD) para filtrar por data específica.';
