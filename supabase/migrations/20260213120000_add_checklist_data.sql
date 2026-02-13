-- Add checklist_data column to traffic_campaign_timeline table
ALTER TABLE traffic_campaign_timeline
ADD COLUMN checklist_data JSONB DEFAULT '{}'::jsonb;
