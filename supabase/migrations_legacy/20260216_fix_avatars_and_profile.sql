-- Fix Avatar Visibility and Profile Updates

-- 1. Allow public access to view avatars
-- The previous security hardening might have removed this. Avatars are generally public profile images.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- 2. Allow users to update their own profile in app_users
-- We need to ensure they can update their avatar_url
-- Using auth.jwt() ->> 'email' to match the email column in app_users
DROP POLICY IF EXISTS "Users can update own profile" ON public.app_users;
CREATE POLICY "Users can update own profile"
ON public.app_users
FOR UPDATE
TO authenticated
USING ( email = auth.jwt() ->> 'email' )
WITH CHECK ( email = auth.jwt() ->> 'email' );
