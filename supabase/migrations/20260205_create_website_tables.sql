-- Create website_projects table
CREATE TABLE IF NOT EXISTS website_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  acceptance_id BIGINT REFERENCES acceptances(id) ON DELETE CASCADE,
  survey_link TEXT,
  survey_status TEXT CHECK (survey_status IN ('pending', 'completed')) DEFAULT 'pending',
  account_setup_status TEXT CHECK (account_setup_status IN ('pending', 'completed')) DEFAULT 'pending',
  briefing_status TEXT CHECK (briefing_status IN ('pending', 'completed')) DEFAULT 'pending',
  survey_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(acceptance_id)
);

-- Create websites table
CREATE TABLE IF NOT EXISTS websites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  website_project_id UUID REFERENCES website_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT CHECK (status IN ('content_received', 'design', 'approval', 'adjustments', 'delivered')) DEFAULT 'content_received',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE website_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE websites ENABLE ROW LEVEL SECURITY;

-- Policies for website_projects
CREATE POLICY "Enable all access for authenticated users" ON website_projects
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policies for websites
CREATE POLICY "Enable all access for authenticated users" ON websites
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
