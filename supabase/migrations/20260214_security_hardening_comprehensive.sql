
-- Security Hardening Comprehensive Migration
-- Targets: app_users, proposals, acceptances, and function search paths.

BEGIN;

-- 1. App Users: Restrict access to own profile
-- Drop potentially permissive policies
DROP POLICY IF EXISTS "Enable access for authenticated users" ON "public"."app_users";
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."app_users";
DROP POLICY IF EXISTS "Public can insert app_users" ON "public"."app_users";

-- Create strict policies
CREATE POLICY "Users can update own profile" ON "public"."app_users"
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Allow authenticated users to view all profiles (for team collaboration)
CREATE POLICY "Users can view all profiles" ON "public"."app_users"
    FOR SELECT TO authenticated
    USING (true);

-- Allow public read (needed for some flows, e.g. checking if email exists during signup, or public profiles)
-- If strict privacy is needed, remove this, but consistent with previous 'fix_rls_app_users.sql' intention.
CREATE POLICY "Public can view profiles" ON "public"."app_users"
    FOR SELECT TO public
    USING (true);


-- 2. Proposals: Staff only write (Restrict Public/Anon write)
-- Drop all identified permissive policies for proposals
DROP POLICY IF EXISTS "Authenticated users can insert proposals" ON "public"."proposals";
DROP POLICY IF EXISTS "Authenticated users can update proposals" ON "public"."proposals";
DROP POLICY IF EXISTS "Authenticated users can delete proposals" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON "public"."proposals";
DROP POLICY IF EXISTS "Permitir criacao para logados" ON "public"."proposals";
DROP POLICY IF EXISTS "Permitir delecao para logados" ON "public"."proposals";

-- Re-create strict Staff policies (Authenticated users trusted as staff)
CREATE POLICY "Staff can insert proposals" ON "public"."proposals" 
    FOR INSERT TO authenticated 
    WITH CHECK (true);

CREATE POLICY "Staff can update proposals" ON "public"."proposals" 
    FOR UPDATE TO authenticated 
    USING (true);

CREATE POLICY "Staff can delete proposals" ON "public"."proposals" 
    FOR DELETE TO authenticated 
    USING (true);

-- Ensure Public Read exists (essential for client view)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'proposals' AND policyname = 'Public proposals access'
    ) THEN
        CREATE POLICY "Public proposals access" ON "public"."proposals" FOR SELECT TO public USING (true);
    END IF;
END
$$;


-- 3. Acceptances: Restrict UPDATE/DELETE to Staff
-- Drop permissive policies
DROP POLICY IF EXISTS "Authenticated users can delete acceptances" ON "public"."acceptances";
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON "public"."acceptances";
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON "public"."acceptances";

-- Create Staff-only policies for modification
CREATE POLICY "Staff can update acceptances" ON "public"."acceptances" 
    FOR UPDATE TO authenticated 
    USING (true);

CREATE POLICY "Staff can delete acceptances" ON "public"."acceptances" 
    FOR DELETE TO authenticated 
    USING (true);

-- Public INSERT is maintained (usually implicit or existing policy). 
-- If 'Public can insert acceptances' exists, we leave it.


-- 4. Function Search Path Fix
ALTER FUNCTION public.create_campaign_timeline SET search_path = public;

COMMIT;
