-- FIX: Criar funções no schema PUBLIC para acessar o schema BRAIN (que não está exposto na API)

-- 1. Função de Busca (RAG) no schema Public
CREATE OR REPLACE FUNCTION public.match_brain_documents (
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
SECURITY DEFINER -- Executa com permissões do criador (admin) para acessar o schema brain
SET search_path = public, brain, extensions -- Garante acesso aos tipos e tabelas
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

-- 2. Função de Inserção no schema Public
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
BEGIN
  INSERT INTO brain.documents (content, metadata, embedding)
  VALUES (content, metadata, embedding)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.match_brain_documents TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_brain_document TO authenticated, service_role;
