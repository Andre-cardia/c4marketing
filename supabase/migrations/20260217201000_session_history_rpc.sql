-- ============================================================
-- RPC: get_session_history
-- Permite ao chat-brain (service_role) ler o histórico
-- de uma sessão para contexto multi-turn
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_session_history(
  p_session_id uuid,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  role text,
  content text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
BEGIN
  RETURN QUERY
  SELECT m.role::text, m.content::text, m.created_at
  FROM brain.chat_messages m
  WHERE m.session_id = p_session_id
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_session_history TO authenticated, service_role;
