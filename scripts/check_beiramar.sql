-- Search for Beiramar Data
-- Goal: Check if the project visible in the UI is indexed in the brain.

select 
  id, 
  metadata->>'source_table' as source_table,
  metadata->>'title' as title,
  metadata->>'artifact_kind' as kind,
  left(content, 100) as snippet
from brain.documents 
where content ilike '%beiramar%' or metadata->>'title' ilike '%beiramar%';
