-- Content Analysis
-- 1. Get full content of the Amplexo docs we found
select 
  id, 
  metadata->>'source_table' as source_table,
  metadata->>'title' as title,
  left(content, 300) as content_preview
from brain.documents 
where content ilike '%amplexo%' or metadata->>'title' ilike '%amplexo%'
limit 5;

-- 2. Check if we have ANY documents from 'contracts' table (the templates)
select 
  id,
  metadata->>'title' as title,
  left(content, 100) as snippet
from brain.documents
where metadata->>'source_table' = 'contracts'
limit 5;
