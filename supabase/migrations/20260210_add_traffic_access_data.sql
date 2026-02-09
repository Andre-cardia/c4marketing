-- Add access_data column to traffic_projects table
ALTER TABLE traffic_projects 
ADD COLUMN IF NOT EXISTS access_data JSONB;
