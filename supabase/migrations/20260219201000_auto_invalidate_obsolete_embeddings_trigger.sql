-- ============================================================
-- Automatic invalidation of obsolete embeddings
-- ============================================================

CREATE OR REPLACE FUNCTION public.brain_documents_auto_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_status text;
  v_is_current text;
BEGIN
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb);

  v_status := coalesce(nullif(lower(NEW.metadata->>'status'), ''), 'active');
  v_is_current := coalesce(nullif(lower(NEW.metadata->>'is_current'), ''), 'true');

  IF v_status IN ('superseded', 'revoked', 'archived') OR v_is_current = 'false' THEN
    NEW.metadata := jsonb_set(NEW.metadata, '{searchable}', 'false'::jsonb, true);
    NEW.metadata := jsonb_set(NEW.metadata, '{invalidated_at}', to_jsonb(now()), true);
  ELSIF coalesce(nullif(lower(NEW.metadata->>'searchable'), ''), '') = '' THEN
    NEW.metadata := jsonb_set(NEW.metadata, '{searchable}', 'true'::jsonb, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brain_documents_auto_invalidate ON brain.documents;

CREATE TRIGGER trg_brain_documents_auto_invalidate
BEFORE INSERT OR UPDATE ON brain.documents
FOR EACH ROW
EXECUTE FUNCTION public.brain_documents_auto_invalidate();

GRANT EXECUTE ON FUNCTION public.brain_documents_auto_invalidate() TO authenticated, service_role;
