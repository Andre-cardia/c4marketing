-- Add attachments column to project_tasks
ALTER TABLE project_tasks 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::JSONB;

-- Migrate existing attachment_url to attachments array
-- Format: [{ "name": "Attachment", "url": "..." }]
UPDATE project_tasks
SET attachments = jsonb_build_array(
    jsonb_build_object(
        'name', 'Anexo', -- Default name since we didn't store it before
        'url', attachment_url
    )
)
WHERE attachment_url IS NOT NULL AND attachment_url != '';

-- Optional: Drop the old column later, or keep it for backward compatibility for a while
-- ALTER TABLE project_tasks DROP COLUMN attachment_url;
