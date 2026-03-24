WITH acceptance_setup_values AS (
  SELECT
    a.id AS acceptance_id,
    COALESCE(
      public.parse_financial_numeric(p.setup_fee::text),
      public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
      public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
      0::numeric
    ) AS explicit_setup_fee
  FROM public.acceptances a
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
),
wrongly_classified AS (
  SELECT acceptance_id
  FROM acceptance_setup_values
  WHERE explicit_setup_fee <= 0.01
)
DELETE FROM public.acceptance_financial_installments afi
USING wrongly_classified wc
WHERE afi.acceptance_id = wc.acceptance_id;

WITH acceptance_setup_values AS (
  SELECT
    a.id AS acceptance_id,
    COALESCE(
      public.parse_financial_numeric(p.setup_fee::text),
      public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
      public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
      0::numeric
    ) AS explicit_setup_fee
  FROM public.acceptances a
  LEFT JOIN public.proposals p ON p.id = a.proposal_id
)
UPDATE public.acceptances a
SET
  financial_review_status = 'completed',
  financial_review_mode = 'no_non_recurring',
  financial_reviewed_at = COALESCE(a.financial_reviewed_at, now())
FROM acceptance_setup_values v
WHERE a.id = v.acceptance_id
  AND v.explicit_setup_fee <= 0.01;

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
    public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
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

NOTIFY pgrst, 'reload schema';
