CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.project_credentials (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  acceptance_id  bigint      REFERENCES public.acceptances(id) ON DELETE CASCADE UNIQUE NOT NULL,
  credentials_encrypted text,
  updated_by     uuid        REFERENCES auth.users(id),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.project_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_can_manage_credentials"
  ON public.project_credentials
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.upsert_project_credentials(
  p_acceptance_id bigint,
  p_credentials   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_key text := 'c4marketingkey2026';
BEGIN
  INSERT INTO public.project_credentials (acceptance_id, credentials_encrypted, updated_by, updated_at)
  VALUES (
    p_acceptance_id,
    encode(extensions.pgp_sym_encrypt(p_credentials, v_key), 'base64'),
    auth.uid(),
    now()
  )
  ON CONFLICT (acceptance_id) DO UPDATE
    SET credentials_encrypted = EXCLUDED.credentials_encrypted,
        updated_by             = EXCLUDED.updated_by,
        updated_at             = now();
END;
$func$;

GRANT EXECUTE ON FUNCTION public.upsert_project_credentials(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_project_credentials(
  p_acceptance_id bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_key       text := 'c4marketingkey2026';
  v_encrypted text;
BEGIN
  SELECT credentials_encrypted
    INTO v_encrypted
    FROM public.project_credentials
   WHERE acceptance_id = p_acceptance_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_key)::text;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_project_credentials(bigint) TO authenticated;
