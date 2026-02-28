-- Migration to fix RLS policies for proposals and acceptances using Email check
-- This is more robust as the system uses email to link app_users.

BEGIN;
-- 1. Proposals Policies
DROP POLICY IF EXISTS "Staff full access" ON "public"."proposals";
CREATE POLICY "Staff full access" ON "public"."proposals"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE email = auth.jwt() ->> 'email' 
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    );
-- 2. Acceptances Policies
DROP POLICY IF EXISTS "Staff full access" ON "public"."acceptances";
CREATE POLICY "Staff full access" ON "public"."acceptances"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    );
COMMIT;
