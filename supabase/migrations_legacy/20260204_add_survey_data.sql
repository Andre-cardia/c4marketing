ALTER TABLE traffic_projects 
ADD COLUMN IF NOT EXISTS survey_data JSONB;
