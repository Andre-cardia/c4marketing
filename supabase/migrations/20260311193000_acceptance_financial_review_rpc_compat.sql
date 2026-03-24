DROP POLICY IF EXISTS "commercial_staff_can_manage_acceptance_financial_installments"
  ON public.acceptance_financial_installments;

CREATE POLICY "commercial_staff_can_manage_acceptance_financial_installments"
  ON public.acceptance_financial_installments
  FOR ALL
  TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'gestor']))
  WITH CHECK (public.user_has_role(ARRAY['admin', 'gestor']));

GRANT INSERT, UPDATE, DELETE ON TABLE public.acceptance_financial_installments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.acceptance_financial_installments_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.save_acceptance_financial_review(
  p_acceptance_id bigint,
  p_installments jsonb,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  RETURN public.save_acceptance_financial_review(
    p_acceptance_id,
    p_mode,
    COALESCE(p_installments, '[]'::jsonb)
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.save_acceptance_financial_review(bigint, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
