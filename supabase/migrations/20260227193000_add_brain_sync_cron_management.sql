-- Secure cron management for brain-sync jobs.
-- Avoids hardcoded project URL/service_role token inside migrations.

CREATE OR REPLACE FUNCTION public.schedule_brain_sync_job(
  p_url              text,
  p_service_role_key text,
  p_job_name         text DEFAULT 'invoke-brain-sync-every-5min',
  p_schedule         text DEFAULT '*/5 * * * *'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
  v_command text;
BEGIN
  IF nullif(trim(coalesce(p_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_url is required';
  END IF;

  IF nullif(trim(coalesce(p_service_role_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_service_role_key is required';
  END IF;

  IF nullif(trim(coalesce(p_job_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_job_name is required';
  END IF;

  IF nullif(trim(coalesce(p_schedule, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_schedule is required';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_service_role_key
  );

  v_command := format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
    $cmd$,
    p_url,
    v_headers::text
  );

  -- Recreate the job safely if it already exists.
  BEGIN
    PERFORM cron.unschedule(p_job_name);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  PERFORM cron.schedule(p_job_name, p_schedule, v_command);
  RETURN p_job_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.unschedule_brain_sync_job(
  p_job_name text DEFAULT 'invoke-brain-sync-every-5min'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(trim(coalesce(p_job_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_job_name is required';
  END IF;

  PERFORM cron.unschedule(p_job_name);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_brain_sync_job(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_brain_sync_job(text) TO service_role;
