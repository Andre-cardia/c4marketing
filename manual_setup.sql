-- FIX: RLS POLICIES FOR CLIENT AREA
-- The previous policies used app_users.id = auth.uid(), but those IDs don't match.
-- This version uses auth.jwt() ->> 'email' to get the user's email directly from the token.

-- 1. Drop old broken policies
DROP POLICY IF EXISTS "Clients can view their own traffic projects" ON traffic_projects;
DROP POLICY IF EXISTS "Clients can view their campaigns" ON traffic_campaigns;
DROP POLICY IF EXISTS "Clients can view their timeline" ON traffic_campaign_timeline;

-- 2. Recreate with correct email lookup via JWT
CREATE POLICY "Clients can view their own traffic projects" 
ON traffic_projects FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM app_users au
    WHERE au.email = auth.jwt() ->> 'email'
    AND au.role = 'cliente'
  )
  AND
  EXISTS (
    SELECT 1 FROM acceptances a
    WHERE a.id = traffic_projects.acceptance_id
    AND lower(a.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "Clients can view their campaigns" 
ON traffic_campaigns FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM app_users au
    WHERE au.email = auth.jwt() ->> 'email'
    AND au.role = 'cliente'
  )
  AND
  EXISTS (
    SELECT 1 FROM traffic_projects tp
    JOIN acceptances a ON tp.acceptance_id = a.id
    WHERE tp.id = traffic_campaigns.traffic_project_id
    AND lower(a.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "Clients can view their timeline" 
ON traffic_campaign_timeline FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM app_users au
    WHERE au.email = auth.jwt() ->> 'email'
    AND au.role = 'cliente'
  )
  AND
  EXISTS (
    SELECT 1 FROM traffic_campaigns tc
    JOIN traffic_projects tp ON tc.traffic_project_id = tp.id
    JOIN acceptances a ON tp.acceptance_id = a.id
    WHERE tc.id = traffic_campaign_timeline.campaign_id
    AND lower(a.email) = lower(auth.jwt() ->> 'email')
  )
);
