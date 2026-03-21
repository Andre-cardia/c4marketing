ALTER TABLE public.acceptances
ADD COLUMN IF NOT EXISTS financial_review_status text,
ADD COLUMN IF NOT EXISTS financial_review_mode text,
ADD COLUMN IF NOT EXISTS financial_reviewed_at timestamptz;

UPDATE public.acceptances
SET financial_review_status = 'pending'
WHERE financial_review_status IS NULL;

ALTER TABLE public.acceptances
ALTER COLUMN financial_review_status SET DEFAULT 'pending',
ALTER COLUMN financial_review_status SET NOT NULL;

ALTER TABLE public.acceptances
DROP CONSTRAINT IF EXISTS acceptances_financial_review_status_check;

ALTER TABLE public.acceptances
ADD CONSTRAINT acceptances_financial_review_status_check
CHECK (financial_review_status IN ('pending', 'completed'));

ALTER TABLE public.acceptances
DROP CONSTRAINT IF EXISTS acceptances_financial_review_mode_check;

ALTER TABLE public.acceptances
ADD CONSTRAINT acceptances_financial_review_mode_check
CHECK (
  financial_review_mode IS NULL
  OR financial_review_mode IN ('single_payment', 'installments', 'no_non_recurring')
);

CREATE TABLE IF NOT EXISTS public.acceptance_financial_installments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acceptance_id bigint NOT NULL REFERENCES public.acceptances(id) ON DELETE CASCADE,
  label text,
  amount numeric NOT NULL CHECK (amount > 0),
  expected_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_financial_installments_acceptance_date
  ON public.acceptance_financial_installments (acceptance_id, expected_date);

ALTER TABLE public.acceptance_financial_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_staff_can_read_acceptance_financial_installments"
  ON public.acceptance_financial_installments;

CREATE POLICY "commercial_staff_can_read_acceptance_financial_installments"
  ON public.acceptance_financial_installments
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'gestor', 'comercial']));

GRANT SELECT ON TABLE public.acceptance_financial_installments TO authenticated;
GRANT ALL ON TABLE public.acceptance_financial_installments TO service_role;

WITH acceptance_values AS (
  SELECT
    a.id AS acceptance_id,
    a.timestamp::date AS expected_date,
    COALESCE(
      public.parse_financial_numeric(p.setup_fee::text),
      public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
      public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,value}'),
      public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
      public.parse_financial_numeric(a.contract_snapshot ->> 'value'),
      0::numeric
    ) AS non_recurring_total
  FROM public.acceptances a
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
)
INSERT INTO public.acceptance_financial_installments (
  acceptance_id,
  label,
  amount,
  expected_date
)
SELECT
  acceptance_id,
  'Pagamento unico (backfill)',
  non_recurring_total,
  expected_date
FROM acceptance_values
WHERE non_recurring_total > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.acceptance_financial_installments afi
    WHERE afi.acceptance_id = acceptance_values.acceptance_id
  );

WITH acceptance_values AS (
  SELECT
    a.id AS acceptance_id,
    COALESCE(
      public.parse_financial_numeric(p.setup_fee::text),
      public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
      public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,value}'),
      public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
      public.parse_financial_numeric(a.contract_snapshot ->> 'value'),
      0::numeric
    ) AS non_recurring_total
  FROM public.acceptances a
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
)
UPDATE public.acceptances a
SET
  financial_review_status = 'completed',
  financial_review_mode = CASE
    WHEN acceptance_values.non_recurring_total > 0 THEN 'single_payment'
    ELSE 'no_non_recurring'
  END,
  financial_reviewed_at = COALESCE(a.timestamp, now())
FROM acceptance_values
WHERE a.id = acceptance_values.acceptance_id;

CREATE OR REPLACE FUNCTION public.save_acceptance_financial_review(
  p_acceptance_id bigint,
  p_mode text,
  p_installments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_non_recurring_total numeric := 0;
  v_installment_count integer := 0;
  v_installment_sum numeric := 0;
  v_invalid_amount_count integer := 0;
  v_invalid_date_count integer := 0;
BEGIN
  IF NOT public.user_has_role(ARRAY['admin', 'gestor']) THEN
    RAISE EXCEPTION 'Apenas gestor ou admin pode revisar o financeiro.';
  END IF;

  IF v_mode NOT IN ('single_payment', 'installments', 'no_non_recurring') THEN
    RAISE EXCEPTION 'Modo financeiro invalido.';
  END IF;

  IF jsonb_typeof(COALESCE(p_installments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Parcelas invalidas: esperado um array JSON.';
  END IF;

  SELECT COALESCE(
    public.parse_financial_numeric(p.setup_fee::text),
    public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
    public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,value}'),
    public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
    public.parse_financial_numeric(a.contract_snapshot ->> 'value'),
    0::numeric
  )
  INTO v_non_recurring_total
  FROM public.acceptances a
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
  WHERE a.id = p_acceptance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aceite % nao encontrado.', p_acceptance_id;
  END IF;

  WITH parsed_installments AS (
    SELECT
      nullif(trim(item->>'label'), '') AS label,
      public.parse_financial_numeric(item->>'amount') AS amount,
      CASE
        WHEN nullif(trim(item->>'expected_date'), '') ~ '^\d{4}-\d{2}-\d{2}$'
          THEN (item->>'expected_date')::date
        ELSE NULL
      END AS expected_date
    FROM jsonb_array_elements(COALESCE(p_installments, '[]'::jsonb)) item
  )
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(amount), 0)::numeric,
    COUNT(*) FILTER (WHERE amount IS NULL OR amount <= 0)::int,
    COUNT(*) FILTER (WHERE expected_date IS NULL)::int
  INTO
    v_installment_count,
    v_installment_sum,
    v_invalid_amount_count,
    v_invalid_date_count
  FROM parsed_installments;

  IF v_mode = 'no_non_recurring' THEN
    IF v_non_recurring_total > 0.01 THEN
      RAISE EXCEPTION 'Este contrato possui valor nao recorrente e precisa de cronograma financeiro.';
    END IF;

    IF v_installment_count > 0 THEN
      RAISE EXCEPTION 'Nao envie parcelas quando o modo for sem componente nao recorrente.';
    END IF;
  ELSE
    IF v_non_recurring_total <= 0.01 THEN
      RAISE EXCEPTION 'Este contrato nao possui valor nao recorrente para revisar.';
    END IF;

    IF v_invalid_amount_count > 0 THEN
      RAISE EXCEPTION 'Todas as parcelas precisam de valor maior que zero.';
    END IF;

    IF v_invalid_date_count > 0 THEN
      RAISE EXCEPTION 'Todas as parcelas precisam de uma data valida.';
    END IF;

    IF v_mode = 'single_payment' AND v_installment_count <> 1 THEN
      RAISE EXCEPTION 'Pagamento unico exige exatamente 1 parcela.';
    END IF;

    IF v_mode = 'installments' AND v_installment_count < 2 THEN
      RAISE EXCEPTION 'Parcelado exige pelo menos 2 parcelas.';
    END IF;

    IF abs(v_installment_sum - v_non_recurring_total) > 0.01 THEN
      RAISE EXCEPTION 'A soma das parcelas precisa ser igual ao valor nao recorrente do contrato.';
    END IF;
  END IF;

  DELETE FROM public.acceptance_financial_installments
  WHERE acceptance_id = p_acceptance_id;

  IF v_mode <> 'no_non_recurring' THEN
    INSERT INTO public.acceptance_financial_installments (
      acceptance_id,
      label,
      amount,
      expected_date
    )
    SELECT
      p_acceptance_id,
      nullif(trim(item->>'label'), ''),
      public.parse_financial_numeric(item->>'amount'),
      (item->>'expected_date')::date
    FROM jsonb_array_elements(COALESCE(p_installments, '[]'::jsonb)) item;
  END IF;

  UPDATE public.acceptances
  SET
    financial_review_status = 'completed',
    financial_review_mode = v_mode,
    financial_reviewed_at = now()
  WHERE id = p_acceptance_id;

  RETURN jsonb_build_object(
    'acceptance_id', p_acceptance_id,
    'financial_review_status', 'completed',
    'financial_review_mode', v_mode,
    'installments_saved', v_installment_count,
    'non_recurring_total', v_non_recurring_total
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.save_acceptance_financial_review(bigint, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_proposal_acceptance(
  p_name text,
  p_email text,
  p_cpf text,
  p_cnpj text,
  p_company_name text,
  p_proposal_id bigint,
  p_contract_snapshot jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = p_proposal_id) THEN
    RAISE EXCEPTION 'Proposta nao encontrada';
  END IF;

  INSERT INTO public.acceptances (
    name,
    email,
    cpf,
    cnpj,
    company_name,
    proposal_id,
    contract_snapshot,
    status,
    financial_review_status,
    financial_review_mode,
    financial_reviewed_at
  ) VALUES (
    p_name,
    p_email,
    p_cpf,
    p_cnpj,
    p_company_name,
    p_proposal_id,
    p_contract_snapshot,
    'Ativo',
    'pending',
    NULL,
    NULL
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.submit_proposal_acceptance(text, text, text, text, text, bigint, jsonb) TO anon, authenticated;
