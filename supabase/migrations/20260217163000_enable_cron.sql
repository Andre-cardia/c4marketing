-- Enable pg_cron and pg_net extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
-- Schedule the job to run every 5 minutes
-- NOTE: You must replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your actual project values.
-- URL format: https://<PROJECT_REF>.supabase.co/functions/v1/brain-sync

select cron.schedule(
  'invoke-brain-sync-every-5min',
  '*/5 * * * *',
  $$
  select
    net.http_post(
        url:='https://xffdrdoaysxfkpebhywl.supabase.co/functions/v1/brain-sync',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmZmRyZG9heXN4ZmtwZWJoeXdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTgwMCwiZXhwIjoyMDg1MjcxODAwfQ.gqA7uRQU8vQVHbWNxcmkZ6Sy1WKBvW908p3FKXIMP3M"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
-- Note: To unschedule, run: select cron.unschedule('invoke-brain-sync-every-5min');;
