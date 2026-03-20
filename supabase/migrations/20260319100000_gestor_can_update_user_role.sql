-- Migration: Allow gestors to update the role of any user in app_users
-- Problem: The RLS policy "Users can update own profile" restricts UPDATE to auth.uid() = id,
-- which prevents gestors from changing other users' roles.
-- Solution: Create a SECURITY DEFINER RPC that verifies the caller is a gestor before updating.

CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role text;
BEGIN
    -- Verify caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autorizado: usuário não autenticado.';
    END IF;

    -- Get caller's role from app_users
    SELECT role INTO caller_role
    FROM app_users
    WHERE id = auth.uid();

    -- Only gestors can change roles
    IF caller_role IS DISTINCT FROM 'gestor' THEN
        RAISE EXCEPTION 'Não autorizado: apenas gestores podem alterar níveis de acesso.';
    END IF;

    -- Validate new_role value
    IF new_role NOT IN ('leitor', 'comercial', 'gestor', 'operacional', 'cliente', 'financeiro') THEN
        RAISE EXCEPTION 'Nível de acesso inválido: %', new_role;
    END IF;

    -- Perform the update (bypasses RLS due to SECURITY DEFINER)
    UPDATE app_users
    SET role = new_role
    WHERE id = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado: %', target_user_id;
    END IF;
END;
$$;

-- Grant execute to authenticated users (the function itself checks if they are gestor)
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated;
