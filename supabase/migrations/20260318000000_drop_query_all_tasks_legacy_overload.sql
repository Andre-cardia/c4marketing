-- Remove legacy 2-param overload of query_all_tasks that causes PGRST203 ambiguity.
-- The current canonical signature (6 params) was added in 20260225160000.
-- PostgREST fails to resolve the call when both overloads exist.

DROP FUNCTION IF EXISTS public.query_all_tasks(bigint, text);
