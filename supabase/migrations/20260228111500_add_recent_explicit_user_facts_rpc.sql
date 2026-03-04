-- Deterministic retrieval of recent explicit user facts
-- (used by chat-brain memory recall path).

CREATE OR REPLACE FUNCTION public.get_recent_explicit_user_facts(
  p_user_id uuid,
  p_session_id uuid DEFAULT NULL,
  p_limit int DEFAULT 6
)
RETURNS TABLE (
  fact_text text,
  created_at timestamptz,
  scope text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, brain
AS $$
  WITH base AS (
    SELECT
      regexp_replace(
        d.content,
        '^FATO EXPL[IÍ]CITO INFORMADO PELO USU[ÁA]RIO \\([^)]+\\):\\s*',
        '',
        'i'
      ) AS fact_text,
      d.created_at,
      CASE
        WHEN p_session_id IS NOT NULL
         AND d.metadata->>'session_id' = p_session_id::text
        THEN 'session'
        ELSE 'user'
      END AS scope
    FROM brain.documents d
    WHERE d.metadata->>'source' = 'explicit_user_memory'
      AND d.metadata->>'tenant_id' = p_user_id::text
      AND coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') = 'active'
  ),
  ranked AS (
    SELECT
      nullif(trim(b.fact_text), '') AS fact_text,
      b.created_at,
      b.scope,
      row_number() OVER (
        PARTITION BY lower(coalesce(nullif(trim(b.fact_text), ''), ''))
        ORDER BY
          CASE WHEN b.scope = 'session' THEN 0 ELSE 1 END,
          b.created_at DESC
      ) AS rn
    FROM base b
  )
  SELECT
    r.fact_text,
    r.created_at,
    r.scope
  FROM ranked r
  WHERE r.rn = 1
    AND r.fact_text IS NOT NULL
  ORDER BY
    CASE WHEN r.scope = 'session' THEN 0 ELSE 1 END,
    r.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 6), 50));
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_explicit_user_facts(uuid, uuid, int) TO authenticated, service_role;
