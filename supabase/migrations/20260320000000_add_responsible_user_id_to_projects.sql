-- ============================================================
-- Adiciona responsible_user_id às tabelas de projeto
--
-- Contexto:
--   Cada projeto (tráfego, site, landing page) precisa de um
--   responsável interno da equipe C4 (app_users). Isso reflete
--   em análises de desempenho, alertas, carga de trabalho e
--   base de conhecimento do Segundo Cérebro.
--
-- Default: Lucas (lucas@c4marketing.com.br) — gerente de Contas.
-- Alterar responsável: execute_update_project_responsible (GestorAPI).
-- ============================================================

-- 1. Adicionar coluna responsible_user_id às 3 tabelas de projeto
ALTER TABLE public.traffic_projects
    ADD COLUMN IF NOT EXISTS responsible_user_id UUID
        REFERENCES public.app_users(id) ON DELETE SET NULL;

ALTER TABLE public.website_projects
    ADD COLUMN IF NOT EXISTS responsible_user_id UUID
        REFERENCES public.app_users(id) ON DELETE SET NULL;

ALTER TABLE public.landing_page_projects
    ADD COLUMN IF NOT EXISTS responsible_user_id UUID
        REFERENCES public.app_users(id) ON DELETE SET NULL;

-- 2. Índices para performance (JOINs com app_users)
CREATE INDEX IF NOT EXISTS idx_traffic_projects_responsible_user_id
    ON public.traffic_projects(responsible_user_id);

CREATE INDEX IF NOT EXISTS idx_website_projects_responsible_user_id
    ON public.website_projects(responsible_user_id);

CREATE INDEX IF NOT EXISTS idx_landing_page_projects_responsible_user_id
    ON public.landing_page_projects(responsible_user_id);

-- 3. Backfill: atribuir Lucas como responsável em todos os projetos existentes
DO $$
DECLARE v_lucas_id UUID;
BEGIN
    SELECT id INTO v_lucas_id
    FROM public.app_users
    WHERE email = 'lucas@c4marketing.com.br'
    LIMIT 1;

    IF v_lucas_id IS NOT NULL THEN
        UPDATE public.traffic_projects
        SET responsible_user_id = v_lucas_id
        WHERE responsible_user_id IS NULL;

        UPDATE public.website_projects
        SET responsible_user_id = v_lucas_id
        WHERE responsible_user_id IS NULL;

        UPDATE public.landing_page_projects
        SET responsible_user_id = v_lucas_id
        WHERE responsible_user_id IS NULL;

        RAISE NOTICE 'Backfill concluído: responsável padrão definido como Lucas (id: %)', v_lucas_id;
    ELSE
        RAISE WARNING 'Usuário lucas@c4marketing.com.br não encontrado em app_users. Backfill ignorado.';
    END IF;
END $$;

-- 4. Comentários de documentação
COMMENT ON COLUMN public.traffic_projects.responsible_user_id IS
    'Membro da equipe C4 responsável por este projeto. FK para app_users. Default: Lucas (lucas@c4marketing.com.br).';

COMMENT ON COLUMN public.website_projects.responsible_user_id IS
    'Membro da equipe C4 responsável por este projeto. FK para app_users. Default: Lucas (lucas@c4marketing.com.br).';

COMMENT ON COLUMN public.landing_page_projects.responsible_user_id IS
    'Membro da equipe C4 responsável por este projeto. FK para app_users. Default: Lucas (lucas@c4marketing.com.br).';
