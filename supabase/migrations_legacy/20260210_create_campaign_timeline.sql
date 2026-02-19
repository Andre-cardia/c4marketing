-- Create traffic_campaign_timeline table
CREATE TABLE IF NOT EXISTS traffic_campaign_timeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES traffic_campaigns(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL CHECK (step_key IN ('planning', 'creatives', 'execution', 'optimization', 'finalization')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  responsible_id UUID REFERENCES auth.users(id),
  observations TEXT,
  order_index INTEGER DEFAULT 0, -- To sort the steps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: responsible_id references auth.users(id). 
-- If you have a separate profiles/app_users table, consider referencing that or joining. 
-- Here assume referencing auth users for simplicity.

-- Enable RLS
ALTER TABLE traffic_campaign_timeline ENABLE ROW LEVEL SECURITY;

-- Policies for traffic_campaign_timeline
CREATE POLICY "Enable all access for authenticated users" ON traffic_campaign_timeline
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Trigger to automatically create timeline steps when a campaign is created
CREATE OR REPLACE FUNCTION create_campaign_timeline()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO traffic_campaign_timeline (campaign_id, step_key, order_index, status, start_date)
  VALUES 
    (NEW.id, 'planning', 0, 'in_progress', NOW()),
    (NEW.id, 'creatives', 1, 'pending', NULL),
    (NEW.id, 'execution', 2, 'pending', NULL),
    (NEW.id, 'optimization', 3, 'pending', NULL),
    (NEW.id, 'finalization', 4, 'pending', NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_campaign_timeline
AFTER INSERT ON traffic_campaigns
FOR EACH ROW
EXECUTE FUNCTION create_campaign_timeline();
