-- Company alias support:
-- keeps legal company_name intact while allowing a display alias for listings and filters.

ALTER TABLE public.acceptances
ADD COLUMN IF NOT EXISTS company_alias text;

CREATE INDEX IF NOT EXISTS idx_acceptances_company_alias
ON public.acceptances (lower(company_alias))
WHERE company_alias IS NOT NULL;

CREATE OR REPLACE FUNCTION public.query_all_projects(
  p_service_type text DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(proj ORDER BY proj.company_name) INTO result
  FROM (
    SELECT
      tp.id::text,
      'Gestão de Tráfego' AS service_type,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) AS company_name,
      a.company_name AS company_legal_name,
      NULLIF(btrim(a.company_alias), '') AS company_alias,
      tp.survey_status,
      tp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id) AS total_campaigns,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id AND tc.status = 'active') AS active_campaigns,
      tp.created_at
    FROM traffic_projects tp
    JOIN acceptances a ON a.id = tp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'traffic')

    UNION ALL

    SELECT
      wp.id::text,
      'Criação de Site' AS service_type,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) AS company_name,
      a.company_name AS company_legal_name,
      NULLIF(btrim(a.company_alias), '') AS company_alias,
      wp.survey_status,
      wp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id) AS total_campaigns,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id AND w.status != 'delivered') AS active_campaigns,
      wp.created_at
    FROM website_projects wp
    JOIN acceptances a ON a.id = wp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'website')

    UNION ALL

    SELECT
      lp.id::text,
      'Landing Page' AS service_type,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) AS company_name,
      a.company_name AS company_legal_name,
      NULLIF(btrim(a.company_alias), '') AS company_alias,
      lp.survey_status,
      lp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id) AS total_campaigns,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id AND l.status != 'delivered') AS active_campaigns,
      lp.created_at
    FROM landing_page_projects lp
    JOIN acceptances a ON a.id = lp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'landing_page')
  ) proj
  WHERE (p_status_filter IS NULL OR proj.client_status = p_status_filter);

  RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.query_all_clients(
  p_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(c ORDER BY c.company_name) INTO result
  FROM (
    SELECT
      a.id,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) AS company_name,
      a.company_name AS company_legal_name,
      NULLIF(btrim(a.company_alias), '') AS company_alias,
      a.name AS responsible_name,
      a.email,
      a.status,
      a.timestamp AS accepted_at,
      a.expiration_date,
      (SELECT count(*) FROM traffic_projects tp WHERE tp.acceptance_id = a.id) > 0 AS has_traffic,
      (SELECT count(*) FROM website_projects wp WHERE wp.acceptance_id = a.id) > 0 AS has_website,
      (SELECT count(*) FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) > 0 AS has_landing_page,
      (SELECT count(*) FROM project_tasks pt WHERE pt.project_id = a.id) AS total_tasks,
      (SELECT count(*) FROM project_tasks pt WHERE pt.project_id = a.id AND pt.status NOT IN ('done')) AS pending_tasks
    FROM acceptances a
    WHERE (p_status IS NULL OR a.status = p_status)
  ) c;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.query_all_tasks(
  p_project_id   bigint  DEFAULT NULL,
  p_status       text    DEFAULT NULL,
  p_overdue      boolean DEFAULT NULL,
  p_reference_date date  DEFAULT NULL,
  p_reference_tz text    DEFAULT NULL,
  p_created_date date    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_status text;
  v_reference_date date;
BEGIN
  v_status := nullif(lower(trim(coalesce(p_status, ''))), '');

  IF v_status = 'todo' THEN
    v_status := 'backlog';
  ELSIF v_status = 'review' THEN
    v_status := 'approval';
  END IF;

  v_reference_date := COALESCE(
    p_reference_date,
    CASE
      WHEN nullif(trim(coalesce(p_reference_tz, '')), '') IS NULL
        THEN CURRENT_DATE
      ELSE (now() AT TIME ZONE p_reference_tz)::date
    END
  );

  SELECT json_agg(t ORDER BY t.created_at DESC) INTO result
  FROM (
    SELECT
      pt.id::text,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) AS client_name,
      a.company_name AS client_legal_name,
      NULLIF(btrim(a.company_alias), '') AS client_alias,
      pt.title,
      pt.description,
      pt.status,
      pt.priority,
      pt.assignee,
      pt.due_date,
      pt.created_at,
      (pt.due_date IS NOT NULL AND pt.due_date::date < v_reference_date AND pt.status <> 'done') AS is_overdue
    FROM project_tasks pt
    JOIN acceptances a ON a.id = pt.project_id
    WHERE (p_project_id IS NULL OR pt.project_id = p_project_id)
      AND (v_status IS NULL OR pt.status = v_status)
      AND (
        COALESCE(p_overdue, false) = false
        OR (
          pt.due_date IS NOT NULL
          AND pt.due_date::date < v_reference_date
          AND pt.status <> 'done'
        )
      )
      AND (p_created_date IS NULL OR (pt.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_created_date)
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_adjust_financial_start_date(
  p_session_id text DEFAULT NULL,
  p_acceptance_id bigint DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_billing_start_date date DEFAULT NULL,
  p_origin_reference_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acceptance_id bigint;
  v_company_name text;
  v_old_billing_start_date date;
  v_old_accepted_at timestamptz;
BEGIN
  IF p_billing_start_date IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'p_billing_start_date é obrigatório.'
    );
  END IF;

  v_acceptance_id := p_acceptance_id;

  IF v_acceptance_id IS NULL AND p_company_name IS NOT NULL THEN
    SELECT
      a.id,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name),
      a.billing_start_date,
      a.timestamp
      INTO v_acceptance_id, v_company_name, v_old_billing_start_date, v_old_accepted_at
      FROM public.acceptances a
     WHERE (
       lower(a.company_name) LIKE '%' || lower(trim(p_company_name)) || '%'
       OR lower(COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name)) LIKE '%' || lower(trim(p_company_name)) || '%'
     )
     ORDER BY a.timestamp DESC
     LIMIT 1;
  END IF;

  IF v_acceptance_id IS NULL AND p_origin_reference_date IS NOT NULL THEN
    SELECT
      a.id,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name),
      a.billing_start_date,
      a.timestamp
      INTO v_acceptance_id, v_company_name, v_old_billing_start_date, v_old_accepted_at
      FROM public.acceptances a
     WHERE date_trunc('month', a.timestamp)::date = date_trunc('month', p_origin_reference_date)::date
     ORDER BY a.timestamp DESC
     LIMIT 1;
  END IF;

  IF v_acceptance_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Não foi possível identificar o contrato. Informe p_acceptance_id, p_company_name ou p_origin_reference_date.'
    );
  END IF;

  IF v_company_name IS NULL THEN
    SELECT
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name),
      a.billing_start_date,
      a.timestamp
      INTO v_company_name, v_old_billing_start_date, v_old_accepted_at
      FROM public.acceptances a
     WHERE a.id = v_acceptance_id
     LIMIT 1;
  END IF;

  IF v_company_name IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', format('Contrato %s não encontrado.', v_acceptance_id)
    );
  END IF;

  UPDATE public.acceptances
     SET billing_start_date = p_billing_start_date
   WHERE id = v_acceptance_id;

  BEGIN
    INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
    VALUES (
      coalesce(p_session_id, 'unknown'),
      'Agent_Executor',
      'adjust_financial_start_date',
      'success',
      jsonb_build_object(
        'acceptance_id', v_acceptance_id,
        'company_name', v_company_name,
        'old_billing_start_date', v_old_billing_start_date,
        'new_billing_start_date', p_billing_start_date,
        'old_accepted_at', v_old_accepted_at,
        'notes', p_notes,
        'origin_reference_date', p_origin_reference_date
      ),
      jsonb_build_object('updated', true),
      0
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'status', 'success',
    'acceptance_id', v_acceptance_id,
    'company_name', v_company_name,
    'old_billing_start_date', v_old_billing_start_date,
    'new_billing_start_date', p_billing_start_date,
    'accepted_at', v_old_accepted_at,
    'message', format(
      'Início de faturamento ajustado para %s (%s): %s -> %s.',
      v_company_name,
      v_acceptance_id,
      coalesce(v_old_billing_start_date::text, 'NULL'),
      p_billing_start_date::text
    )
  );
END;
$$;

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
      a.company_name AS company_legal_name,
      NULLIF(btrim(a.company_alias), '') AS company_alias,
      COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) AS company_name,
      a.status AS client_status,
      a.timestamp AS accepted_at,
      a.billing_start_date,
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
    WHERE (
      p_company_name IS NULL
      OR a.company_name ILIKE '%' || p_company_name || '%'
      OR COALESCE(NULLIF(btrim(a.company_alias), ''), a.company_name) ILIKE '%' || p_company_name || '%'
    )
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
        AND (
          coalesce(cb.billing_start_date, cb.accepted_at::date) IS NULL
          OR coalesce(cb.billing_start_date, cb.accepted_at::date) <= v_reference_date
        )
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
          'company_legal_name', n.company_legal_name,
          'company_alias', n.company_alias,
          'client_status', n.client_status,
          'accepted_at', n.accepted_at,
          'billing_start_date', n.billing_start_date,
          'effective_billing_start_date', coalesce(n.billing_start_date, n.accepted_at::date),
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

GRANT EXECUTE ON FUNCTION public.query_all_projects(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_clients(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_all_tasks(bigint, text, boolean, date, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_adjust_financial_start_date(text, bigint, text, date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.query_financial_summary(date, text, text, text) TO authenticated, service_role;
