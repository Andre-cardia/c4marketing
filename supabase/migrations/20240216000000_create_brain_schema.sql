-- Create a dedicated schema for the "Second Brain" to ensure total isolation
CREATE SCHEMA IF NOT EXISTS brain;

-- Enable the pgvector extension if not already enabled (usually in extensions or public)
-- Note: In Supabase, extensions are often installed in the 'extensions' schema.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create the documents table within the 'brain' schema
CREATE TABLE IF NOT EXISTS brain.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb, -- store metadata like source, author, date
  embedding extensions.vector(1536), -- 1536 dimensions for text-embedding-3-small
  created_at timestamptz DEFAULT now()
);

-- Create an index for faster similarity search using HNSW
-- This index is crucial for performance as the dataset grows
CREATE INDEX IF NOT EXISTS documents_embedding_idx 
ON brain.documents 
USING hnsw (embedding extensions.vector_cosine_ops);

-- Create a secure RPC function to search for documents
-- This function runs inside the database and stays isolated
CREATE OR REPLACE FUNCTION brain.match_documents (
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM brain.documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant usage on the schema to authenticated users (via API/Edge Functions)
GRANT USAGE ON SCHEMA brain TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA brain TO service_role; -- Service role (Edge Functions) has full access
GRANT SELECT ON ALL TABLES IN SCHEMA brain TO authenticated; -- Authenticated users can read (optional, can be restricted if only Edge Functions should access)

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION brain.match_documents TO authenticated, service_role;
