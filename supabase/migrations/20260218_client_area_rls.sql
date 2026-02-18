-- Add 'cliente' to allowed roles in app_users
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check 
  CHECK (role IN ('admin', 'gestor', 'operacional', 'comercial', 'leitor', 'cliente'));

-- Policy for Traffic Projects (Clients)
CREATE POLICY "Clients can view their own traffic projects" 
ON traffic_projects FOR SELECT TO authenticated 
USING (
  (SELECT role FROM app_users WHERE id = auth.uid()) = 'cliente'
  AND
  EXISTS (
    SELECT 1 FROM acceptances a
    WHERE a.id = traffic_projects.acceptance_id
    AND a.client_email = (SELECT email FROM app_users WHERE id = auth.uid())
  )
);

-- Policy for Traffic Campaigns (Clients)
CREATE POLICY "Clients can view their campaigns" 
ON traffic_campaigns FOR SELECT TO authenticated 
USING (
  (SELECT role FROM app_users WHERE id = auth.uid()) = 'cliente'
  AND
  EXISTS (
    SELECT 1 FROM traffic_projects tp
    JOIN acceptances a ON tp.acceptance_id = a.id
    WHERE tp.id = traffic_campaigns.traffic_project_id
    AND a.client_email = (SELECT email FROM app_users WHERE id = auth.uid())
  )
);

-- Policy for Traffic Campaign Timeline (Clients)
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
    AND a.client_email = (SELECT email FROM app_users WHERE id = auth.uid())
  )
);

-- Ensure RLS is enabled (idempotent)
ALTER TABLE traffic_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_campaign_timeline ENABLE ROW LEVEL SECURITY;
