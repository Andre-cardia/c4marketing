-- Add 'operacional' to the allowed roles
DO $$
BEGIN
    -- Drop the existing check constraint if it exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_role_check') THEN
        ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
    END IF;

    -- Add the new check constraint with 'operacional'
    ALTER TABLE app_users 
    ADD CONSTRAINT app_users_role_check 
    CHECK (role IN ('gestor', 'comercial', 'leitor', 'operacional'));
END $$;
