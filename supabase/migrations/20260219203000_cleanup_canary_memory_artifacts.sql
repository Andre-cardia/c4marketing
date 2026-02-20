-- Cleanup: remove canary validation artifacts from cognitive memory/user facts
-- Safe because it targets explicit unique test markers only.

DELETE FROM brain.documents
WHERE
  (
    content ILIKE '%POLITICA_CANARIO_20260219%'
    OR content ILIKE '%qual informacao eu pedi para salvar no cerebro?%'
  )
  AND coalesce(lower(metadata->>'source'), '') IN ('explicit_user_memory', 'cognitive_live_memory');
