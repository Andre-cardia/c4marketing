-- Allow authenticated users (Staff) to insert active projects manually
-- This is required for the "Novo Projeto" feature in the dashboard.

BEGIN;

-- Drop existing restricted policies if they conflict (optional, but good for cleanliness if we want to redefine)
-- For now, we just ADD permission. RLS is "permissive" by default (OR logic), so adding this policy should enable access.

CREATE POLICY "Staff can insert acceptances" ON "public"."acceptances"
    FOR INSERT TO authenticated
    WITH CHECK (true);

COMMIT;
