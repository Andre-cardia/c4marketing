-- Enable RLS on acceptances table (Supabase reported it as disabled but with policies)
ALTER TABLE "public"."acceptances" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on contract_templates table (Supabase reported it as disabled public table)
ALTER TABLE "public"."contract_templates" ENABLE ROW LEVEL SECURITY;

-- Ensure public read policy for contract_templates exists
-- This is required for the proposal creation page to fetch templates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'contract_templates'
        AND policyname = 'Allow public read access to contract templates'
    ) THEN
        CREATE POLICY "Allow public read access to contract templates"
        ON "public"."contract_templates"
        FOR SELECT
        TO public
        USING (true);
    END IF;
END
$$;
