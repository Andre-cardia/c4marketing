-- Migration to fix missing Staff policies for proposals and acceptances
-- Enables INSERT, UPDATE, and DELETE for admin, gestor, operacional, and comercial roles.

BEGIN;

-- 1. Proposals Policies
-- Ensure staff can manage proposals
DROP POLICY IF EXISTS "Staff full access" ON "public"."proposals";
CREATE POLICY "Staff full access" ON "public"."proposals"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    );

-- 2. Acceptances Policies
-- Ensure staff can manage acceptances
DROP POLICY IF EXISTS "Staff full access" ON "public"."acceptances";
CREATE POLICY "Staff full access" ON "public"."acceptances"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    );

-- 3. Ensure Grants are correct
GRANT ALL ON "public"."proposals" TO authenticated;
GRANT ALL ON "public"."acceptances" TO authenticated;
GRANT ALL ON "public"."proposals" TO service_role;
GRANT ALL ON "public"."acceptances" TO service_role;

COMMIT;
