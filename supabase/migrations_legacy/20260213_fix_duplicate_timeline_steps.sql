-- 1. Clean up duplicate timeline steps (keep the oldest one)
DELETE FROM traffic_campaign_timeline a
USING traffic_campaign_timeline b
WHERE a.created_at > b.created_at
  AND a.campaign_id = b.campaign_id
  AND a.step_key = b.step_key;

-- 2. Add unique constraint to prevent future duplications
ALTER TABLE traffic_campaign_timeline
ADD CONSTRAINT traffic_campaign_timeline_campaign_id_step_key_key 
UNIQUE (campaign_id, step_key);
