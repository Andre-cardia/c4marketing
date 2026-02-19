-- Create traffic_projects table
CREATE TABLE IF NOT EXISTS traffic_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  acceptance_id BIGINT REFERENCES acceptances(id) ON DELETE CASCADE, -- Changed from UUID to BIGINT
  survey_link TEXT,
  survey_status TEXT CHECK (survey_status IN ('pending', 'completed')) DEFAULT 'pending',
  account_setup_status TEXT CHECK (account_setup_status IN ('pending', 'completed')) DEFAULT 'pending',
  strategy_meeting_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(acceptance_id)
);

-- Create traffic_campaigns table
CREATE TABLE IF NOT EXISTS traffic_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  traffic_project_id UUID REFERENCES traffic_projects(id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('google_ads', 'meta_ads', 'linkedin_ads', 'tiktok_ads')),
  name TEXT,
  status TEXT CHECK (status IN ('active', 'paused', 'ended')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE traffic_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_campaigns ENABLE ROW LEVEL SECURITY;

-- Policies for traffic_projects
CREATE POLICY "Enable all access for authenticated users" ON traffic_projects
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policies for traffic_campaigns
CREATE POLICY "Enable all access for authenticated users" ON traffic_campaigns
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
