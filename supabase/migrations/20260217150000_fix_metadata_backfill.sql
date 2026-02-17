-- Backfill metadata script
-- Goal: Populate 'artifact_kind' and 'source_table' for existing documents so strict filters work.

-- 1. Contracts / Acceptances
update brain.documents
set metadata = jsonb_set(
  jsonb_set(metadata, '{artifact_kind}', '"contract"'),
  '{source_table}', '"acceptances"'
)
where metadata->>'type' != 'chat_log'
  and (
    metadata->>'source' ilike '%acceptance%' 
    or metadata->>'source' ilike '%contrato%'
    or metadata->>'source_table' = 'acceptances'
    or content ilike '%contrato%'
  )
  and metadata->>'artifact_kind' is null;

-- 2. Proposals
update brain.documents
set metadata = jsonb_set(
  jsonb_set(metadata, '{artifact_kind}', '"proposal"'),
  '{source_table}', '"proposals"'
)
where metadata->>'type' != 'chat_log'
  and (
    metadata->>'source' ilike '%proposal%' 
    or metadata->>'source' ilike '%proposta%'
    or metadata->>'source_table' = 'proposals'
    or content ilike '%proposta%'
  )
  and metadata->>'artifact_kind' is null;

-- 3. Projects
update brain.documents
set metadata = jsonb_set(
  jsonb_set(metadata, '{artifact_kind}', '"project"'),
  '{source_table}', '"projects"'
)
where metadata->>'type' != 'chat_log'
  and (
    metadata->>'source' ilike '%project%' 
    or metadata->>'source' ilike '%projeto%'
    or metadata->>'source_table' = 'projects'
  )
  and metadata->>'artifact_kind' is null;

-- 4. Default: tag everything else as 'unknown' or rely on content?
-- For now, let's keep it safe. If it doesn't match above, it might be hidden from strict filters.
