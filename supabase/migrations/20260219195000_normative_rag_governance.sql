-- ============================================================
-- Normative governance for RAG retrieval
-- - document version control
-- - current/active document marking
-- - authority hierarchy support
-- - automatic invalidation of obsolete embeddings via metadata
-- Safe rollout: all normative behavior is optional by filters/functions.
-- ============================================================

-- 1) Helper: authority ranking
CREATE OR REPLACE FUNCTION public.brain_authority_rank(p_authority_type text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_authority_type, ''))
    WHEN 'policy' THEN 100
    WHEN 'procedure' THEN 90
    WHEN 'contract' THEN 80
    WHEN 'memo' THEN 60
    WHEN 'conversation' THEN 20
    ELSE 50
  END;
$$;
-- Safe timestamp parser for metadata values
CREATE OR REPLACE FUNCTION public.try_parse_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;
-- 2) Publish a new document version with superseding semantics
CREATE OR REPLACE FUNCTION public.publish_brain_document_version(
  p_content text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_embedding extensions.vector(1536) DEFAULT NULL,
  p_replace_current boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  document_key text,
  version int,
  superseded_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
DECLARE
  v_now timestamptz := now();
  v_doc_key text;
  v_source_table text;
  v_source_id text;
  v_type text;
  v_status text;
  v_is_current boolean;
  v_searchable boolean;
  v_authority_type text;
  v_authority_rank int;
  v_effective_from timestamptz;
  v_effective_to timestamptz;
  v_next_version int;
  v_superseded_count int := 0;
  v_new_id uuid;
  v_new_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'content is required';
  END IF;

  v_source_table := nullif(trim(v_new_metadata->>'source_table'), '');
  v_source_id := nullif(trim(v_new_metadata->>'source_id'), '');
  v_type := lower(coalesce(nullif(trim(v_new_metadata->>'type'), ''), 'official_doc'));

  v_doc_key := nullif(trim(v_new_metadata->>'document_key'), '');
  IF v_doc_key IS NULL THEN
    IF v_source_table IS NOT NULL AND v_source_id IS NOT NULL THEN
      v_doc_key := v_source_table || ':' || v_source_id;
    ELSIF v_source_table IS NOT NULL THEN
      v_doc_key := v_source_table || ':' || md5(p_content);
    ELSE
      v_doc_key := 'doc:' || md5(p_content);
    END IF;
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN coalesce(d.metadata->>'version', '') ~ '^[0-9]+$'
        THEN (d.metadata->>'version')::int
      ELSE NULL
    END
  ), 0) + 1
  INTO v_next_version
  FROM brain.documents d
  WHERE d.metadata->>'document_key' = v_doc_key;

  v_status := lower(coalesce(nullif(trim(v_new_metadata->>'status'), ''), 'active'));

  v_is_current := coalesce(
    CASE
      WHEN lower(coalesce(v_new_metadata->>'is_current', '')) IN ('true', '1', 'yes', 'on') THEN true
      WHEN lower(coalesce(v_new_metadata->>'is_current', '')) IN ('false', '0', 'no', 'off') THEN false
      ELSE NULL
    END,
    true
  );

  IF v_status IN ('superseded', 'revoked', 'archived') THEN
    v_is_current := false;
  END IF;

  v_searchable := coalesce(
    CASE
      WHEN lower(coalesce(v_new_metadata->>'searchable', '')) IN ('true', '1', 'yes', 'on') THEN true
      WHEN lower(coalesce(v_new_metadata->>'searchable', '')) IN ('false', '0', 'no', 'off') THEN false
      ELSE NULL
    END,
    v_status = 'active'
  );

  IF v_status IN ('superseded', 'revoked', 'archived') THEN
    v_searchable := false;
  END IF;

  v_authority_type := lower(coalesce(
    nullif(trim(v_new_metadata->>'authority_type'), ''),
    CASE v_type
      WHEN 'official_doc' THEN 'policy'
      WHEN 'database_record' THEN 'procedure'
      WHEN 'session_summary' THEN 'memo'
      WHEN 'chat_log' THEN 'conversation'
      ELSE 'memo'
    END
  ));

  v_authority_rank := coalesce(
    CASE
      WHEN coalesce(v_new_metadata->>'authority_rank', '') ~ '^-?[0-9]+$'
        THEN (v_new_metadata->>'authority_rank')::int
      ELSE NULL
    END,
    public.brain_authority_rank(v_authority_type)
  );

  BEGIN
    v_effective_from := coalesce((nullif(v_new_metadata->>'effective_from', ''))::timestamptz, v_now);
  EXCEPTION WHEN others THEN
    v_effective_from := v_now;
  END;

  BEGIN
    v_effective_to := (nullif(v_new_metadata->>'effective_to', ''))::timestamptz;
  EXCEPTION WHEN others THEN
    v_effective_to := NULL;
  END;

  IF p_replace_current AND v_is_current THEN
    UPDATE brain.documents d
    SET metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(d.metadata, '{}'::jsonb), '{status}', '"superseded"'::jsonb, true),
          '{is_current}', 'false'::jsonb, true
        ),
        '{searchable}', 'false'::jsonb, true
      ),
      '{superseded_at}', to_jsonb(v_now), true
    )
    WHERE d.metadata->>'document_key' = v_doc_key
      AND coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') = 'active'
      AND coalesce(nullif(lower(d.metadata->>'is_current'), ''), 'true') = 'true';

    GET DIAGNOSTICS v_superseded_count = ROW_COUNT;
  END IF;

  v_new_metadata := jsonb_set(v_new_metadata, '{document_key}', to_jsonb(v_doc_key), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{version}', to_jsonb(v_next_version), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{status}', to_jsonb(v_status), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{is_current}', to_jsonb(v_is_current), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{searchable}', to_jsonb(v_searchable), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{authority_type}', to_jsonb(v_authority_type), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{authority_rank}', to_jsonb(v_authority_rank), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{effective_from}', to_jsonb(v_effective_from), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{content_hash}', to_jsonb(md5(p_content)), true);

  IF v_effective_to IS NOT NULL THEN
    v_new_metadata := jsonb_set(v_new_metadata, '{effective_to}', to_jsonb(v_effective_to), true);
  END IF;

  INSERT INTO brain.documents (content, metadata, embedding)
  VALUES (p_content, v_new_metadata, p_embedding)
  RETURNING brain.documents.id INTO v_new_id;

  RETURN QUERY
  SELECT
    v_new_id,
    v_doc_key,
    v_next_version,
    v_superseded_count;
END;
$$;
-- 3) Invalidate obsolete embeddings (metadata-level invalidation)
CREATE OR REPLACE FUNCTION public.invalidate_obsolete_brain_embeddings(
  p_document_key text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  UPDATE brain.documents d
  SET metadata = jsonb_set(
    jsonb_set(coalesce(d.metadata, '{}'::jsonb), '{searchable}', 'false'::jsonb, true),
    '{invalidated_at}', to_jsonb(now()), true
  )
  WHERE
    (p_document_key IS NULL OR d.metadata->>'document_key' = p_document_key)
    AND (
      coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') IN ('superseded', 'revoked', 'archived')
      OR coalesce(nullif(lower(d.metadata->>'is_current'), ''), 'true') = 'false'
    )
    AND coalesce(nullif(lower(d.metadata->>'searchable'), ''), 'true') <> 'false';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
-- 4) Upgrade retrieval RPC to support normative mode (optional)
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
      filters->'type_allowlist' AS type_allowlist,
      filters->'type_blocklist' AS type_blocklist,
      filters->>'artifact_kind' AS artifact_kind,
      filters->'source_table' AS source_table,
      filters->>'client_id' AS client_id,
      filters->>'project_id' AS project_id,
      filters->>'source_id' AS source_id,
      nullif(filters->>'status', '') AS status,
      NULLIF(filters->>'time_window_minutes', '')::int AS time_window_minutes,
      filters->'authority_allowlist' AS authority_allowlist,
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
    -- lifecycle status
    (p.status IS NULL OR d.doc_status = lower(p.status))

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

    -- authority allowlist/min rank (optional)
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

    -- searchable/current toggles
    AND (
      NOT p.require_searchable
      OR d.doc_searchable = 'true'
    )
    AND (
      NOT p.require_current
      OR d.doc_is_current = 'true'
    )

    -- normative mode (strict governance)
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

    -- time window (only when set)
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
-- 5) Helper indexes for normative lookups
CREATE INDEX IF NOT EXISTS idx_brain_documents_document_key
  ON brain.documents ((metadata->>'document_key'));
CREATE INDEX IF NOT EXISTS idx_brain_documents_status
  ON brain.documents ((coalesce(nullif(lower(metadata->>'status'), ''), 'active')));
CREATE INDEX IF NOT EXISTS idx_brain_documents_is_current
  ON brain.documents ((coalesce(nullif(lower(metadata->>'is_current'), ''), 'true')));
CREATE INDEX IF NOT EXISTS idx_brain_documents_authority_type
  ON brain.documents ((coalesce(nullif(lower(metadata->>'authority_type'), ''), 'memo')));
CREATE INDEX IF NOT EXISTS idx_brain_documents_source
  ON brain.documents ((metadata->>'source_table'), (metadata->>'source_id'));
-- 6) Grants
GRANT EXECUTE ON FUNCTION public.brain_authority_rank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_parse_timestamptz(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_brain_document_version(text, jsonb, extensions.vector, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_obsolete_brain_embeddings(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_brain_documents(extensions.vector, int, jsonb) TO authenticated, service_role;
