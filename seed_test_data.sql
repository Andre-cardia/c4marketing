-- SCRIPT TO GENERATE TEST DATA FOR CLIENT
-- Replace 'andre.cardia@gmail.com' with the actual client email if different
DO $$
DECLARE
    target_email TEXT := 'andre.cardia@gmail.com';
    v_acceptance_id UUID;
    v_project_id UUID;
BEGIN
    -- 1. Ensure Acceptance Exists
    IF NOT EXISTS (SELECT 1 FROM acceptances WHERE lower(email) = lower(target_email)) THEN
        INSERT INTO acceptances (id, name, email, cpf, company_name, cnpj, status, timestamp)
        VALUES (
            gen_random_uuid(),
            'André Cardia',
            target_email,
            '000.000.000-00',
            'Cardia Enterprises',
            '00.000.000/0001-00',
            'Aceito',
            NOW()
        )
        RETURNING id INTO v_acceptance_id;
        RAISE NOTICE 'Created Acceptance with ID: %', v_acceptance_id;
    ELSE
        SELECT id INTO v_acceptance_id FROM acceptances WHERE lower(email) = lower(target_email) LIMIT 1;
        RAISE NOTICE 'Found existing Acceptance ID: %', v_acceptance_id;
    END IF;

    -- 2. Ensure Traffic Project Exists
    IF NOT EXISTS (SELECT 1 FROM traffic_projects WHERE acceptance_id = v_acceptance_id) THEN
        INSERT INTO traffic_projects (acceptance_id, status, created_at)
        VALUES (v_acceptance_id, 'active', NOW())
        RETURNING id INTO v_project_id;
        RAISE NOTICE 'Created Traffic Project ID: %', v_project_id;
    ELSE
        SELECT id INTO v_project_id FROM traffic_projects WHERE acceptance_id = v_acceptance_id LIMIT 1;
        RAISE NOTICE 'Found existing Traffic Project ID: %', v_project_id;
    END IF;

    -- 3. Ensure Sample Campaigns Exist
    IF NOT EXISTS (SELECT 1 FROM traffic_campaigns WHERE traffic_project_id = v_project_id) THEN
        INSERT INTO traffic_campaigns (traffic_project_id, name, platform, status, budget, created_at)
        VALUES 
            (v_project_id, 'Google Search - Institucional', 'google_ads', 'active', 1500.00, NOW()),
            (v_project_id, 'Meta Ads - Retargeting', 'meta_ads', 'active', 800.00, NOW()),
            (v_project_id, 'LinkedIn - B2B Leads', 'linkedin_ads', 'paused', 1200.00, NOW());
        RAISE NOTICE 'Created Sample Campaigns';
    END IF;

    -- 4. Ensure Campaign Timeline (Optional)
    -- Insert specific timeline steps if needed (omitted for brevity, basic campaigns are enough for test)

    RAISE NOTICE 'Seed data check complete for %', target_email;
END $$;
