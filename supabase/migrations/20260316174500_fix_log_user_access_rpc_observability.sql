-- Make access logging observable and route writes through a server-side insert.
-- This avoids silent success on the client when the REST insert endpoint fails.

DROP FUNCTION IF EXISTS public.log_user_access();

CREATE FUNCTION public.log_user_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_user_email text;
BEGIN
    v_user_id := auth.uid();
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'not_authenticated'
        );
    END IF;

    INSERT INTO public.access_logs (user_id, user_email)
    VALUES (v_user_id, v_user_email);

    RETURN jsonb_build_object(
        'success', true
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sqlstate', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_access() TO authenticated;

NOTIFY pgrst, 'reload schema';
