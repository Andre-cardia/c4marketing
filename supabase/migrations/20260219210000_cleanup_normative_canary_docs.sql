-- Cleanup of normative canary artifacts used during rollout validation

DELETE FROM brain.documents
WHERE
  content ILIKE '%CANARIO_NORMATIVE_20260219%'
  OR content ILIKE '%CANARIO_EFFECTIVE_2020%'
  OR content ILIKE '%CANARIO_INSERT_CHECK_20260219%'
  OR content ILIKE '%LEGACY_XYZZY%'
  OR content ILIKE '%VIGENTE_AB12%';
