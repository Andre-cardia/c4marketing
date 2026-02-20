-- Align query_financial_summary with CommercialDashboard logic.
-- Fixes MRR/ARR mismatch by:
-- 1) reading contract_snapshot.proposal.value fallback,
-- 2) considering contracts accepted up to reference_date,
-- 3) treating active-like statuses consistently with dashboard.

CREATE OR REPLACE FUNCTION public.query_financial_summary(
  p_reference_date date DEFAULT NULL,
  p_status text DEFAULT 'Ativo',
  p_company_name text DEFAULT NULL,
  p_reference_tz text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_reference_date date;
  v_status_norm text;
BEGIN
  v_reference_date := COALESCE(
    p_reference_date,
    CASE
      WHEN nullif(trim(coalesce(p_reference_tz, '')), '') IS NULL
        THEN CURRENT_DATE
      ELSE (now() AT TIME ZONE p_reference_tz)::date
    END
  );

  v_status_norm := nullif(lower(trim(coalesce(p_status, ''))), '');

  WITH contract_base AS (
    SELECT
      a.id,
      a.id::text AS acceptance_id,
      a.proposal_id,
      a.company_name,
      a.status AS client_status,
      a.timestamp AS accepted_at,
      a.expiration_date,
      COALESCE(
        public.parse_financial_numeric(p.monthly_fee::text),
        public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,monthly_fee}'),
        public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,value}'),
        public.parse_financial_numeric(a.contract_snapshot ->> 'monthly_fee'),
        public.parse_financial_numeric(a.contract_snapshot ->> 'value'),
        0::numeric
      ) AS monthly_fee,
      COALESCE(
        public.parse_financial_numeric(p.setup_fee::text),
        public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
        public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
        0::numeric
      ) AS setup_fee,
      EXISTS (SELECT 1 FROM traffic_projects tp WHERE tp.acceptance_id = a.id) AS has_traffic,
      EXISTS (SELECT 1 FROM website_projects wp WHERE wp.acceptance_id = a.id) AS has_website,
      EXISTS (SELECT 1 FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) AS has_landing_page
    FROM acceptances a
    LEFT JOIN proposals p ON p.id = a.proposal_id
    WHERE (p_company_name IS NULL OR a.company_name ILIKE '%' || p_company_name || '%')
      AND (
        v_status_norm IS NULL
        OR (
          v_status_norm = 'ativo'
          AND (
            nullif(trim(coalesce(a.status, '')), '') IS NULL
            OR lower(trim(a.status)) IN ('ativo', 'onboarding', 'em andamento')
          )
        )
        OR (
          v_status_norm <> 'ativo'
          AND lower(trim(coalesce(a.status, ''))) = v_status_norm
        )
      )
  ),
  normalized AS (
    SELECT
      cb.*,
      (
        CASE WHEN cb.has_traffic THEN 1 ELSE 0 END +
        CASE WHEN cb.has_website THEN 1 ELSE 0 END +
        CASE WHEN cb.has_landing_page THEN 1 ELSE 0 END
      )::int AS total_projects,
      (
        (
          nullif(trim(coalesce(cb.client_status, '')), '') IS NULL
          OR lower(trim(cb.client_status)) IN ('ativo', 'onboarding', 'em andamento')
        )
        AND (cb.accepted_at IS NULL OR cb.accepted_at::date <= v_reference_date)
        AND (cb.expiration_date IS NULL OR cb.expiration_date >= v_reference_date)
      ) AS is_active_contract
    FROM contract_base cb
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE is_active_contract) AS active_contracts,
      COUNT(DISTINCT company_name) FILTER (WHERE is_active_contract) AS active_clients,
      COALESCE(SUM(total_projects) FILTER (WHERE is_active_contract), 0)::int AS active_projects,
      COALESCE(SUM(CASE WHEN is_active_contract AND has_traffic THEN 1 ELSE 0 END), 0)::int AS active_traffic_projects,
      COALESCE(SUM(CASE WHEN is_active_contract AND has_website THEN 1 ELSE 0 END), 0)::int AS active_website_projects,
      COALESCE(SUM(CASE WHEN is_active_contract AND has_landing_page THEN 1 ELSE 0 END), 0)::int AS active_landing_page_projects,
      COALESCE(SUM(monthly_fee) FILTER (WHERE is_active_contract), 0)::numeric AS mrr,
      (COALESCE(SUM(monthly_fee) FILTER (WHERE is_active_contract), 0)::numeric * 12)::numeric AS arr,
      COALESCE(SUM(setup_fee) FILTER (WHERE is_active_contract), 0)::numeric AS active_setup_fee_total,
      COUNT(*) FILTER (WHERE is_active_contract AND monthly_fee > 0) AS active_contracts_with_monthly_fee,
      COUNT(*) FILTER (WHERE is_active_contract AND monthly_fee <= 0) AS active_contracts_without_monthly_fee
    FROM normalized
  )
  SELECT json_build_object(
    'reference_date', v_reference_date,
    'status_filter', p_status,
    'company_filter', p_company_name,
    'totals', json_build_object(
      'active_contracts', t.active_contracts,
      'active_clients', t.active_clients,
      'active_projects', t.active_projects,
      'active_projects_by_service', json_build_object(
        'traffic', t.active_traffic_projects,
        'website', t.active_website_projects,
        'landing_page', t.active_landing_page_projects
      ),
      'mrr', t.mrr,
      'arr', t.arr,
      'active_setup_fee_total', t.active_setup_fee_total,
      'active_contracts_with_monthly_fee', t.active_contracts_with_monthly_fee,
      'active_contracts_without_monthly_fee', t.active_contracts_without_monthly_fee
    ),
    'active_contracts', COALESCE(
      (
        SELECT json_agg(json_build_object(
          'acceptance_id', n.acceptance_id,
          'company_name', n.company_name,
          'client_status', n.client_status,
          'accepted_at', n.accepted_at,
          'expiration_date', n.expiration_date,
          'monthly_fee', n.monthly_fee,
          'setup_fee', n.setup_fee,
          'has_traffic', n.has_traffic,
          'has_website', n.has_website,
          'has_landing_page', n.has_landing_page,
          'total_projects', n.total_projects
        ) ORDER BY n.company_name)
        FROM normalized n
        WHERE n.is_active_contract
      ),
      '[]'::json
    )
  )
  INTO result
  FROM totals t;

  RETURN COALESCE(result, '{}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_financial_summary(date, text, text, text) TO authenticated, service_role;
