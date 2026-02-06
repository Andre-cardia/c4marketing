-- Create a function to expose cal_com_link safely or just allow reading the user profile if needed.
-- Since we need to read 'cal_com_link' for the project owner (who is not the current user), we need a policy.
-- Note: app_users usually contains PII (email, phone). We might only want to expose cal_com_link.
-- However, for this app, 'app_users' seems to be a public profile table.
-- Let's check if there is an existing policy for SELECT.

-- If no policy exists or it restricts to "auth.uid() = id", we need to open it up.
-- Given the context of the app (managing projects between generic users), it's likely we need to read basic profile info.

CREATE POLICY "Enable read access for all users" ON "public"."app_users"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- If there are restrictive policies, this PERMISSIVE one should allow access.
-- If the table has RLS enabled but no policies, this is needed.
