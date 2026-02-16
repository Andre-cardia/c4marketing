-- Update the insert_brain_document function to support deduplication
-- This allows us to re-sync data without creating duplicates

CREATE OR REPLACE FUNCTION public.insert_brain_document (
  content text,
  metadata jsonb,
  embedding extensions.vector(1536)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
DECLARE
  new_id uuid;
  source_tbl text;
  source_id text;
BEGIN
  -- Extract source information from metadata if it exists
  source_tbl := metadata->>'source_table';
  source_id := metadata->>'source_id';

  -- If we have source info, delete existing documents for this source
  -- This acts as an "update" by replacing the old embedding
  IF source_tbl IS NOT NULL AND source_id IS NOT NULL THEN
    DELETE FROM brain.documents 
    WHERE metadata->>'source_table' = source_tbl 
      AND metadata->>'source_id' = source_id;
  END IF;

  -- Insert the new document
  INSERT INTO brain.documents (content, metadata, embedding)
  VALUES (content, metadata, embedding)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;
