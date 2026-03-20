-- Migration: Fix gestor permission to update user roles via RLS policy
-- Problem: SECURITY DEFINER function has issues with auth.uid() resolution
-- Solution: Use a direct RLS policy that allows gestors to update role field

-- Drop the broken SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.update_user_role(uuid, text);

-- Add RLS policy: gestors can update role of any user
-- This uses a subquery to check if the current user is a gestor
CREATE POLICY "Gestores podem alterar role de qualquer usuario"
ON app_users
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM app_users AS caller
        WHERE caller.id = auth.uid()
        AND caller.role = 'gestor'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM app_users AS caller
        WHERE caller.id = auth.uid()
        AND caller.role = 'gestor'
    )
);
