DROP FUNCTION IF EXISTS public.submit_proposal_acceptance(text, text, text, text, text, bigint, jsonb);

CREATE FUNCTION public.submit_proposal_acceptance(
  p_name              text,
  p_email             text,
  p_cpf               text,
  p_cnpj              text,
  p_company_name      text,
  p_proposal_id       bigint,
  p_contract_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id bigint;
  v_timestamp timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = p_proposal_id) THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  INSERT INTO public.acceptances (
    name, email, cpf, cnpj, company_name,
    proposal_id, contract_snapshot, status
  ) VALUES (
    p_name, p_email, p_cpf, p_cnpj, p_company_name,
    p_proposal_id, p_contract_snapshot, 'Ativo'
  )
  RETURNING id, timestamp INTO v_id, v_timestamp;

  RETURN jsonb_build_object(
    'id', v_id,
    'timestamp', v_timestamp
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.submit_proposal_acceptance(text, text, text, text, text, bigint, jsonb) TO anon, authenticated;
