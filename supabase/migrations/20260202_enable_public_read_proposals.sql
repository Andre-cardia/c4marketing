-- Enable RLS on proposals table (ensure it is on)
ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;
-- Create policy to allow public read access (for viewing proposals via link)
-- We check if policy exists to avoid errors on repeated runs, or we can just drop and recreate.
-- For simplicity in this migration style, we'll try to create it.
-- Note: 'IF NOT EXISTS' is supported in newer Postgres versions for policies, 
-- but often safer to drop if exists or use a DO block.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'proposals'
        AND policyname = 'Public proposals access'
    ) THEN
        CREATE POLICY "Public proposals access"
        ON "public"."proposals"
        FOR SELECT
        TO public
        USING (true);
    END IF;
END
$$;
