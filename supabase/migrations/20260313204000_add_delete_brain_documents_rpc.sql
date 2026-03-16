-- ============================================================
-- SEGURANÇA MÉDIO: Implementa RPC de deleção de documentos do Brain
-- Necessário para que brain-sync propague DELETEs ao índice vetorial
-- e evite vazamento de dados de projetos/clientes removidos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_brain_documents_by_source(
  p_source_table text,
  p_source_id    text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $func$
DECLARE
  v_deleted integer;
BEGIN
  IF trim(coalesce(p_source_table, '')) = '' THEN
    RAISE EXCEPTION 'p_source_table e obrigatorio';
  END IF;
  IF trim(coalesce(p_source_id, '')) = '' THEN
    RAISE EXCEPTION 'p_source_id e obrigatorio';
  END IF;

  DELETE FROM brain.documents
   WHERE metadata->>'source_table' = p_source_table
     AND metadata->>'source_id'    = p_source_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$func$;

-- Apenas service_role pode deletar documentos do Brain
GRANT EXECUTE ON FUNCTION public.delete_brain_documents_by_source(text, text) TO service_role;

COMMENT ON FUNCTION public.delete_brain_documents_by_source IS
  'Remove embeddings do indice vetorial para um registro deletado. Chamada pelo brain-sync ao processar operacoes DELETE.';
