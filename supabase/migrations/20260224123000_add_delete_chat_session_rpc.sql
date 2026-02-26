CREATE OR REPLACE FUNCTION public.delete_chat_session(
  p_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT s.user_id
    INTO v_owner_id
    FROM brain.chat_sessions s
   WHERE s.id = p_session_id;

  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_owner_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM brain.chat_sessions
   WHERE id = p_session_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_chat_session(uuid) TO authenticated;
