-- ============================================================
-- Bloqueia aceite duplo de proposta via mudança de status
--
-- Após aceite registrado:
--   1. proposals.status muda de 'active' → 'accepted'
--   2. Qualquer nova tentativa na RPC falha na verificação de status
--   3. A política anônima expõe 'active' e 'accepted' (mas não 'inactive')
--      para que a UI possa exibir "Proposta já aceita"
-- ============================================================

-- 1. Atualizar RPC submit_proposal_acceptance para marcar proposta como aceita
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
  v_id              bigint;
  v_timestamp       timestamptz;
  v_proposal_status text;
  v_existing_id     bigint;
BEGIN
  -- 1. Validar campos obrigatórios
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Nome e obrigatorio';
  END IF;
  IF trim(coalesce(p_email, '')) = '' OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Email invalido';
  END IF;
  IF p_proposal_id IS NULL THEN
    RAISE EXCEPTION 'proposal_id e obrigatorio';
  END IF;

  -- 2. Verificar se a proposta existe e está ativa
  SELECT status INTO v_proposal_status
    FROM public.proposals
   WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta nao encontrada';
  END IF;

  IF lower(coalesce(v_proposal_status, 'active')) NOT IN ('active', 'ativo') THEN
    RAISE EXCEPTION 'Esta proposta nao esta disponivel para aceite (status: %)', v_proposal_status;
  END IF;

  -- 3. Verificar duplicidade: mesmo email + proposal_id já aceito
  SELECT id INTO v_existing_id
    FROM public.acceptances
   WHERE lower(trim(email)) = lower(trim(p_email))
     AND proposal_id = p_proposal_id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Esta proposta ja foi aceita por este email (id: %)', v_existing_id;
  END IF;

  -- 4. Inserir aceite
  INSERT INTO public.acceptances (
    name, email, cpf, cnpj, company_name,
    proposal_id, contract_snapshot, status
  ) VALUES (
    trim(p_name),
    lower(trim(p_email)),
    trim(coalesce(p_cpf, '')),
    trim(coalesce(p_cnpj, '')),
    trim(coalesce(p_company_name, p_name)),
    p_proposal_id,
    p_contract_snapshot,
    'Ativo'
  )
  RETURNING id, timestamp INTO v_id, v_timestamp;

  -- 5. Marcar proposta como aceita (bloqueia novos aceites)
  UPDATE public.proposals
     SET status = 'accepted'
   WHERE id = p_proposal_id;

  RETURN jsonb_build_object(
    'id',        v_id,
    'timestamp', v_timestamp
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.submit_proposal_acceptance(text, text, text, text, text, bigint, jsonb) TO anon, authenticated;

-- 2. Ampliar política anônima para incluir propostas aceitas
--    (necessário para a UI exibir "Proposta já aceita" em vez de 404)
DROP POLICY IF EXISTS "anon_can_read_active_proposals" ON public.proposals;
CREATE POLICY "anon_can_read_active_proposals"
    ON public.proposals
    FOR SELECT
    TO anon
    USING (status IN ('active', 'accepted'));
