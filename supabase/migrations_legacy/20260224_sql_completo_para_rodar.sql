BEGIN;
-- ==========================================
-- 1. CORREÇÃO DE PERMISSÕES PARA PROPOSTAS E ACEITES (Permite a exclusão)
-- ==========================================
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
-- ==========================================
-- 2. CORREÇÃO DA CRIAÇÃO DE USUÁRIOS (Permite que gestores adicionem usuários)
-- ==========================================
DROP POLICY IF EXISTS "Staff can insert app_users" ON "public"."app_users";
CREATE POLICY "Staff can insert app_users" ON "public"."app_users"
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'gestor')
        )
    );
-- ==========================================
-- 3. RECUPERAÇÃO DA PROPOSTA "SANTOS GOLDEN" EXCLUÍDA
-- ==========================================
INSERT INTO "public"."proposals" (
    "slug",
    "company_name",
    "responsible_name",
    "monthly_fee",
    "setup_fee",
    "media_limit",
    "contract_duration",
    "services",
    "created_at"
)
SELECT
    'santos-golden-seguros',
    'Santos Golden Seguros',
    'Viviane dos Santos',
    1900.00,
    0,
    5000.00,
    3,
    '[{"id":"traffic_management","price":1900}]'::jsonb,
    '2026-02-20 12:00:00+00'
WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."proposals"
    WHERE "slug" = 'santos-golden-seguros'
);
COMMIT;
