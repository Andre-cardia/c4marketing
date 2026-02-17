-- Check Metadata Status
-- The Router defaults to searching for status='active'.
-- If these docs have no status or a different status, they are being hidden.

select 
  id, 
  metadata->>'title' as title,
  metadata->>'type' as doc_type,
  metadata->>'artifact_kind' as kind,
  metadata->>'status' as status
from brain.documents 
where content ilike '%amplexo%' or metadata->>'title' ilike '%amplexo%';
