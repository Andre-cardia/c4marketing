-- 1. DELETE POLLUTED CHAT LOGS
-- We identify them by content matching the known pollution pattern.
DELETE FROM brain.documents 
WHERE content ILIKE '%Qual a data%';

-- 2. UPDATE MATCH FUNCTION TO EXCLUDE CHAT LOGS PERMANENTLY
CREATE OR REPLACE FUNCTION public.match_brain_documents (
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM brain.documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  AND (d.metadata->>'type' IS NULL OR d.metadata->>'type' != 'chat_log') -- Filter out chat logs
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
