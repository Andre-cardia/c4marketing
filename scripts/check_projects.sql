-- Check for Project Documents
select 
  id, 
  metadata->>'title' as title,
  metadata->>'artifact_kind' as kind,
  left(content, 100) as snippet
from brain.documents 
where 
  metadata->>'artifact_kind' = 'project' 
  OR content ilike '%projeto%' 
  OR metadata->>'title' ilike '%projeto%'
limit 10;
