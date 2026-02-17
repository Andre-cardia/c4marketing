-- Check for Traffic Projects in Brain
select 
  id, 
  metadata->>'source_table' as source_table, 
  metadata->>'title' as title
from brain.documents 
where metadata->>'source_table' = 'traffic_projects'
   or content ilike '%tráfego%'
limit 10;
