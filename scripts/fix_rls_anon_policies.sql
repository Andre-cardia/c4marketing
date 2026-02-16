-- =============================================================================
-- CORREÇÃO DOS 3 ALERTAS RESTANTES — Policies Anon para Surveys Externos
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- landing_page_projects — Survey externo
-- Restringe: anon só pode atualizar linhas cujo survey_status NÃO é 'completed'
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public update access via link" ON public.landing_page_projects;

CREATE POLICY "Public update survey via link"
  ON public.landing_page_projects FOR UPDATE TO anon
  USING (survey_status IS DISTINCT FROM 'completed')
  WITH CHECK (survey_status IS DISTINCT FROM 'completed');


-- ─────────────────────────────────────────────────────────────────────────────
-- traffic_projects — Survey externo
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public update access via link" ON public.traffic_projects;

CREATE POLICY "Public update survey via link"
  ON public.traffic_projects FOR UPDATE TO anon
  USING (survey_status IS DISTINCT FROM 'completed')
  WITH CHECK (survey_status IS DISTINCT FROM 'completed');


-- ─────────────────────────────────────────────────────────────────────────────
-- website_projects — Survey externo
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public update access via link" ON public.website_projects;

CREATE POLICY "Public update survey via link"
  ON public.website_projects FOR UPDATE TO anon
  USING (survey_status IS DISTINCT FROM 'completed')
  WITH CHECK (survey_status IS DISTINCT FROM 'completed');


-- =============================================================================
-- CONCLUÍDO!
-- Isso elimina os 3 warnings restantes de "RLS Policy Always True"
-- 
-- Ação manual pendente:
-- Supabase Dashboard → Authentication → Settings → Password Security
-- → Ativar "Leaked Password Protection"
-- =============================================================================
