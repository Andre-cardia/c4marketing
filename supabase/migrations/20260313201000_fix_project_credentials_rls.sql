-- ============================================================
-- SEGURANÇA CRÍTICA: Corrige RLS de project_credentials
-- Remove policy permissiva USING (true) para todo authenticated
-- Implanta isolamento por role: gestor/admin gerencia tudo;
-- cliente vê apenas as próprias credenciais.
-- ============================================================

-- 1. Remover política permissiva anterior
DROP POLICY IF EXISTS "authenticated_can_manage_credentials" ON public.project_credentials;

-- 2. Gestores e admins podem gerenciar todas as credenciais
CREATE POLICY "managers_can_manage_all_credentials"
  ON public.project_credentials
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.app_users WHERE id = auth.uid())
    IN ('admin', 'gestor', 'operacional')
  )
  WITH CHECK (
    (SELECT role FROM public.app_users WHERE id = auth.uid())
    IN ('admin', 'gestor', 'operacional')
  );

-- 3. Clientes podem apenas LER as suas próprias credenciais
--    (vinculado via acceptances.email = app_users.email)
CREATE POLICY "clients_can_read_own_credentials"
  ON public.project_credentials
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.app_users WHERE id = auth.uid()) = 'cliente'
    AND EXISTS (
      SELECT 1
        FROM public.acceptances a
        JOIN public.app_users u ON lower(trim(u.email)) = lower(trim(a.email))
       WHERE a.id = project_credentials.acceptance_id
         AND u.id = auth.uid()
    )
  );
