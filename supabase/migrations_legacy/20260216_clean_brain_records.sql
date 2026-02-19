-- Clean up all database records from brain.documents to ensure fresh sync
-- We filter by metadata type 'database_record' to avoid deleting chat logs or user uploads.

DELETE FROM brain.documents 
WHERE metadata->>'type' = 'database_record';
