-- ============================================================
-- Fix: query_all_contracts — incluir cronograma de parcelas
--
-- Problema: setup_fee era retornado como valor total (9500),
-- sem indicar se é parcelado. O brain dizia "não há evidência
-- de parcelamento" mesmo com parcelas registradas.
--
-- Fix: adicionar payment_installments (array de parcelas) e
-- installments_count ao retorno, lendo de
-- acceptance_financial_installments.
-- ============================================================

CREATE OR REPLACE FUNCTION public.query_all_contracts(
    p_status       text DEFAULT NULL,
    p_company_name text DEFAULT NULL,
    p_limit        int  DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_agg(row ORDER BY row.signed_at DESC)
    INTO result
    FROM (
        SELECT
            a.id                                            AS contract_id,
            p.id                                            AS proposal_id,
            p.slug                                          AS proposal_slug,
            a.company_name,
            a.name                                          AS client_name,
            a.email                                         AS client_email,
            a.status                                        AS contract_status,
            a.timestamp                                     AS signed_at,
            (a.timestamp AT TIME ZONE 'America/Sao_Paulo')::date AS signed_date_brasilia,
            a.expiration_date,
            p.monthly_fee,
            p.setup_fee,
            p.media_limit,
            p.contract_duration,
            p.services                                      AS proposal_services,
            EXISTS(SELECT 1 FROM traffic_projects    tp WHERE tp.acceptance_id = a.id) AS has_traffic,
            EXISTS(SELECT 1 FROM website_projects    wp WHERE wp.acceptance_id = a.id) AS has_website,
            EXISTS(SELECT 1 FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) AS has_landing_page,
            (SELECT tp.survey_status     FROM traffic_projects tp     WHERE tp.acceptance_id = a.id LIMIT 1) AS traffic_survey_status,
            (SELECT wp.account_setup_status FROM website_projects wp  WHERE wp.acceptance_id = a.id LIMIT 1) AS website_setup_status,
            (SELECT lp.survey_status     FROM landing_page_projects lp WHERE lp.acceptance_id = a.id LIMIT 1) AS lp_survey_status,
            -- Cronograma de parcelas do setup fee
            (
                SELECT COUNT(*)
                FROM acceptance_financial_installments i
                WHERE i.acceptance_id = a.id
            )::int                                          AS installments_count,
            (
                SELECT json_agg(
                    json_build_object(
                        'id',            i.id,
                        'amount',        i.amount::numeric,
                        'expected_date', i.expected_date,
                        'label',         i.label
                    )
                    ORDER BY i.expected_date ASC
                )
                FROM acceptance_financial_installments i
                WHERE i.acceptance_id = a.id
            )                                               AS payment_installments
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
