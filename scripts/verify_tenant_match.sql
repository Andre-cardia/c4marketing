-- Verification: Tenant ID Alignment (Corrected Vector)

-- 1. Check Amplexo document's tenant_id and metadata
select id, metadata->>'tenant_id' as doc_tenant_id, metadata->'source_table' as source_table, metadata->'artifact_kind' as kind
from brain.documents
where content ilike '%amplexo%' or metadata->>'title' ilike '%amplexo%'
limit 5;

-- 2. Check the user's tenant_id
select id, email, raw_user_meta_data->>'tenant_id' as user_tenant_id
from auth.users
order by last_sign_in_at desc
limit 5;

-- 3. Test RPC match manually
-- Using array_fill to generate a proper 1536-dim zero vector
with sample_tenant as (
  select (metadata->>'tenant_id')::uuid as tid from brain.documents limit 1
)
select * from match_brain_documents(
  (array_fill(0, array[1536]))::vector, -- Generates a valid zero vector of size 1536
  5,
  jsonb_build_object(
    'tenant_id', (select tid from sample_tenant), 
    'type_allowlist', jsonb_build_array('official_doc', 'database_record'),
    'artifact_kind', 'contract',
    'source_table', jsonb_build_array('contracts', 'acceptances')
  )
);
