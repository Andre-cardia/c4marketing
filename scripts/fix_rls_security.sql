-- =============================================================================
-- CORREÇÃO DE ALERTAS DE SEGURANÇA RLS — Supabase
-- Gerado em: 2026-02-16
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 0: Função helper para verificação de role
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE email = (SELECT auth.email())
      AND role = ANY(allowed_roles)
  );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1: acceptances (contratos/aceites)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can delete acceptances" ON public.acceptances;
DROP POLICY IF EXISTS "Staff can insert acceptances" ON public.acceptances;
DROP POLICY IF EXISTS "Staff can update acceptances" ON public.acceptances;

CREATE POLICY "Staff can insert acceptances"
  ON public.acceptances FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['gestor', 'admin', 'comercial']));

CREATE POLICY "Staff can update acceptances"
  ON public.acceptances FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['gestor', 'admin', 'comercial']))
  WITH CHECK (public.user_has_role(ARRAY['gestor', 'admin', 'comercial']));

CREATE POLICY "Staff can delete acceptances"
  ON public.acceptances FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['gestor', 'admin']));


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2: proposals (propostas comerciais)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can delete proposals" ON public.proposals;
DROP POLICY IF EXISTS "Staff can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Staff can update proposals" ON public.proposals;

CREATE POLICY "Staff can insert proposals"
  ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['gestor', 'admin', 'comercial']));

CREATE POLICY "Staff can update proposals"
  ON public.proposals FOR UPDATE TO authenticated
  USING (public.user_has_role(ARRAY['gestor', 'admin', 'comercial']))
  WITH CHECK (public.user_has_role(ARRAY['gestor', 'admin', 'comercial']));

CREATE POLICY "Staff can delete proposals"
  ON public.proposals FOR DELETE TO authenticated
  USING (public.user_has_role(ARRAY['gestor', 'admin']));


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3: ai_feedback
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.ai_feedback;

CREATE POLICY "Authenticated users can insert ai_feedback"
  ON public.ai_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 4: project_tasks (Kanban)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users access own project tasks" ON public.project_tasks;

CREATE POLICY "Authenticated users manage project tasks"
  ON public.project_tasks FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 5: task_history
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.task_history;

CREATE POLICY "Authenticated users manage task history"
  ON public.task_history FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 6: traffic_campaigns
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.traffic_campaigns;

CREATE POLICY "Authenticated users manage traffic campaigns"
  ON public.traffic_campaigns FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 7: traffic_campaign_timeline
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.traffic_campaign_timeline;

CREATE POLICY "Authenticated users manage campaign timeline"
  ON public.traffic_campaign_timeline FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 8: landing_page_projects
-- (Mantém "Public update access via link" para anon — surveys externos)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users full access" ON public.landing_page_projects;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.landing_page_projects;

CREATE POLICY "Authenticated users manage landing page projects"
  ON public.landing_page_projects FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 9: landing_pages
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.landing_pages;

CREATE POLICY "Authenticated users manage landing pages"
  ON public.landing_pages FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 10: traffic_projects
-- (Mantém "Public update access via link" para anon — surveys externos)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users full access" ON public.traffic_projects;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.traffic_projects;

CREATE POLICY "Authenticated users manage traffic projects"
  ON public.traffic_projects FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 11: website_projects
-- (Mantém "Public update access via link" para anon — surveys externos)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users full access" ON public.website_projects;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.website_projects;

CREATE POLICY "Authenticated users manage website projects"
  ON public.website_projects FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 12: websites
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.websites;

CREATE POLICY "Authenticated users manage websites"
  ON public.websites FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- =============================================================================
-- CONCLUÍDO! 
-- Lembre-se de ativar "Leaked Password Protection" em:
-- Supabase Dashboard → Authentication → Settings → Password Security
-- =============================================================================
