DROP FUNCTION IF EXISTS public.save_acceptance_financial_review(bigint, jsonb, text);

NOTIFY pgrst, 'reload schema';
