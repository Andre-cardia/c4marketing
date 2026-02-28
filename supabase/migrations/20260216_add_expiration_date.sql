-- Add expiration_date to acceptances table
ALTER TABLE acceptances
ADD COLUMN IF NOT EXISTS expiration_date DATE;
