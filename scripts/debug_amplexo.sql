-- Debug Amplexo Specifically
-- Goal: Find out why Amplexo is filtered out while other contracts appear.

-- 1. Get raw metadata of Amplexo docs
select 
  id, 
  left(content, 40) as snippet,
  metadata->>'artifact_kind' as kind,
  metadata->>'source_table' as src_table,
  metadata->>'status' as status,
  metadata->>'type' as doc_type
from brain.documents 
where content ilike '%amplexo%' or metadata->>'title' ilike '%amplexo%';

-- 2. Simulate RPC but filter the results for Amplexo inside SQL
-- This proves if they pass the JSON filters or not.
select * from match_brain_documents(
  (array_fill(0, array[1536]))::vector,
  100, -- Get more candidates to ensure we don't miss it just due to limit
  jsonb_build_object(
    'tenant_id', 'any', 
    'type_allowlist', jsonb_build_array('official_doc', 'database_record', 'session_summary'),
    'artifact_kind', 'contract',
    'status', 'active',
    'source_table', jsonb_build_array('acceptances', 'contracts', 'addenda')
  )
)
where content ilike '%amplexo%';
