-- Fix Metadata Status
-- Set status='active' for all documents where it is missing.
-- This ensures they are visible to the default router filter.

update brain.documents
set metadata = metadata || '{"status": "active"}'::jsonb
where metadata->>'status' is null;
