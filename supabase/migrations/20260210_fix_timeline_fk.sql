-- Drop the incorrect foreign key constraint pointing to auth.users
ALTER TABLE traffic_campaign_timeline
DROP CONSTRAINT IF EXISTS traffic_campaign_timeline_responsible_id_fkey;

-- Add the correct foreign key constraint pointing to app_users
-- Note: Assuming app_users has 'id' as primary key
ALTER TABLE traffic_campaign_timeline
ADD CONSTRAINT traffic_campaign_timeline_responsible_id_fkey
FOREIGN KEY (responsible_id)
REFERENCES app_users(id);
