-- Check Amplexo Metadata specifically for artifact_kind
select 
  id, 
  left(content, 40) as snippet,
  metadata->>'type' as doc_type,
  metadata->>'artifact_kind' as artifact_kind,
  metadata->>'source_table' as source_table
from brain.documents 
where content ilike '%amplexo%' or metadata->>'title' ilike '%amplexo%';
