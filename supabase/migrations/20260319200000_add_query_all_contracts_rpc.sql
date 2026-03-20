-- ============================================================
-- query_all_contracts: RPC dedicada para o Segundo Cérebro
--
-- Problema resolvido:
--   Agent_Contracts não tinha RPC SQL própria — dependia apenas
--   de RAG sobre documentos nunca indexados, causando alucinação.
--
--   query_all_proposals(accepted) retornava dados incompletos:
--   sem client_name, email, data de assinatura, serviços contratados.
--
-- Esta RPC une proposals + acceptances + projetos gerados,
-- fornecendo ao LLM dados estruturados e completos sobre contratos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_all_contracts(
    p_status        text    DEFAULT NULL,   -- NULL = todos | 'Ativo', 'Inativo', 'Suspenso', 'Cancelado', 'Finalizado'
    p_company_name  text    DEFAULT NULL,   -- busca parcial por nome da empresa
    p_limit         int     DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_agg(row ORDER BY row.signed_at DESC)
    INTO result
    FROM (
        SELECT
            -- Identificadores
            a.id                                            AS contract_id,
            p.id                                            AS proposal_id,
            p.slug                                          AS proposal_slug,

            -- Partes
            a.company_name,
            a.name                                          AS client_name,
            a.email                                         AS client_email,

            -- Datas contratuais
            a.status                                        AS contract_status,
            a.timestamp                                     AS signed_at,
            (a.timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS signed_date_brasilia,
            a.expiration_date,

            -- Condições financeiras (da proposta)
            p.monthly_fee,
            p.setup_fee,
            p.media_limit,
            p.contract_duration,
            p.services                                      AS proposal_services,

            -- Serviços efetivamente contratados (projetos gerados)
            EXISTS(SELECT 1 FROM traffic_projects    tp WHERE tp.acceptance_id = a.id) AS has_traffic,
            EXISTS(SELECT 1 FROM website_projects    wp WHERE wp.acceptance_id = a.id) AS has_website,
            EXISTS(SELECT 1 FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) AS has_landing_page,

            -- Status dos projetos
            (SELECT tp.survey_status     FROM traffic_projects tp     WHERE tp.acceptance_id = a.id LIMIT 1) AS traffic_survey_status,
            (SELECT wp.account_setup_status FROM website_projects wp  WHERE wp.acceptance_id = a.id LIMIT 1) AS website_setup_status,
            (SELECT lp.survey_status     FROM landing_page_projects lp WHERE lp.acceptance_id = a.id LIMIT 1) AS lp_survey_status

        FROM public.acceptances a
        LEFT JOIN public.proposals p ON p.id = a.proposal_id
        WHERE
            (p_status IS NULL OR a.status = p_status)
            AND (p_company_name IS NULL OR a.company_name ILIKE '%' || p_company_name || '%')
        ORDER BY a.timestamp DESC
        LIMIT COALESCE(p_limit, 50)
    ) row;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_all_contracts(text, text, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.query_all_contracts IS
    'Retorna contratos (aceites) com dados completos: cliente, datas, condições financeiras e serviços contratados.
     Parâmetros: p_status (Ativo/Inativo/...), p_company_name (busca parcial), p_limit.';
