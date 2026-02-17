-- Diagnostic: Check Amplexo documents
select 
  id, 
  left(content, 50) as snippet, 
  metadata 
from brain.documents 
where content ilike '%amplexo%' or metadata->>'source' ilike '%amplexo%';
