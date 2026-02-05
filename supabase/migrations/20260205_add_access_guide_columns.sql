-- Add access_guide_data to landing_page_projects
ALTER TABLE landing_page_projects 
ADD COLUMN IF NOT EXISTS access_guide_data JSONB;

-- Add access_guide_data to website_projects
ALTER TABLE website_projects 
ADD COLUMN IF NOT EXISTS access_guide_data JSONB;
