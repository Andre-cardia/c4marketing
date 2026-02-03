-- Add contract_snapshot column to acceptances
ALTER TABLE "public"."acceptances"
ADD COLUMN IF NOT EXISTS "contract_snapshot" JSONB;

-- Drop existing foreign key constraint if it exists (generic name assumption or loop to find it)
-- We'll try to drop the standard name 'acceptances_proposal_id_fkey'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'acceptances_proposal_id_fkey'
        AND table_name = 'acceptances'
    ) THEN
        ALTER TABLE "public"."acceptances" DROP CONSTRAINT "acceptances_proposal_id_fkey";
    END IF;
END $$;

-- Re-add foreign key constraint with ON DELETE SET NULL
ALTER TABLE "public"."acceptances"
ADD CONSTRAINT "acceptances_proposal_id_fkey"
FOREIGN KEY ("proposal_id")
REFERENCES "public"."proposals" ("id")
ON DELETE SET NULL;
