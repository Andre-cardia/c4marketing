-- SEED DATA FOR CLIENT TEST
DO $$
DECLARE
    target_email TEXT := 'andre.cardia@gmail.com';
    v_acceptance_id BIGINT;
    v_project_id UUID;
BEGIN
    -- 1. Acceptance
    IF NOT EXISTS (SELECT 1 FROM acceptances WHERE lower(email) = lower(target_email)) THEN
        INSERT INTO acceptances (name, email, cpf, company_name, cnpj, status, timestamp)
        VALUES ('André Cardia', target_email, '000.000.000-00', 'Cardia Enterprises', '00.000.000/0001-00', 'Aceito', NOW())
        RETURNING id INTO v_acceptance_id;
    ELSE
        SELECT id INTO v_acceptance_id FROM acceptances WHERE lower(email) = lower(target_email) LIMIT 1;
    END IF;

    -- 2. Traffic Project
    IF NOT EXISTS (SELECT 1 FROM traffic_projects WHERE acceptance_id = v_acceptance_id) THEN
        INSERT INTO traffic_projects (acceptance_id, survey_status, created_at)
        VALUES (v_acceptance_id, 'completed', NOW())
        RETURNING id INTO v_project_id;
    ELSE
        SELECT id INTO v_project_id FROM traffic_projects WHERE acceptance_id = v_acceptance_id LIMIT 1;
    END IF;

    -- 3. Campaigns
    IF NOT EXISTS (SELECT 1 FROM traffic_campaigns WHERE traffic_project_id = v_project_id) THEN
        INSERT INTO traffic_campaigns (traffic_project_id, name, platform, status, created_at)
        VALUES 
            (v_project_id, 'Google Search - Institucional', 'google_ads', 'active', NOW()),
            (v_project_id, 'Meta Ads - Retargeting', 'meta_ads', 'active', NOW()),
            (v_project_id, 'LinkedIn - B2B Leads', 'linkedin_ads', 'paused', NOW());
    END IF;
END $$;
