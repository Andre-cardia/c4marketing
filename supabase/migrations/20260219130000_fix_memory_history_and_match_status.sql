-- ============================================================
-- Fixes:
-- 1) Cross-session memory RPC for chat-brain
-- 2) Retrieval status filter fallback for documents without metadata.status
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_recent_history(
  p_user_id uuid,
  p_limit int DEFAULT 20,
  p_exclude_session_id uuid DEFAULT NULL
)
RETURNS TABLE (
  role text,
  content text,
  created_at timestamptz,
  session_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, brain
AS $$
  SELECT
    m.role::text,
    m.content::text,
    m.created_at,
    m.session_id
  FROM brain.chat_messages m
  JOIN brain.chat_sessions s ON s.id = m.session_id
  WHERE s.user_id = p_user_id
    AND (p_exclude_session_id IS NULL OR m.session_id <> p_exclude_session_id)
  ORDER BY m.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;
GRANT EXECUTE ON FUNCTION public.get_user_recent_history(uuid, int, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.match_brain_documents(
  query_embedding vector(1536),
  match_count int,
  filters jsonb
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      (filters->>'tenant_id')::uuid AS tenant_id,
      filters->'type_allowlist' AS type_allowlist,
      filters->'type_blocklist' AS type_blocklist,
      filters->>'artifact_kind' AS artifact_kind,
      filters->'source_table' AS source_table,
      filters->>'client_id' AS client_id,
      filters->>'project_id' AS project_id,
      filters->>'source_id' AS source_id,
      COALESCE(filters->>'status', 'active') AS status,
      NULLIF(filters->>'time_window_minutes', '')::int AS time_window_minutes
  )
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM brain.documents d
  CROSS JOIN params p
  WHERE
    -- status filter with fallback:
    -- if metadata.status is absent, treat as 'active'
    (p.status IS NULL OR COALESCE(NULLIF(d.metadata->>'status', ''), 'active') = p.status)

    -- artifact kind
    AND (p.artifact_kind IS NULL OR d.metadata->>'artifact_kind' = p.artifact_kind)

    -- source_id exact filter
    AND (p.source_id IS NULL OR d.metadata->>'source_id' = p.source_id)

    -- client/project filters
    AND (p.client_id IS NULL OR d.metadata->>'client_id' = p.client_id)
    AND (p.project_id IS NULL OR d.metadata->>'project_id' = p.project_id)

    -- source_table can be string or array
    AND (
      p.source_table IS NULL
      OR (
        jsonb_typeof(p.source_table) = 'string'
        AND d.metadata->>'source_table' = trim(both '"' from p.source_table::text)
      )
      OR (
        jsonb_typeof(p.source_table) = 'array'
        AND (d.metadata->>'source_table') = ANY (
          SELECT jsonb_array_elements_text(p.source_table)
        )
      )
    )

    -- allowlist (if present)
    AND (
      p.type_allowlist IS NULL
      OR jsonb_typeof(p.type_allowlist) <> 'array'
      OR (d.metadata->>'type') = ANY (
        SELECT jsonb_array_elements_text(p.type_allowlist)
      )
    )

    -- blocklist (if present)
    AND NOT (
      p.type_blocklist IS NOT NULL
      AND jsonb_typeof(p.type_blocklist) = 'array'
      AND (d.metadata->>'type') = ANY (
        SELECT jsonb_array_elements_text(p.type_blocklist)
      )
    )

    -- time window (only when set)
    AND (
      p.time_window_minutes IS NULL
      OR d.created_at >= now() - make_interval(mins => p.time_window_minutes)
    )
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;
