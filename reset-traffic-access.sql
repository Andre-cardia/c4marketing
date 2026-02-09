-- Script para resetar o status do formulário de acesso
-- Execute isso no Supabase SQL Editor

UPDATE traffic_projects 
SET account_setup_status = 'pending'
WHERE id = '0cb0ddcd-5310-4ea3-82e5-9f25fe5aa8be';

-- Se quiser resetar TODOS os formulários de acesso:
-- UPDATE traffic_projects SET account_setup_status = 'pending';
