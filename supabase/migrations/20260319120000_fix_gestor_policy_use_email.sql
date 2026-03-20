-- Fix: Use email from JWT instead of auth.uid() to find caller's role
-- This solves the case where app_users.id != auth.users.id for the same email

DROP POLICY IF EXISTS "Gestores podem alterar role de qualquer usuario" ON app_users;

CREATE POLICY "Gestores podem alterar role de qualquer usuario"
ON app_users
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM app_users AS caller
        WHERE caller.email = (auth.jwt() ->> 'email')
        AND caller.role = 'gestor'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM app_users AS caller
        WHERE caller.email = (auth.jwt() ->> 'email')
        AND caller.role = 'gestor'
    )
);
