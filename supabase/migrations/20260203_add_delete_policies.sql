-- Migration to add DELETE policies for proposals and acceptances

-- 1. Add DELETE policy for proposals
-- Only authenticated users should be able to delete proposals
DROP POLICY IF EXISTS "Authenticated users can delete proposals" ON "public"."proposals";

CREATE POLICY "Authenticated users can delete proposals"
ON "public"."proposals"
FOR DELETE
TO authenticated
USING (true);

-- 2. Add DELETE policy for acceptances
-- Only authenticated users should be able to delete acceptances
DROP POLICY IF EXISTS "Authenticated users can delete acceptances" ON "public"."acceptances";

CREATE POLICY "Authenticated users can delete acceptances"
ON "public"."acceptances"
FOR DELETE
TO authenticated
USING (true);

-- 3. Grant DELETE permissions explicitly (just in case)
GRANT DELETE ON "public"."proposals" TO authenticated;
GRANT DELETE ON "public"."acceptances" TO authenticated;
