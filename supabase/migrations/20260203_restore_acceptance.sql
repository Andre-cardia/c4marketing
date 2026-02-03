-- 1. Restore the lost acceptance record (Manual Recovery)
-- Note: The original proposal was deleted, so proposal_id is NULL.
-- Contract snapshot is also unavailable for this old record.
INSERT INTO "public"."acceptances" (
    "name",
    "email",
    "cpf",
    "company_name",
    "cnpj",
    "timestamp",
    "status",
    "proposal_id",
    "contract_snapshot"
) VALUES (
    'Marcos Fachinetto', 
    'marcosfachinetto@yahoo.com.br', 
    '032.985.849-16', 
    'Amplexo Diesel', 
    '03.953.240/0003-60', 
    '2026-02-02 20:30:36', 
    'Inativo', 
    NULL, 
    NULL
);

-- 2. ENSURE "Safe Delete" Policy is Active (CRITICAL)
-- This prevents future acceptances from being deleted when a proposal is deleted.
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

ALTER TABLE "public"."acceptances"
ADD CONSTRAINT "acceptances_proposal_id_fkey"
FOREIGN KEY ("proposal_id")
REFERENCES "public"."proposals" ("id")
ON DELETE SET NULL;
