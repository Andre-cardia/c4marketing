-- Add attachments column to project_tasks (safe + idempotent)
ALTER TABLE project_tasks
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::JSONB;

-- Backfill only rows that still don't have attachments.
-- Avoid overwriting rows already migrated or edited manually.
UPDATE project_tasks
SET attachments = jsonb_build_array(
    jsonb_build_object(
        'name', 'Anexo',
        'url', attachment_url
    )
)
WHERE attachment_url IS NOT NULL
  AND attachment_url != ''
  AND (
    attachments IS NULL
    OR attachments = '[]'::jsonb
  );
