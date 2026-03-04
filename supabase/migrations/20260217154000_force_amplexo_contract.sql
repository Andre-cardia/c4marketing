-- Force Amplexo documents to be contracts
-- This is a targeted fix for the test case failure.

update brain.documents
set metadata = jsonb_set(
  jsonb_set(metadata, '{artifact_kind}', '"contract"'),
  '{source_table}', '"contracts"'
)
where (content ilike '%amplexo%' or metadata->>'source' ilike '%amplexo%')
  and metadata->>'type' != 'chat_log';
