-- ============================================================
-- Fix: Cria RPC log_user_access (SECURITY DEFINER)
-- Garante que qualquer usuário autenticado possa registrar
-- seu acesso sem depender de RLS no INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_user_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id    UUID;
    v_user_email TEXT;
BEGIN
    v_user_id    := auth.uid();
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_id IS NULL THEN
        RETURN; -- Não logado, ignora
    END IF;

    INSERT INTO access_logs (user_id, user_email)
    VALUES (v_user_id, v_user_email);

EXCEPTION WHEN OTHERS THEN
    -- Nunca lança erro — log de acesso não pode quebrar o app
    NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_access TO authenticated;
