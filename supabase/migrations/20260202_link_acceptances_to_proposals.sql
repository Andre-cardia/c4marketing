
-- Add proposal_id to acceptances if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'acceptances'
        AND column_name = 'proposal_id'
    ) THEN
        ALTER TABLE "public"."acceptances"
        ADD COLUMN "proposal_id" BIGINT REFERENCES "public"."proposals"("id");
    END IF;
END
$$;

-- Ensure RLS allows public insert (already working likely, but good to be safe)
ALTER TABLE "public"."acceptances" ENABLE ROW LEVEL SECURITY;

-- If policy doesn't exist for insert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'acceptances'
        AND policyname = 'Public can insert acceptances'
    ) THEN
        CREATE POLICY "Public can insert acceptances"
        ON "public"."acceptances"
        FOR INSERT
        TO public
        WITH CHECK (true);
    END IF;
END
$$;

-- Grant permissions if needed
GRANT INSERT ON "public"."acceptances" TO anon;
GRANT INSERT ON "public"."acceptances" TO public;
