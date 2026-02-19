-- SIMPLIFIED FIX: Add SELECT policies for acceptances table
-- This matches the same pattern as the INSERT policy that already works

-- For ACCEPTANCES table
DROP POLICY IF EXISTS "Public can read acceptances" ON "public"."acceptances";

CREATE POLICY "Public can read acceptances"
ON "public"."acceptances"
FOR SELECT
TO public
USING (true);

-- Grant SELECT to both anon and authenticated
GRANT SELECT ON "public"."acceptances" TO anon;
GRANT SELECT ON "public"."acceptances" TO authenticated;

-- Verify proposals also has proper SELECT access
GRANT SELECT ON "public"."proposals" TO anon;
GRANT SELECT ON "public"."proposals" TO authenticated;
