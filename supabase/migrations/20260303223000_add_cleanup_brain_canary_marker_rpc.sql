-- ============================================================
-- Safe cleanup RPC for canary explicit memory markers
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_brain_canary_marker(
  p_marker text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_marker text := nullif(trim(p_marker), '');
  v_deleted_count int := 0;
BEGIN
  IF v_marker IS NULL THEN
    RETURN 0;
  END IF;

  -- Guardrail to avoid accidental broad cleanup.
  IF left(v_marker, 14) <> 'CANARY_MEMORY_' THEN
    RAISE EXCEPTION 'Invalid canary marker format';
  END IF;

  DELETE FROM brain.documents d
   WHERE d.metadata->>'source' = 'explicit_user_memory'
     AND d.content ILIKE '%' || v_marker || '%';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_brain_canary_marker(text) TO authenticated, service_role;
