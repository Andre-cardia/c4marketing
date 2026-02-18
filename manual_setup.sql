-- 1. FIX APP_USERS PERMISSIONS (Critical for creation)
-------------------------------------------------------------------------------
-- Allow 'Gestor' (Authenticated) to insert new users into profiles
CREATE POLICY "Authenticated users can insert profiles" 
ON app_users FOR INSERT TO authenticated 
WITH CHECK (true);

-- Add 'cliente' to valid roles (if not already)
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check 
  CHECK (role IN ('admin', 'gestor', 'operacional', 'comercial', 'leitor', 'cliente'));


-- 2. APPLY RLS POLICIES (Client Area)
-------------------------------------------------------------------------------
-- Enable RLS (Idempotent)
ALTER TABLE traffic_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_campaign_timeline ENABLE ROW LEVEL SECURITY;

-- Policy for traffic_projects
DROP POLICY IF EXISTS "Clients can view their own traffic projects" ON traffic_projects;
CREATE POLICY "Clients can view their own traffic projects" 
ON traffic_projects FOR SELECT TO authenticated 
USING (
  (SELECT role FROM app_users WHERE id = auth.uid()) = 'cliente'
  AND
  EXISTS (
    SELECT 1 FROM acceptances a
    WHERE a.id = traffic_projects.acceptance_id
    AND lower(a.email) = lower((SELECT email FROM app_users WHERE id = auth.uid()))
  )
);

-- Policy for traffic_campaigns
DROP POLICY IF EXISTS "Clients can view their campaigns" ON traffic_campaigns;
CREATE POLICY "Clients can view their campaigns" 
ON traffic_campaigns FOR SELECT TO authenticated 
USING (
  (SELECT role FROM app_users WHERE id = auth.uid()) = 'cliente'
  AND
  EXISTS (
    SELECT 1 FROM traffic_projects tp
    JOIN acceptances a ON tp.acceptance_id = a.id
    WHERE tp.id = traffic_campaigns.traffic_project_id
    AND lower(a.email) = lower((SELECT email FROM app_users WHERE id = auth.uid()))
  )
);

-- Policy for traffic_campaign_timeline
DROP POLICY IF EXISTS "Clients can view their timeline" ON traffic_campaign_timeline;
CREATE POLICY "Clients can view their timeline" 
ON traffic_campaign_timeline FOR SELECT TO authenticated 
USING (
  (SELECT role FROM app_users WHERE id = auth.uid()) = 'cliente'
  AND
  EXISTS (
    SELECT 1 FROM traffic_campaigns tc
    JOIN traffic_projects tp ON tc.traffic_project_id = tp.id
    JOIN acceptances a ON tp.acceptance_id = a.id
    WHERE tc.id = traffic_campaign_timeline.campaign_id
    AND lower(a.email) = lower((SELECT email FROM app_users WHERE id = auth.uid()))
  )
);

-- 3. CREATE TEST USER HELPER FUNCTION
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.make_user_client(target_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE app_users
  SET role = 'cliente'
  WHERE email = target_email;
  
  RETURN 'User ' || target_email || ' is now a client.';
END;
$$;
