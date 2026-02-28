-- ============================================================
-- RPC Proxy Functions for brain-sync Edge Function
-- The 'brain' schema is NOT exposed via PostgREST API,
-- so we need public functions to access it.
-- ============================================================

-- 1. Fetch pending sync queue items
CREATE OR REPLACE FUNCTION public.get_pending_sync_items(p_limit int DEFAULT 10)
RETURNS TABLE (
  id bigint,
  source_table text,
  source_id text,
  operation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.source_table::text, q.source_id::text, q.operation::text
  FROM brain.sync_queue q
  WHERE q.status = 'pending'
  ORDER BY q.created_at ASC
  LIMIT p_limit;
END;
$$;
-- 2. Update sync queue item status
CREATE OR REPLACE FUNCTION public.update_sync_item_status(
  p_id bigint,
  p_status text,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
BEGIN
  UPDATE brain.sync_queue
  SET status = p_status,
      processed_at = NOW(),
      error_message = p_error_message
  WHERE id = p_id;
END;
$$;
-- 3. Upsert brain document (replaces old + inserts new, with embedding)
--    We already have insert_brain_document, but let's make sure it handles dedup.
--    (Already created in 20260216_update_brain_insert.sql, just granting here)

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_pending_sync_items TO service_role;
GRANT EXECUTE ON FUNCTION public.update_sync_item_status TO service_role;
