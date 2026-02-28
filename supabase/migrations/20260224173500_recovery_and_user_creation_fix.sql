BEGIN;
-- 1. Restaurar a proposta "Santos Golden Seguros"
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
) VALUES (
    'santos-golden-seguros',
    'Santos Golden Seguros',
    'Viviane dos Santos',
    1900.00,
    0,
    0,
    3,
    '["Gestão de Tráfego"]'::jsonb,
    '2026-02-20 12:00:00+00'
);
-- 2. Corrigir a política de criação de usuários (INSERT em app_users)
-- Garante que apenas gestores e admins possam criar novos perfis na plataforma
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
COMMIT;
