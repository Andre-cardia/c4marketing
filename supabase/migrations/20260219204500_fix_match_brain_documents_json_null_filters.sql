-- ============================================================
-- Fix: normalize JSON null filters in match_brain_documents
-- Prevents false-negative retrieval when filter keys are present with null value
-- (e.g. source_table: null, type_allowlist: null).
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_brain_documents(
  query_embedding extensions.vector(1536),
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
      NULLIF(filters->'type_allowlist', 'null'::jsonb) AS type_allowlist,
      NULLIF(filters->'type_blocklist', 'null'::jsonb) AS type_blocklist,
      filters->>'artifact_kind' AS artifact_kind,
      NULLIF(filters->'source_table', 'null'::jsonb) AS source_table,
      filters->>'client_id' AS client_id,
      filters->>'project_id' AS project_id,
      filters->>'source_id' AS source_id,
      nullif(filters->>'status', '') AS status,
      NULLIF(filters->>'time_window_minutes', '')::int AS time_window_minutes,
      NULLIF(filters->'authority_allowlist', 'null'::jsonb) AS authority_allowlist,
      CASE
        WHEN coalesce(filters->>'authority_rank_min', '') ~ '^-?[0-9]+$'
          THEN (filters->>'authority_rank_min')::int
        ELSE NULL
      END AS authority_rank_min,
      CASE lower(coalesce(filters->>'normative_mode', 'false'))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        ELSE false
      END AS normative_mode,
      CASE lower(coalesce(filters->>'require_current', 'false'))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        ELSE false
      END AS require_current,
      CASE lower(coalesce(filters->>'require_searchable', 'true'))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        ELSE false
      END AS require_searchable
  ),
  docs AS (
    SELECT
      d.id,
      d.content,
      d.metadata,
      d.embedding,
      d.created_at,
      coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') AS doc_status,
      coalesce(nullif(lower(d.metadata->>'is_current'), ''), 'true') AS doc_is_current,
      coalesce(nullif(lower(d.metadata->>'searchable'), ''), 'true') AS doc_searchable,
      coalesce(nullif(lower(d.metadata->>'authority_type'), ''), 'memo') AS doc_authority_type,
      coalesce(
        CASE
          WHEN coalesce(d.metadata->>'authority_rank', '') ~ '^-?[0-9]+$'
            THEN (d.metadata->>'authority_rank')::int
          ELSE NULL
        END,
        public.brain_authority_rank(d.metadata->>'authority_type')
      ) AS doc_authority_rank,
      coalesce(public.try_parse_timestamptz(d.metadata->>'effective_from'), d.created_at) AS doc_effective_from,
      public.try_parse_timestamptz(d.metadata->>'effective_to') AS doc_effective_to
    FROM brain.documents d
  )
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM docs d
  CROSS JOIN params p
  WHERE
    (p.status IS NULL OR d.doc_status = lower(p.status))
    AND (p.artifact_kind IS NULL OR d.metadata->>'artifact_kind' = p.artifact_kind)
    AND (p.source_id IS NULL OR d.metadata->>'source_id' = p.source_id)
    AND (p.client_id IS NULL OR d.metadata->>'client_id' = p.client_id)
    AND (p.project_id IS NULL OR d.metadata->>'project_id' = p.project_id)
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
    AND (
      p.type_allowlist IS NULL
      OR jsonb_typeof(p.type_allowlist) <> 'array'
      OR (d.metadata->>'type') = ANY (
        SELECT jsonb_array_elements_text(p.type_allowlist)
      )
    )
    AND NOT (
      p.type_blocklist IS NOT NULL
      AND jsonb_typeof(p.type_blocklist) = 'array'
      AND (d.metadata->>'type') = ANY (
        SELECT jsonb_array_elements_text(p.type_blocklist)
      )
    )
    AND (
      p.authority_allowlist IS NULL
      OR jsonb_typeof(p.authority_allowlist) <> 'array'
      OR d.doc_authority_type = ANY (
        SELECT lower(jsonb_array_elements_text(p.authority_allowlist))
      )
    )
    AND (
      p.authority_rank_min IS NULL
      OR d.doc_authority_rank >= p.authority_rank_min
    )
    AND (
      NOT p.require_searchable
      OR d.doc_searchable = 'true'
    )
    AND (
      NOT p.require_current
      OR d.doc_is_current = 'true'
    )
    AND (
      NOT p.normative_mode
      OR (
        d.doc_status = 'active'
        AND d.doc_is_current = 'true'
        AND d.doc_searchable = 'true'
        AND d.doc_effective_from <= now()
        AND (d.doc_effective_to IS NULL OR d.doc_effective_to >= now())
      )
    )
    AND (
      p.time_window_minutes IS NULL
      OR d.created_at >= now() - make_interval(mins => p.time_window_minutes)
    )
  ORDER BY
    CASE WHEN p.normative_mode THEN d.doc_authority_rank ELSE 0 END DESC,
    CASE WHEN p.normative_mode AND d.doc_is_current = 'true' THEN 1 ELSE 0 END DESC,
    d.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_brain_documents(extensions.vector, int, jsonb) TO authenticated, service_role;
