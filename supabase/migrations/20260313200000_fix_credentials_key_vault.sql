-- ============================================================
-- SEGURANÇA CRÍTICA: Remove chave de criptografia hardcoded
-- Armazena a chave no Vault do Supabase (supabase_vault)
-- e atualiza as funções para lê-la de lá.
-- ============================================================

-- 1. Garantir que a extensão vault está ativa
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2. Inserir a chave no Vault (idempotente via DO block)
--    IMPORTANTE: Após aplicar esta migration, troque o valor da chave
--    via Supabase Dashboard > Database > Vault > Secrets
--    ou execute: SELECT vault.update_secret(id, 'NOVA_CHAVE_FORTE') FROM vault.secrets WHERE name = 'credentials_encryption_key';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'credentials_encryption_key'
  ) THEN
    PERFORM vault.create_secret(
      'c4marketingkey2026',
      'credentials_encryption_key',
      'Chave de criptografia PGP simetrica para project_credentials. TROCAR IMEDIATAMENTE apos deploy.'
    );
  END IF;
END
$$;

-- 3. Recriar upsert_project_credentials lendo chave do Vault
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
  v_key text;
BEGIN
  -- Ler chave do Vault (nunca hardcoded)
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'credentials_encryption_key';

  IF v_key IS NULL OR length(trim(v_key)) = 0 THEN
    RAISE EXCEPTION 'credentials_encryption_key nao encontrada no Vault';
  END IF;

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

-- 4. Recriar get_project_credentials lendo chave do Vault
CREATE OR REPLACE FUNCTION public.get_project_credentials(
  p_acceptance_id bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_key       text;
  v_encrypted text;
BEGIN
  -- Ler chave do Vault (nunca hardcoded)
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'credentials_encryption_key';

  IF v_key IS NULL OR length(trim(v_key)) = 0 THEN
    RAISE EXCEPTION 'credentials_encryption_key nao encontrada no Vault';
  END IF;

  SELECT credentials_encrypted INTO v_encrypted
    FROM public.project_credentials
   WHERE acceptance_id = p_acceptance_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_key)::text;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_project_credentials(bigint) TO authenticated;
