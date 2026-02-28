-- Migration to add cal_com_link column to app_users table
ALTER TABLE app_users 
ADD COLUMN IF NOT EXISTS cal_com_link text;
COMMENT ON COLUMN app_users.cal_com_link IS 'Cal.com scheduling link or username for the user';
