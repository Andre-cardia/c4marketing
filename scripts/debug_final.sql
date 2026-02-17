-- Final Debug: Source Table & RPC Simulation

-- 1. Inspect Source Table and other metadata for Amplexo
select 
  id, 
  left(content, 30) as snippet,
  metadata->>'artifact_kind' as kind,
  metadata->>'source_table' as src_table,
  metadata->>'status' as status,
  metadata->>'type' as doc_type
from brain.documents 
where content ilike '%amplexo%' or metadata->>'title' ilike '%amplexo%';

-- 2. Simulate RPC exactly as the code does for Agent_Contracts
-- Filters: artifact_kind='contract', type_allowlist=['official_doc','database_record'], status='active', source_table=['acceptances','contracts','addenda']
select * from match_brain_documents(
  (array_fill(0, array[1536]))::vector,
  5,
  jsonb_build_object(
    'tenant_id', 'any-uuid-ignored', 
    'type_allowlist', jsonb_build_array('official_doc', 'database_record', 'session_summary'),
    'artifact_kind', 'contract',
    'status', 'active',
    'source_table', jsonb_build_array('acceptances', 'contracts', 'addenda')
  )
);
