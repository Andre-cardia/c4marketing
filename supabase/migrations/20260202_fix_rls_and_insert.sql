-- Ensure RLS is enabled
ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;

-- 1. DROP EXISTING POLICIES to avoid conflicts/duplicates
DROP POLICY IF EXISTS "Public proposals access" ON "public"."proposals";
DROP POLICY IF EXISTS "Authenticated users can insert proposals" ON "public"."proposals";
DROP POLICY IF EXISTS "Authenticated users can update proposals" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."proposals";
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."proposals";

-- 2. CREATE READ POLICY (Anyone can read/view proposals via slug)
CREATE POLICY "Public proposals access"
ON "public"."proposals"
FOR SELECT
TO public
USING (true);

-- 3. CREATE INSERT POLICY (Only authenticated users can create)
-- Assuming users are authenticated via Supabase Auth
CREATE POLICY "Authenticated users can insert proposals"
ON "public"."proposals"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. CREATE UPDATE POLICY (Optional: Only authenticated can update)
CREATE POLICY "Authenticated users can update proposals"
ON "public"."proposals"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. GRANT PERMISSIONS (Just in case)
GRANT SELECT ON "public"."proposals" TO anon;
GRANT SELECT ON "public"."proposals" TO authenticated;
GRANT INSERT ON "public"."proposals" TO authenticated;
GRANT UPDATE ON "public"."proposals" TO authenticated;
