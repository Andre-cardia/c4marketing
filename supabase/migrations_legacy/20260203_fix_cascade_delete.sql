-- CRITICAL FIX: Reset Foreign Key Constraints to Prevent Cascade Deletion

DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. DROP ALL existing foreign key constraints on proposal_id to avoid conflicts
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.key_column_usage
        WHERE table_name = 'acceptances' 
        AND column_name = 'proposal_id'
        AND table_schema = 'public'
    ) LOOP
        EXECUTE 'ALTER TABLE "public"."acceptances" DROP CONSTRAINT "' || r.constraint_name || '"';
    END LOOP;
END $$;

-- 2. ADD the correct constraint with ON DELETE SET NULL
-- This ensures that when a Proposal is deleted, the Acceptance remains (proposal_id becomes NULL)
ALTER TABLE "public"."acceptances"
ADD CONSTRAINT "acceptances_proposal_id_fkey"
FOREIGN KEY ("proposal_id")
REFERENCES "public"."proposals" ("id")
ON DELETE SET NULL;
