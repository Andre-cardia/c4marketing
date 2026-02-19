-- Create landing_page_projects table
CREATE TABLE IF NOT EXISTS landing_page_projects (
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

-- Create landing_pages table
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landing_page_project_id UUID REFERENCES landing_page_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT CHECK (status IN ('content_received', 'design', 'approval', 'adjustments', 'delivered')) DEFAULT 'content_received',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE landing_page_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

-- Policies for landing_page_projects
CREATE POLICY "Enable all access for authenticated users" ON landing_page_projects
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policies for landing_pages
CREATE POLICY "Enable all access for authenticated users" ON landing_pages
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
