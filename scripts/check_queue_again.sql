-- Check Queue Status (Again)
select id, source_table, operation, status, error_message, created_at, processed_at
from brain.sync_queue
where source_table = 'traffic_projects'
order by created_at desc
limit 5;
