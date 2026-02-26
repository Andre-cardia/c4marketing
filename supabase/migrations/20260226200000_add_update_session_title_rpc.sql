-- Migration: update_chat_session_title RPC
-- Allows the authenticated user to persist the AI-suggested session title.
-- Uses SECURITY DEFINER to access brain.chat_sessions directly.
-- Validates ownership (user_id = auth.uid()) before updating.
-- Date: 2026-02-26

CREATE OR REPLACE FUNCTION public.update_chat_session_title(
  p_session_id uuid,
  p_title      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
BEGIN
  UPDATE brain.chat_sessions
  SET   title = p_title
  WHERE id      = p_session_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_chat_session_title(uuid, text) TO authenticated;
