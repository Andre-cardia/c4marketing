-- Force Re-index of all Traffic Projects
-- This will trigger the ETL (brain.handle_project_change) which adds items to brain.sync_queue
-- The cron job (every 5 mins) will pick them up and update brain.documents with correct titles.

update public.traffic_projects 
set created_at = created_at;

-- Verify pending items in queue
select * from brain.sync_queue where status = 'pending' and source_table = 'traffic_projects';
