-- ============================================================
-- Exclude canary artifacts from strategic lexical retrieval
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_strategic_context_docs(
  p_keywords text[],
  p_limit int DEFAULT 8,
  p_user_tenant_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  created_at timestamptz,
  keyword_hits int,
  source_scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 8), 30));
BEGIN
  RETURN QUERY
  WITH docs AS (
    SELECT
      d.id,
      d.content,
      d.metadata,
      d.created_at,
      (
        SELECT count(*)
        FROM unnest(coalesce(p_keywords, ARRAY[]::text[])) kw
        WHERE
          d.content ILIKE '%' || kw || '%'
          OR coalesce(d.metadata->>'title', '') ILIKE '%' || kw || '%'
          OR coalesce(d.metadata->>'document_name', '') ILIKE '%' || kw || '%'
      )::int AS hits,
      CASE
        WHEN coalesce(d.metadata->>'tenant_id', '') = 'c4_corporate_identity' THEN 'corporate'
        WHEN p_user_tenant_id IS NOT NULL AND coalesce(d.metadata->>'tenant_id', '') = p_user_tenant_id THEN 'user'
        ELSE 'shared'
      END AS scope
    FROM brain.documents d
    WHERE lower(coalesce(d.metadata->>'status', 'active')) = 'active'
      AND (
        CASE
          WHEN d.metadata ? 'searchable' THEN lower(coalesce(d.metadata->>'searchable', 'true')) <> 'false'
          ELSE true
        END
      )
      AND lower(coalesce(d.metadata->>'type', '')) <> 'chat_log'
      AND lower(coalesce(d.metadata->>'source_table', '')) <> 'chat_messages'
      AND d.content NOT ILIKE '%CANARY_MEMORY_%'
      AND (
        p_user_tenant_id IS NULL
        OR coalesce(d.metadata->>'tenant_id', '') = p_user_tenant_id
        OR coalesce(d.metadata->>'tenant_id', '') = 'c4_corporate_identity'
      )
  )
  SELECT
    docs.id,
    docs.content,
    docs.metadata,
    docs.created_at,
    docs.hits AS keyword_hits,
    docs.scope AS source_scope
  FROM docs
  WHERE docs.hits > 0
  ORDER BY
    CASE docs.scope
      WHEN 'corporate' THEN 0
      WHEN 'user' THEN 1
      ELSE 2
    END,
    docs.hits DESC,
    docs.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_strategic_context_docs(text[], int, text) TO authenticated, service_role;
