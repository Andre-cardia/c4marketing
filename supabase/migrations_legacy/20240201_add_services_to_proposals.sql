-- Add services column to proposals table if it doesn't exist
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- Update existing rows (if any) to have a default value to avoid null issues
UPDATE proposals SET services = '[]'::jsonb WHERE services IS NULL;
