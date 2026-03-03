


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "brain";


ALTER SCHEMA "brain" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "brain"."handle_project_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  target_id uuid;
  target_table text;
begin
  -- Logic to map current change to a Parent Project ID
  
  -- Case: Directly modifying a Project Table
  if TG_TABLE_NAME = 'website_projects' then
    target_table := 'website_projects';
    target_id := COALESCE(NEW.id, OLD.id);
  elsif TG_TABLE_NAME = 'landing_page_projects' then
    target_table := 'landing_page_projects';
    target_id := COALESCE(NEW.id, OLD.id);
  elsif TG_TABLE_NAME = 'traffic_projects' then
    target_table := 'traffic_projects';
    target_id := COALESCE(NEW.id, OLD.id);
    
  -- Case: Modifying a Child Table (bubbling up)
  elsif TG_TABLE_NAME = 'websites' then
    target_table := 'website_projects';
    target_id := COALESCE(NEW.website_project_id, OLD.website_project_id);
  elsif TG_TABLE_NAME = 'landing_pages' then
    target_table := 'landing_page_projects';
    target_id := COALESCE(NEW.landing_page_project_id, OLD.landing_page_project_id);
  elsif TG_TABLE_NAME = 'traffic_campaigns' then
    target_table := 'traffic_projects';
    target_id := COALESCE(NEW.traffic_project_id, OLD.traffic_project_id);
  end if;
  -- Insert into Queue
  if target_id is not null then
    insert into brain.sync_queue (source_table, source_id, operation)
    values (target_table, target_id, TG_OP);
  end if;
  return COALESCE(NEW, OLD);
end;
$$;


ALTER FUNCTION "brain"."handle_project_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "brain"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM brain.documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "brain"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_chat_message"("p_session_id" "uuid", "p_role" "text", "p_content" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID;
    new_id UUID;
BEGIN
    -- Verify ownership
    SELECT user_id INTO v_user_id FROM brain.chat_sessions WHERE id = p_session_id;
    
    IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    INSERT INTO brain.chat_messages (session_id, role, content)
    VALUES (p_session_id, p_role, p_content)
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."add_chat_message"("p_session_id" "uuid", "p_role" "text", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."brain_authority_rank"("p_authority_type" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE lower(coalesce(p_authority_type, ''))
    WHEN 'policy' THEN 100
    WHEN 'procedure' THEN 90
    WHEN 'contract' THEN 80
    WHEN 'memo' THEN 60
    WHEN 'conversation' THEN 20
    ELSE 50
  END;
$$;


ALTER FUNCTION "public"."brain_authority_rank"("p_authority_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."brain_documents_auto_invalidate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
DECLARE
  v_status text;
  v_is_current text;
BEGIN
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb);

  v_status := coalesce(nullif(lower(NEW.metadata->>'status'), ''), 'active');
  v_is_current := coalesce(nullif(lower(NEW.metadata->>'is_current'), ''), 'true');

  IF v_status IN ('superseded', 'revoked', 'archived') OR v_is_current = 'false' THEN
    NEW.metadata := jsonb_set(NEW.metadata, '{searchable}', 'false'::jsonb, true);
    NEW.metadata := jsonb_set(NEW.metadata, '{invalidated_at}', to_jsonb(now()), true);
  ELSIF coalesce(nullif(lower(NEW.metadata->>'searchable'), ''), '') = '' THEN
    NEW.metadata := jsonb_set(NEW.metadata, '{searchable}', 'true'::jsonb, true);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."brain_documents_auto_invalidate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."c4_corporate_tenant_id"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'c4_corporate_identity'::text;
$$;


ALTER FUNCTION "public"."c4_corporate_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_campaign_timeline"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO traffic_campaign_timeline (campaign_id, step_key, order_index, status, start_date)
  VALUES 
    (NEW.id, 'planning', 0, 'in_progress', NOW()),
    (NEW.id, 'creatives', 1, 'pending', NULL),
    (NEW.id, 'execution', 2, 'pending', NULL),
    (NEW.id, 'optimization', 3, 'pending', NULL),
    (NEW.id, 'finalization', 4, 'pending', NULL);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_campaign_timeline"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_chat_session"("title" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO brain.chat_sessions (user_id, title)
    VALUES (auth.uid(), title)
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_chat_session"("title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_task_monthly_snapshot"("p_month" "date" DEFAULT ("date_trunc"('month'::"text", ("now"() - '1 mon'::interval)))::"date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.task_monthly_snapshots(
    snapshot_month, task_id, project_id, company_name,
    title, status, assignee, created_by,
    due_date, created_at, completed_at, overdue_flagged_at,
    snapshotted_at
  )
  SELECT
    p_month,
    pt.id,
    pt.project_id,
    a.company_name,
    pt.title,
    pt.status,
    pt.assignee,
    pt.created_by,
    pt.due_date,
    pt.created_at,
    pt.completed_at,
    pt.overdue_flagged_at,
    now()
  FROM public.project_tasks pt
  LEFT JOIN public.acceptances a ON pt.project_id = a.id
  ON CONFLICT (snapshot_month, task_id) DO UPDATE SET
    company_name       = EXCLUDED.company_name,
    title              = EXCLUDED.title,
    status             = EXCLUDED.status,
    assignee           = EXCLUDED.assignee,
    completed_at       = EXCLUDED.completed_at,
    overdue_flagged_at = EXCLUDED.overdue_flagged_at,
    snapshotted_at     = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."create_task_monthly_snapshot"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_chat_session"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT s.user_id
    INTO v_owner_id
    FROM brain.chat_sessions s
   WHERE s.id = p_session_id;

  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_owner_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM brain.chat_sessions
   WHERE id = p_session_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."delete_chat_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_create_traffic_task"("p_session_id" "text" DEFAULT NULL::"text", "p_project_id" bigint DEFAULT NULL::bigint, "p_project_name" "text" DEFAULT NULL::"text", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_due_date" "date" DEFAULT NULL::"date", "p_priority" "text" DEFAULT 'medium'::"text", "p_status" "text" DEFAULT 'backlog'::"text", "p_assignee" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_task_id     UUID;
    v_client_name TEXT;
BEGIN
    -- Resolver projeto por nome se ID não fornecido
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        SELECT a.id, a.company_name
          INTO p_project_id, v_client_name
          FROM acceptances a
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado. Verifique o nome e tente novamente.', p_project_name));
        END IF;
    END IF;
    IF p_project_id IS NULL OR p_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','p_project_id (ou p_project_name) e p_title são obrigatórios.');
    END IF;
    -- Buscar nome do cliente se ainda não temos
    IF v_client_name IS NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;
    INSERT INTO project_tasks (project_id, title, description, due_date, priority, status, assignee)
    VALUES (p_project_id, p_title, p_description, p_due_date, p_priority, p_status, p_assignee)
    RETURNING id INTO v_task_id;
    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'create_task', 'success',
            jsonb_build_object('project_id',p_project_id,'title',p_title,'client_name',v_client_name),
            jsonb_build_object('task_id',v_task_id), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object(
        'status','success',
        'task_id', v_task_id,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" criada (ID: %s) para %s.', p_title, v_task_id, coalesce(v_client_name,'desconhecido'))
    );
END; $$;


ALTER FUNCTION "public"."execute_create_traffic_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_title" "text", "p_description" "text", "p_due_date" "date", "p_priority" "text", "p_status" "text", "p_assignee" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_delete_task"("p_session_id" "text" DEFAULT NULL::"text", "p_project_id" bigint DEFAULT NULL::bigint, "p_project_name" "text" DEFAULT NULL::"text", "p_task_title" "text" DEFAULT NULL::"text", "p_task_id" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_deleted_title TEXT;
    v_client_name   TEXT;
BEGIN
    -- Resolver projeto por nome se necessário
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        SELECT a.id, a.company_name
          INTO p_project_id, v_client_name
          FROM acceptances a
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    END IF;
    -- Buscar nome do cliente
    IF v_client_name IS NULL AND p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;
    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title para identificar a tarefa.');
    END IF;
    -- Resolver tarefa por título se ID não fornecido
    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title
          INTO p_task_id, v_deleted_title
          FROM project_tasks pt
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at DESC
         LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada%s.',
                    p_task_title,
                    CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END));
        END IF;
    ELSE
        SELECT pt.title INTO v_deleted_title FROM project_tasks pt WHERE pt.id = p_task_id;
        IF v_deleted_title IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa com ID %s não encontrada.', p_task_id));
        END IF;
    END IF;
    DELETE FROM project_tasks WHERE id = p_task_id;
    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'delete_task', 'success',
            jsonb_build_object('task_id',p_task_id,'title',v_deleted_title,'client_name',v_client_name),
            jsonb_build_object('deleted',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object(
        'status','success',
        'deleted_task_id', p_task_id,
        'deleted_title', v_deleted_title,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" deletada com sucesso%s.',
            v_deleted_title,
            CASE WHEN v_client_name IS NOT NULL THEN ' do projeto ' || v_client_name ELSE '' END)
    );
END; $$;


ALTER FUNCTION "public"."execute_delete_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_move_task"("p_session_id" "text" DEFAULT NULL::"text", "p_project_id" bigint DEFAULT NULL::bigint, "p_project_name" "text" DEFAULT NULL::"text", "p_task_title" "text" DEFAULT NULL::"text", "p_task_id" "uuid" DEFAULT NULL::"uuid", "p_new_status" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_task_title   TEXT;
    v_old_status   TEXT;
    v_client_name  TEXT;
    v_valid_statuses TEXT[] := ARRAY['backlog','in_progress','approval','done','paused'];
BEGIN
    -- Validar status
    IF p_new_status IS NULL OR NOT (p_new_status = ANY(v_valid_statuses)) THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Status "%s" inválido. Use: backlog, in_progress, approval, done ou paused.',
                coalesce(p_new_status,'(vazio)')));
    END IF;
    -- Resolver projeto por nome se necessário
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        SELECT a.id, a.company_name
          INTO p_project_id, v_client_name
          FROM acceptances a
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    END IF;
    -- Buscar nome do cliente
    IF v_client_name IS NULL AND p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;
    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title para identificar a tarefa.');
    END IF;
    -- Resolver tarefa por título se ID não fornecido
    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title, pt.status
          INTO p_task_id, v_task_title, v_old_status
          FROM project_tasks pt
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at DESC
         LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada%s.',
                    p_task_title,
                    CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END));
        END IF;
    ELSE
        SELECT pt.title, pt.status INTO v_task_title, v_old_status FROM project_tasks pt WHERE pt.id = p_task_id;
        IF v_task_title IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa com ID %s não encontrada.', p_task_id));
        END IF;
    END IF;
    -- Já está no status desejado?
    IF v_old_status = p_new_status THEN
        RETURN jsonb_build_object('status','info',
            'message', format('Tarefa "%s" já está em "%s".', v_task_title, p_new_status));
    END IF;
    UPDATE project_tasks SET status = p_new_status WHERE id = p_task_id;
    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'move_task', 'success',
            jsonb_build_object('task_id',p_task_id,'title',v_task_title,'from',v_old_status,'to',p_new_status,'client_name',v_client_name),
            jsonb_build_object('moved',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object(
        'status','success',
        'task_id', p_task_id,
        'task_title', v_task_title,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'client_name', v_client_name,
        'message', format('Tarefa "%s" movida de "%s" para "%s"%s.',
            v_task_title, v_old_status, p_new_status,
            CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;


ALTER FUNCTION "public"."execute_move_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_status" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_update_project_status"("p_session_id" "text" DEFAULT NULL::"text", "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_project_name" "text" DEFAULT NULL::"text", "p_new_status" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
    v_old_status  TEXT;
    v_table       TEXT;
    v_client_name TEXT;
BEGIN
    IF p_new_status IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_new_status é obrigatório.');
    END IF;
    -- Resolver projeto por nome se UUID não fornecido
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        -- Tenta traffic_projects primeiro
        SELECT tp.id INTO p_project_id
          FROM traffic_projects tp
          JOIN acceptances a ON a.id = tp.acceptance_id
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            SELECT lp.id INTO p_project_id
              FROM landing_page_projects lp
              JOIN acceptances a ON a.id = lp.acceptance_id
             WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
             LIMIT 1;
        END IF;
        IF p_project_id IS NULL THEN
            SELECT wp.id INTO p_project_id
              FROM website_projects wp
              JOIN acceptances a ON a.id = wp.acceptance_id
             WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
             LIMIT 1;
        END IF;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    END IF;
    IF p_project_id IS NULL THEN
        RETURN jsonb_build_object('status','error','message','p_project_id ou p_project_name é obrigatório.');
    END IF;
    -- Identificar tabela e status atual
    SELECT tp.status, 'traffic_projects', a.company_name
      INTO v_old_status, v_table, v_client_name
      FROM traffic_projects tp
      JOIN acceptances a ON a.id = tp.acceptance_id
     WHERE tp.id = p_project_id;
    IF v_old_status IS NULL THEN
        SELECT lp.status, 'landing_page_projects', a.company_name
          INTO v_old_status, v_table, v_client_name
          FROM landing_page_projects lp
          JOIN acceptances a ON a.id = lp.acceptance_id
         WHERE lp.id = p_project_id;
    END IF;
    IF v_old_status IS NULL THEN
        SELECT wp.status, 'website_projects', a.company_name
          INTO v_old_status, v_table, v_client_name
          FROM website_projects wp
          JOIN acceptances a ON a.id = wp.acceptance_id
         WHERE wp.id = p_project_id;
    END IF;
    IF v_old_status IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message', format('Projeto %s não encontrado em nenhuma tabela de projetos.', p_project_id));
    END IF;
    EXECUTE format('UPDATE %I SET status = $1 WHERE id = $2', v_table)
    USING p_new_status, p_project_id;
    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'update_project_status', 'success',
            jsonb_build_object('project_id',p_project_id,'from',v_old_status,'to',p_new_status,'table',v_table,'client_name',v_client_name),
            jsonb_build_object('updated',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object(
        'status','success',
        'project_id', p_project_id,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'client_name', v_client_name,
        'message', format('Projeto %s (%s) atualizado de "%s" para "%s".', coalesce(v_client_name,'desconhecido'), v_table, v_old_status, p_new_status)
    );
END; $_$;


ALTER FUNCTION "public"."execute_update_project_status"("p_session_id" "text", "p_project_id" "uuid", "p_project_name" "text", "p_new_status" "text", "p_notes" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_update_task"("p_session_id" "text" DEFAULT NULL::"text", "p_project_id" bigint DEFAULT NULL::bigint, "p_project_name" "text" DEFAULT NULL::"text", "p_task_title" "text" DEFAULT NULL::"text", "p_task_id" "uuid" DEFAULT NULL::"uuid", "p_new_title" "text" DEFAULT NULL::"text", "p_new_description" "text" DEFAULT NULL::"text", "p_new_due_date" "date" DEFAULT NULL::"date", "p_new_priority" "text" DEFAULT NULL::"text", "p_new_assignee" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_task_title   TEXT;
    v_client_name  TEXT;
    v_changes      TEXT[] := '{}';
BEGIN
    -- Resolver projeto por nome se necessário
    IF p_project_id IS NULL AND p_project_name IS NOT NULL THEN
        SELECT a.id, a.company_name
          INTO p_project_id, v_client_name
          FROM acceptances a
         WHERE lower(a.company_name) LIKE '%' || lower(trim(p_project_name)) || '%'
         LIMIT 1;
        IF p_project_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Projeto "%s" não encontrado.', p_project_name));
        END IF;
    END IF;
    -- Buscar nome do cliente
    IF v_client_name IS NULL AND p_project_id IS NOT NULL THEN
        SELECT a.company_name INTO v_client_name FROM acceptances a WHERE a.id = p_project_id;
    END IF;
    IF p_task_id IS NULL AND p_task_title IS NULL THEN
        RETURN jsonb_build_object('status','error',
            'message','Informe p_task_id ou p_task_title para identificar a tarefa.');
    END IF;
    -- Resolver tarefa por título se ID não fornecido
    IF p_task_id IS NULL THEN
        SELECT pt.id, pt.title
          INTO p_task_id, v_task_title
          FROM project_tasks pt
         WHERE lower(pt.title) LIKE '%' || lower(trim(p_task_title)) || '%'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at DESC
         LIMIT 1;
        IF p_task_id IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa "%s" não encontrada%s.',
                    p_task_title,
                    CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END));
        END IF;
    ELSE
        SELECT pt.title INTO v_task_title FROM project_tasks pt WHERE pt.id = p_task_id;
        IF v_task_title IS NULL THEN
            RETURN jsonb_build_object('status','error',
                'message', format('Tarefa com ID %s não encontrada.', p_task_id));
        END IF;
    END IF;
    -- Aplicar atualizações condicionais
    IF p_new_title IS NOT NULL THEN
        UPDATE project_tasks SET title = p_new_title WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'título');
    END IF;
    IF p_new_description IS NOT NULL THEN
        UPDATE project_tasks SET description = p_new_description WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'descrição');
    END IF;
    IF p_new_due_date IS NOT NULL THEN
        UPDATE project_tasks SET due_date = p_new_due_date WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'prazo');
    END IF;
    IF p_new_priority IS NOT NULL THEN
        UPDATE project_tasks SET priority = p_new_priority WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'prioridade');
    END IF;
    IF p_new_assignee IS NOT NULL THEN
        UPDATE project_tasks SET assignee = p_new_assignee WHERE id = p_task_id;
        v_changes := array_append(v_changes, 'responsável');
    END IF;
    IF array_length(v_changes, 1) IS NULL OR array_length(v_changes, 1) = 0 THEN
        RETURN jsonb_build_object('status','info',
            'message','Nenhum campo para atualizar foi informado.');
    END IF;
    -- Log fail-safe
    BEGIN
        INSERT INTO brain.execution_logs (session_id, agent_name, action, status, params, result, latency_ms)
        VALUES (coalesce(p_session_id,'unknown'), 'Agent_Executor', 'update_task', 'success',
            jsonb_build_object('task_id',p_task_id,'title',v_task_title,'changes',array_to_string(v_changes,', '),'client_name',v_client_name),
            jsonb_build_object('updated',true), 0);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object(
        'status','success',
        'task_id', p_task_id,
        'task_title', coalesce(p_new_title, v_task_title),
        'changes', array_to_string(v_changes, ', '),
        'client_name', v_client_name,
        'message', format('Tarefa "%s" atualizada (%s)%s.',
            coalesce(p_new_title, v_task_title),
            array_to_string(v_changes, ', '),
            CASE WHEN v_client_name IS NOT NULL THEN ' no projeto ' || v_client_name ELSE '' END)
    );
END; $$;


ALTER FUNCTION "public"."execute_update_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_title" "text", "p_new_description" "text", "p_new_due_date" "date", "p_new_priority" "text", "p_new_assignee" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."flag_overdue_tasks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_today   date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_flagged integer := 0;
BEGIN
  -- Flag tasks that are now overdue and haven't been flagged yet
  UPDATE public.project_tasks
  SET overdue_flagged_at = now()
  WHERE due_date IS NOT NULL
    AND due_date::date < v_today
    AND status != 'done'
    AND overdue_flagged_at IS NULL;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  -- Record overdue event in task_history for newly flagged tasks
  IF v_flagged > 0 THEN
    INSERT INTO public.task_history(
      id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details
    )
    SELECT
      gen_random_uuid(), pt.id, pt.project_id,
      'overdue_flagged', pt.status, pt.status,
      'system', now(),
      jsonb_build_object(
        'title',       pt.title,
        'due_date',    pt.due_date,
        'assignee',    pt.assignee,
        'days_overdue', (v_today - pt.due_date::date)
      )
    FROM public.project_tasks pt
    WHERE pt.due_date IS NOT NULL
      AND pt.due_date::date < v_today
      AND pt.status != 'done'
      AND pt.overdue_flagged_at::date = now()::date; -- only newly flagged today
  END IF;

  RETURN v_flagged;
END;
$$;


ALTER FUNCTION "public"."flag_overdue_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_canonical_corporate_docs"("query_embedding" "extensions"."vector", "p_user_role" "text" DEFAULT 'gestão'::"text", "p_top_k" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain', 'extensions'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM brain.documents d
  WHERE
    d.metadata->>'tenant_id' = public.c4_corporate_tenant_id()
    AND coalesce(nullif(lower(d.metadata->>'status'),    ''), 'active') = 'active'
    AND coalesce(nullif(lower(d.metadata->>'is_current'),''), 'true')   = 'true'
    AND coalesce(nullif(lower(d.metadata->>'searchable'),''), 'true')   = 'true'
    AND d.embedding IS NOT NULL
    AND (
      -- gestão enxerga tudo
      lower(p_user_role) = 'gestão'
      -- outros: docs sem role_allowlist (visíveis a todos) OU cargo listado
      OR d.metadata->'role_allowlist' IS NULL
      OR d.metadata->'role_allowlist' @> to_jsonb(lower(p_user_role)::text)
    )
  ORDER BY similarity DESC
  LIMIT p_top_k;
END;
$$;


ALTER FUNCTION "public"."get_canonical_corporate_docs"("query_embedding" "extensions"."vector", "p_user_role" "text", "p_top_k" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pending_sync_items"("p_limit" integer DEFAULT 10) RETURNS TABLE("id" bigint, "source_table" "text", "source_id" "text", "operation" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.source_table::text, q.source_id::text, q.operation::text
  FROM brain.sync_queue q
  WHERE q.status = 'pending'
  ORDER BY q.created_at ASC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_pending_sync_items"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_project_credentials"("p_acceptance_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key       text := 'c4marketingkey2026';
  v_encrypted text;
BEGIN
  SELECT credentials_encrypted
    INTO v_encrypted
    FROM public.project_credentials
   WHERE acceptance_id = p_acceptance_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_key)::text;
END;
$$;


ALTER FUNCTION "public"."get_project_credentials"("p_acceptance_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_explicit_user_facts"("p_user_id" "uuid", "p_session_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 6) RETURNS TABLE("fact_text" "text", "created_at" timestamp with time zone, "scope" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
  WITH base AS (
    SELECT
      regexp_replace(
        d.content,
        '^FATO EXPL[IÍ]CITO INFORMADO PELO USU[ÁA]RIO \\([^)]+\\):\\s*',
        '',
        'i'
      ) AS fact_text,
      d.created_at,
      CASE
        WHEN p_session_id IS NOT NULL
         AND d.metadata->>'session_id' = p_session_id::text
        THEN 'session'
        ELSE 'user'
      END AS scope
    FROM brain.documents d
    WHERE d.metadata->>'source' = 'explicit_user_memory'
      AND d.metadata->>'tenant_id' = p_user_id::text
      AND coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') = 'active'
  ),
  ranked AS (
    SELECT
      nullif(trim(b.fact_text), '') AS fact_text,
      b.created_at,
      b.scope,
      row_number() OVER (
        PARTITION BY lower(coalesce(nullif(trim(b.fact_text), ''), ''))
        ORDER BY
          CASE WHEN b.scope = 'session' THEN 0 ELSE 1 END,
          b.created_at DESC
      ) AS rn
    FROM base b
  )
  SELECT
    r.fact_text,
    r.created_at,
    r.scope
  FROM ranked r
  WHERE r.rn = 1
    AND r.fact_text IS NOT NULL
  ORDER BY
    CASE WHEN r.scope = 'session' THEN 0 ELSE 1 END,
    r.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 6), 50));
$$;


ALTER FUNCTION "public"."get_recent_explicit_user_facts"("p_user_id" "uuid", "p_session_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_history"("p_session_id" "uuid", "p_limit" integer DEFAULT 20) RETURNS TABLE("role" "text", "content" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
BEGIN
  RETURN QUERY
  SELECT m.role::text, m.content::text, m.created_at
  FROM brain.chat_messages m
  WHERE m.session_id = p_session_id
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_session_history"("p_session_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_recent_history"("p_user_id" "uuid", "p_limit" integer DEFAULT 20, "p_exclude_session_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("role" "text", "content" "text", "created_at" timestamp with time zone, "session_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
  SELECT
    m.role::text,
    m.content::text,
    m.created_at,
    m.session_id
  FROM brain.chat_messages m
  JOIN brain.chat_sessions s ON s.id = m.session_id
  WHERE s.user_id = p_user_id
    AND (p_exclude_session_id IS NULL OR m.session_id <> p_exclude_session_id)
  ORDER BY m.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;


ALTER FUNCTION "public"."get_user_recent_history"("p_user_id" "uuid", "p_limit" integer, "p_exclude_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_brain_document"("content" "text", "metadata" "jsonb", "embedding" "extensions"."vector") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain', 'extensions'
    AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO brain.documents (content, metadata, embedding)
  VALUES (content, metadata, embedding)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."insert_brain_document"("content" "text", "metadata" "jsonb", "embedding" "extensions"."vector") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invalidate_obsolete_brain_embeddings"("p_document_key" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
DECLARE
  v_updated int := 0;
BEGIN
  UPDATE brain.documents d
  SET metadata = jsonb_set(
    jsonb_set(coalesce(d.metadata, '{}'::jsonb), '{searchable}', 'false'::jsonb, true),
    '{invalidated_at}', to_jsonb(now()), true
  )
  WHERE
    (p_document_key IS NULL OR d.metadata->>'document_key' = p_document_key)
    AND (
      coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') IN ('superseded', 'revoked', 'archived')
      OR coalesce(nullif(lower(d.metadata->>'is_current'), ''), 'true') = 'false'
    )
    AND coalesce(nullif(lower(d.metadata->>'searchable'), ''), 'true') <> 'false';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;


ALTER FUNCTION "public"."invalidate_obsolete_brain_embeddings"("p_document_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_agent_execution"("p_session_id" "text", "p_agent_name" "text", "p_action" "text", "p_status" "text", "p_params" "jsonb" DEFAULT '{}'::"jsonb", "p_result" "jsonb" DEFAULT '{}'::"jsonb", "p_latency_ms" integer DEFAULT 0, "p_cost_est" numeric DEFAULT 0, "p_error_message" "text" DEFAULT NULL::"text", "p_message_id" "text" DEFAULT NULL::"text", "p_tokens_input" integer DEFAULT 0, "p_tokens_output" integer DEFAULT 0, "p_tokens_total" integer DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id UUID;
BEGIN
    INSERT INTO brain.execution_logs
        (session_id, agent_name, action, status, params, result,
         latency_ms, cost_est, error_message, message_id,
         tokens_input, tokens_output, tokens_total)
    VALUES
        (p_session_id, p_agent_name, p_action, p_status, p_params, p_result,
         p_latency_ms, p_cost_est, p_error_message, p_message_id,
         p_tokens_input, p_tokens_output, p_tokens_total)
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END; $$;


ALTER FUNCTION "public"."log_agent_execution"("p_session_id" "text", "p_agent_name" "text", "p_action" "text", "p_status" "text", "p_params" "jsonb", "p_result" "jsonb", "p_latency_ms" integer, "p_cost_est" numeric, "p_error_message" "text", "p_message_id" "text", "p_tokens_input" integer, "p_tokens_output" integer, "p_tokens_total" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_user_access"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id    UUID;
    v_user_email TEXT;
BEGIN
    v_user_id    := auth.uid();
    v_user_email := auth.jwt() ->> 'email';

    IF v_user_id IS NULL THEN
        RETURN; -- Não logado, ignora
    END IF;

    INSERT INTO access_logs (user_id, user_email)
    VALUES (v_user_id, v_user_email);

EXCEPTION WHEN OTHERS THEN
    -- Nunca lança erro — log de acesso não pode quebrar o app
    NULL;
END;
$$;


ALTER FUNCTION "public"."log_user_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."make_user_client"("target_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE app_users
  SET role = 'cliente'
  WHERE email = target_email;
  
  RETURN 'User ' || target_email || ' is now a client.';
END;
$$;


ALTER FUNCTION "public"."make_user_client"("target_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_brain_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain', 'extensions'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM brain.documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  AND (d.metadata->>'type' IS NULL OR d.metadata->>'type' != 'chat_log') -- Filtra histórico de chat
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_brain_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_brain_documents"("query_embedding" "extensions"."vector", "match_count" integer, "filters" "jsonb") RETURNS TABLE("id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $_$
  WITH params AS (
    SELECT
      (filters->>'tenant_id')::uuid AS tenant_id,
      NULLIF(filters->'type_allowlist', 'null'::jsonb) AS type_allowlist,
      NULLIF(filters->'type_blocklist', 'null'::jsonb) AS type_blocklist,
      filters->>'artifact_kind' AS artifact_kind,
      NULLIF(filters->'source_table', 'null'::jsonb) AS source_table,
      filters->>'client_id' AS client_id,
      filters->>'project_id' AS project_id,
      filters->>'source_id' AS source_id,
      nullif(filters->>'status', '') AS status,
      NULLIF(filters->>'time_window_minutes', '')::int AS time_window_minutes,
      NULLIF(filters->'authority_allowlist', 'null'::jsonb) AS authority_allowlist,
      CASE
        WHEN coalesce(filters->>'authority_rank_min', '') ~ '^-?[0-9]+$'
          THEN (filters->>'authority_rank_min')::int
        ELSE NULL
      END AS authority_rank_min,
      CASE lower(coalesce(filters->>'normative_mode', 'false'))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        ELSE false
      END AS normative_mode,
      CASE lower(coalesce(filters->>'require_current', 'false'))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        ELSE false
      END AS require_current,
      CASE lower(coalesce(filters->>'require_searchable', 'true'))
        WHEN 'true' THEN true
        WHEN '1' THEN true
        WHEN 'yes' THEN true
        WHEN 'on' THEN true
        ELSE false
      END AS require_searchable
  ),
  docs AS (
    SELECT
      d.id,
      d.content,
      d.metadata,
      d.embedding,
      d.created_at,
      coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') AS doc_status,
      coalesce(nullif(lower(d.metadata->>'is_current'), ''), 'true') AS doc_is_current,
      coalesce(nullif(lower(d.metadata->>'searchable'), ''), 'true') AS doc_searchable,
      coalesce(nullif(lower(d.metadata->>'authority_type'), ''), 'memo') AS doc_authority_type,
      coalesce(
        CASE
          WHEN coalesce(d.metadata->>'authority_rank', '') ~ '^-?[0-9]+$'
            THEN (d.metadata->>'authority_rank')::int
          ELSE NULL
        END,
        public.brain_authority_rank(d.metadata->>'authority_type')
      ) AS doc_authority_rank,
      coalesce(public.try_parse_timestamptz(d.metadata->>'effective_from'), d.created_at) AS doc_effective_from,
      public.try_parse_timestamptz(d.metadata->>'effective_to') AS doc_effective_to
    FROM brain.documents d
  )
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM docs d
  CROSS JOIN params p
  WHERE
    (p.status IS NULL OR d.doc_status = lower(p.status))
    AND (p.artifact_kind IS NULL OR d.metadata->>'artifact_kind' = p.artifact_kind)
    AND (p.source_id IS NULL OR d.metadata->>'source_id' = p.source_id)
    AND (p.client_id IS NULL OR d.metadata->>'client_id' = p.client_id)
    AND (p.project_id IS NULL OR d.metadata->>'project_id' = p.project_id)
    AND (
      p.source_table IS NULL
      OR (
        jsonb_typeof(p.source_table) = 'string'
        AND d.metadata->>'source_table' = trim(both '"' from p.source_table::text)
      )
      OR (
        jsonb_typeof(p.source_table) = 'array'
        AND (d.metadata->>'source_table') = ANY (
          SELECT jsonb_array_elements_text(p.source_table)
        )
      )
    )
    AND (
      p.type_allowlist IS NULL
      OR jsonb_typeof(p.type_allowlist) <> 'array'
      OR (d.metadata->>'type') = ANY (
        SELECT jsonb_array_elements_text(p.type_allowlist)
      )
    )
    AND NOT (
      p.type_blocklist IS NOT NULL
      AND jsonb_typeof(p.type_blocklist) = 'array'
      AND (d.metadata->>'type') = ANY (
        SELECT jsonb_array_elements_text(p.type_blocklist)
      )
    )
    AND (
      p.authority_allowlist IS NULL
      OR jsonb_typeof(p.authority_allowlist) <> 'array'
      OR d.doc_authority_type = ANY (
        SELECT lower(jsonb_array_elements_text(p.authority_allowlist))
      )
    )
    AND (
      p.authority_rank_min IS NULL
      OR d.doc_authority_rank >= p.authority_rank_min
    )
    AND (
      NOT p.require_searchable
      OR d.doc_searchable = 'true'
    )
    AND (
      NOT p.require_current
      OR d.doc_is_current = 'true'
    )
    AND (
      NOT p.normative_mode
      OR (
        d.doc_status = 'active'
        AND d.doc_is_current = 'true'
        AND d.doc_searchable = 'true'
        AND d.doc_effective_from <= now()
        AND (d.doc_effective_to IS NULL OR d.doc_effective_to >= now())
      )
    )
    AND (
      p.time_window_minutes IS NULL
      OR d.created_at >= now() - make_interval(mins => p.time_window_minutes)
    )
  ORDER BY
    CASE WHEN p.normative_mode THEN d.doc_authority_rank ELSE 0 END DESC,
    CASE WHEN p.normative_mode AND d.doc_is_current = 'true' THEN 1 ELSE 0 END DESC,
    d.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$_$;


ALTER FUNCTION "public"."match_brain_documents"("query_embedding" "extensions"."vector", "match_count" integer, "filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_financial_numeric"("p_value" "text") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE
  clean text;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  clean := trim(p_value);
  IF clean = '' THEN
    RETURN NULL;
  END IF;

  -- Remove currency symbols and any non-numeric separators.
  clean := regexp_replace(clean, '[^0-9,.\-]', '', 'g');
  IF clean = '' THEN
    RETURN NULL;
  END IF;

  -- Handle pt-BR decimal format (1.234,56) and also plain numeric strings.
  IF clean ~ ',\d{1,2}$' THEN
    clean := replace(clean, '.', '');
    clean := replace(clean, ',', '.');
  ELSE
    clean := replace(clean, ',', '');
  END IF;

  RETURN clean::numeric;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$_$;


ALTER FUNCTION "public"."parse_financial_numeric"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_brain_document_version"("p_content" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_embedding" "extensions"."vector" DEFAULT NULL::"extensions"."vector", "p_replace_current" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "document_key" "text", "version" integer, "superseded_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain', 'extensions'
    AS $_$
DECLARE
  v_now timestamptz := now();
  v_doc_key text;
  v_source_table text;
  v_source_id text;
  v_type text;
  v_status text;
  v_is_current boolean;
  v_searchable boolean;
  v_authority_type text;
  v_authority_rank int;
  v_effective_from timestamptz;
  v_effective_to timestamptz;
  v_next_version int;
  v_superseded_count int := 0;
  v_new_id uuid;
  v_new_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'content is required';
  END IF;

  v_source_table := nullif(trim(v_new_metadata->>'source_table'), '');
  v_source_id := nullif(trim(v_new_metadata->>'source_id'), '');
  v_type := lower(coalesce(nullif(trim(v_new_metadata->>'type'), ''), 'official_doc'));

  v_doc_key := nullif(trim(v_new_metadata->>'document_key'), '');
  IF v_doc_key IS NULL THEN
    IF v_source_table IS NOT NULL AND v_source_id IS NOT NULL THEN
      v_doc_key := v_source_table || ':' || v_source_id;
    ELSIF v_source_table IS NOT NULL THEN
      v_doc_key := v_source_table || ':' || md5(p_content);
    ELSE
      v_doc_key := 'doc:' || md5(p_content);
    END IF;
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN coalesce(d.metadata->>'version', '') ~ '^[0-9]+$'
        THEN (d.metadata->>'version')::int
      ELSE NULL
    END
  ), 0) + 1
  INTO v_next_version
  FROM brain.documents d
  WHERE d.metadata->>'document_key' = v_doc_key;

  v_status := lower(coalesce(nullif(trim(v_new_metadata->>'status'), ''), 'active'));

  v_is_current := coalesce(
    CASE
      WHEN lower(coalesce(v_new_metadata->>'is_current', '')) IN ('true', '1', 'yes', 'on') THEN true
      WHEN lower(coalesce(v_new_metadata->>'is_current', '')) IN ('false', '0', 'no', 'off') THEN false
      ELSE NULL
    END,
    true
  );

  IF v_status IN ('superseded', 'revoked', 'archived') THEN
    v_is_current := false;
  END IF;

  v_searchable := coalesce(
    CASE
      WHEN lower(coalesce(v_new_metadata->>'searchable', '')) IN ('true', '1', 'yes', 'on') THEN true
      WHEN lower(coalesce(v_new_metadata->>'searchable', '')) IN ('false', '0', 'no', 'off') THEN false
      ELSE NULL
    END,
    v_status = 'active'
  );

  IF v_status IN ('superseded', 'revoked', 'archived') THEN
    v_searchable := false;
  END IF;

  v_authority_type := lower(coalesce(
    nullif(trim(v_new_metadata->>'authority_type'), ''),
    CASE v_type
      WHEN 'official_doc' THEN 'policy'
      WHEN 'database_record' THEN 'procedure'
      WHEN 'session_summary' THEN 'memo'
      WHEN 'chat_log' THEN 'conversation'
      ELSE 'memo'
    END
  ));

  v_authority_rank := coalesce(
    CASE
      WHEN coalesce(v_new_metadata->>'authority_rank', '') ~ '^-?[0-9]+$'
        THEN (v_new_metadata->>'authority_rank')::int
      ELSE NULL
    END,
    public.brain_authority_rank(v_authority_type)
  );

  BEGIN
    v_effective_from := coalesce((nullif(v_new_metadata->>'effective_from', ''))::timestamptz, v_now);
  EXCEPTION WHEN others THEN
    v_effective_from := v_now;
  END;

  BEGIN
    v_effective_to := (nullif(v_new_metadata->>'effective_to', ''))::timestamptz;
  EXCEPTION WHEN others THEN
    v_effective_to := NULL;
  END;

  IF p_replace_current AND v_is_current THEN
    UPDATE brain.documents d
    SET metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(d.metadata, '{}'::jsonb), '{status}', '"superseded"'::jsonb, true),
          '{is_current}', 'false'::jsonb, true
        ),
        '{searchable}', 'false'::jsonb, true
      ),
      '{superseded_at}', to_jsonb(v_now), true
    )
    WHERE d.metadata->>'document_key' = v_doc_key
      AND coalesce(nullif(lower(d.metadata->>'status'), ''), 'active') = 'active'
      AND coalesce(nullif(lower(d.metadata->>'is_current'), ''), 'true') = 'true';

    GET DIAGNOSTICS v_superseded_count = ROW_COUNT;
  END IF;

  v_new_metadata := jsonb_set(v_new_metadata, '{document_key}', to_jsonb(v_doc_key), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{version}', to_jsonb(v_next_version), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{status}', to_jsonb(v_status), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{is_current}', to_jsonb(v_is_current), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{searchable}', to_jsonb(v_searchable), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{authority_type}', to_jsonb(v_authority_type), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{authority_rank}', to_jsonb(v_authority_rank), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{effective_from}', to_jsonb(v_effective_from), true);
  v_new_metadata := jsonb_set(v_new_metadata, '{content_hash}', to_jsonb(md5(p_content)), true);

  IF v_effective_to IS NOT NULL THEN
    v_new_metadata := jsonb_set(v_new_metadata, '{effective_to}', to_jsonb(v_effective_to), true);
  END IF;

  INSERT INTO brain.documents (content, metadata, embedding)
  VALUES (p_content, v_new_metadata, p_embedding)
  RETURNING brain.documents.id INTO v_new_id;

  RETURN QUERY
  SELECT
    v_new_id,
    v_doc_key,
    v_next_version,
    v_superseded_count;
END;
$_$;


ALTER FUNCTION "public"."publish_brain_document_version"("p_content" "text", "p_metadata" "jsonb", "p_embedding" "extensions"."vector", "p_replace_current" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_access_summary"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(s ORDER BY s.last_access DESC) INTO result
  FROM (
    SELECT
      al.user_email,
      count(*) AS total_accesses,
      max(al.accessed_at) AS last_access,
      min(al.accessed_at) AS first_access
    FROM access_logs al
    GROUP BY al.user_email
  ) s;
  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_access_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_all_clients"("p_status" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(c ORDER BY c.company_name) INTO result
  FROM (
    SELECT
      a.id,
      a.company_name,
      a.name AS responsible_name,
      a.email,
      a.status,
      a.timestamp AS accepted_at,
      a.expiration_date,
      -- Serviços contratados
      (SELECT count(*) FROM traffic_projects tp WHERE tp.acceptance_id = a.id) > 0 AS has_traffic,
      (SELECT count(*) FROM website_projects wp WHERE wp.acceptance_id = a.id) > 0 AS has_website,
      (SELECT count(*) FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) > 0 AS has_landing_page,
      -- Total de tarefas
      (SELECT count(*) FROM project_tasks pt WHERE pt.project_id = a.id) AS total_tasks,
      (SELECT count(*) FROM project_tasks pt WHERE pt.project_id = a.id AND pt.status NOT IN ('done')) AS pending_tasks
    FROM acceptances a
    WHERE (p_status IS NULL OR a.status = p_status)
  ) c;
  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_all_clients"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_all_projects"("p_service_type" "text" DEFAULT NULL::"text", "p_status_filter" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(proj ORDER BY proj.company_name) INTO result
  FROM (
    SELECT
      tp.id::text,
      'Gestão de Tráfego' AS service_type,
      a.company_name,
      tp.survey_status,
      tp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id) AS total_campaigns,
      (SELECT count(*) FROM traffic_campaigns tc WHERE tc.traffic_project_id = tp.id AND tc.status = 'active') AS active_campaigns,
      tp.created_at
    FROM traffic_projects tp
    JOIN acceptances a ON a.id = tp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'traffic')
    UNION ALL
    SELECT
      wp.id::text,
      'Criação de Site' AS service_type,
      a.company_name,
      wp.survey_status,
      wp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id) AS total_campaigns,
      (SELECT count(*) FROM websites w WHERE w.website_project_id = wp.id AND w.status != 'delivered') AS active_campaigns,
      wp.created_at
    FROM website_projects wp
    JOIN acceptances a ON a.id = wp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'website')
    UNION ALL
    SELECT
      lp.id::text,
      'Landing Page' AS service_type,
      a.company_name,
      lp.survey_status,
      lp.account_setup_status,
      a.status AS client_status,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id) AS total_campaigns,
      (SELECT count(*) FROM landing_pages l WHERE l.landing_page_project_id = lp.id AND l.status != 'delivered') AS active_campaigns,
      lp.created_at
    FROM landing_page_projects lp
    JOIN acceptances a ON a.id = lp.acceptance_id
    WHERE (p_service_type IS NULL OR p_service_type = 'landing_page')
  ) proj
  WHERE (p_status_filter IS NULL OR proj.client_status = p_status_filter);
  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_all_projects"("p_service_type" "text", "p_status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_all_proposals"("p_status_filter" "text" DEFAULT 'all'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(p ORDER BY p.created_at DESC) INTO result
  FROM (
    SELECT
      p.id,
      p.slug,
      p.company_name,
      p.responsible_name,
      p.monthly_fee,
      p.setup_fee,
      p.media_limit,
      p.contract_duration,
      p.services,
      p.created_at,
      -- Verificar se foi aceita
      (SELECT count(*) FROM acceptances a WHERE a.proposal_id = p.id) > 0 AS was_accepted,
      (SELECT a.status FROM acceptances a WHERE a.proposal_id = p.id LIMIT 1) AS acceptance_status
    FROM proposals p
    WHERE 
        (p_status_filter = 'all') OR
        (p_status_filter = 'open' AND NOT EXISTS (SELECT 1 FROM acceptances a WHERE a.proposal_id = p.id)) OR
        (p_status_filter = 'accepted' AND EXISTS (SELECT 1 FROM acceptances a WHERE a.proposal_id = p.id))
  ) p;
  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_all_proposals"("p_status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_all_tasks"("p_project_id" bigint DEFAULT NULL::bigint, "p_status" "text" DEFAULT NULL::"text", "p_overdue" boolean DEFAULT NULL::boolean, "p_reference_date" "date" DEFAULT NULL::"date", "p_reference_tz" "text" DEFAULT NULL::"text", "p_created_date" "date" DEFAULT NULL::"date") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
  v_status text;
  v_reference_date date;
BEGIN
  v_status := nullif(lower(trim(coalesce(p_status, ''))), '');

  -- Backward compatibility with legacy labels used by older router prompts.
  IF v_status = 'todo' THEN
    v_status := 'backlog';
  ELSIF v_status = 'review' THEN
    v_status := 'approval';
  END IF;

  v_reference_date := COALESCE(
    p_reference_date,
    CASE
      WHEN nullif(trim(coalesce(p_reference_tz, '')), '') IS NULL
        THEN CURRENT_DATE
      ELSE (now() AT TIME ZONE p_reference_tz)::date
    END
  );

  SELECT json_agg(t ORDER BY t.created_at DESC) INTO result
  FROM (
    SELECT
      pt.id::text,
      a.company_name AS client_name,
      pt.title,
      pt.description,
      pt.status,
      pt.priority,
      pt.assignee,
      pt.due_date,
      pt.created_at,
      (pt.due_date IS NOT NULL AND pt.due_date::date < v_reference_date AND pt.status <> 'done') AS is_overdue
    FROM project_tasks pt
    JOIN acceptances a ON a.id = pt.project_id
    WHERE (p_project_id IS NULL OR pt.project_id = p_project_id)
      AND (v_status IS NULL OR pt.status = v_status)
      AND (
        COALESCE(p_overdue, false) = false
        OR (
          pt.due_date IS NOT NULL
          AND pt.due_date::date < v_reference_date
          AND pt.status <> 'done'
        )
      )
      AND (p_created_date IS NULL OR (pt.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_created_date)
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_all_tasks"("p_project_id" bigint, "p_status" "text", "p_overdue" boolean, "p_reference_date" "date", "p_reference_tz" "text", "p_created_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_all_users"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(u ORDER BY u.name) INTO result
  FROM (
    SELECT
      u.id::text,
      u.name,
      u.email,
      u.phone,
      u.role,
      u.full_name,
      u.created_at,
      -- Último acesso
      (SELECT al.accessed_at FROM access_logs al WHERE al.user_id = u.id ORDER BY al.accessed_at DESC LIMIT 1) AS last_access
    FROM app_users u
  ) u;
  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_all_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_autonomy_suggestions"("p_project_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_suggestions JSONB := '[]'::jsonb;
    v_item        JSONB;
    v_rec         RECORD;
    v_user_role   TEXT;
BEGIN
    -- Verificação de acesso: somente gestores
    SELECT role INTO v_user_role FROM public.app_users WHERE email = auth.jwt() ->> 'email';
    IF v_user_role IS DISTINCT FROM 'gestor' THEN
        RAISE EXCEPTION 'Acesso negado: apenas gestores podem acessar sugestões de telemetria.';
    END IF;

    FOR v_rec IN
        SELECT pt.title, pt.due_date, a.company_name AS project_name, pt.project_id
          FROM project_tasks pt
          JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.due_date < CURRENT_DATE
           AND pt.status != 'done'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.due_date ASC LIMIT 5
    LOOP
        v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
            'type', 'overdue_task',
            'message', format('Tarefa "%s" está atrasada (venceu em %s).', v_rec.title, v_rec.due_date),
            'project_name', v_rec.project_name,
            'task_title', v_rec.title,
            'due_date', v_rec.due_date
        ));
    END LOOP;

    FOR v_rec IN
        SELECT pt.title, pt.created_at, a.company_name AS project_name, pt.project_id
          FROM project_tasks pt
          JOIN acceptances a ON a.id = pt.project_id
         WHERE pt.status = 'backlog'
           AND pt.assignee IS NULL
           AND pt.created_at < now() - INTERVAL '7 days'
           AND (p_project_id IS NULL OR pt.project_id = p_project_id)
         ORDER BY pt.created_at ASC LIMIT 5
    LOOP
        v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
            'type', 'unassigned_backlog',
            'message', format('Tarefa "%s" está no backlog há mais de 7 dias sem responsável.', v_rec.title),
            'project_name', v_rec.project_name,
            'task_title', v_rec.title
        ));
    END LOOP;

    FOR v_rec IN
        SELECT a.id, a.company_name AS project_name,
               count(pt.id) AS total_tasks,
               count(pt.id) FILTER (WHERE pt.status = 'done') AS done_tasks
          FROM acceptances a
          JOIN project_tasks pt ON pt.project_id = a.id
         WHERE a.status = 'Ativo'
           AND (p_project_id IS NULL OR a.id = p_project_id)
         GROUP BY a.id, a.company_name
        HAVING count(pt.id) > 0
           AND count(pt.id) = count(pt.id) FILTER (WHERE pt.status = 'done')
         LIMIT 3
    LOOP
        v_suggestions := v_suggestions || jsonb_build_array(jsonb_build_object(
            'type', 'all_tasks_done',
            'message', format('Projeto "%s" tem todas as %s tarefas concluídas. Considere marcar como Inativo.',
                v_rec.project_name, v_rec.total_tasks),
            'project_name', v_rec.project_name,
            'task_title', null,
            'total_tasks', v_rec.total_tasks
        ));
    END LOOP;

    RETURN v_suggestions;
END; $$;


ALTER FUNCTION "public"."query_autonomy_suggestions"("p_project_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_financial_summary"("p_reference_date" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT 'Ativo'::"text", "p_company_name" "text" DEFAULT NULL::"text", "p_reference_tz" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
  v_reference_date date;
  v_status_norm text;
BEGIN
  v_reference_date := COALESCE(
    p_reference_date,
    CASE
      WHEN nullif(trim(coalesce(p_reference_tz, '')), '') IS NULL
        THEN CURRENT_DATE
      ELSE (now() AT TIME ZONE p_reference_tz)::date
    END
  );

  v_status_norm := nullif(lower(trim(coalesce(p_status, ''))), '');

  WITH contract_base AS (
    SELECT
      a.id,
      a.id::text AS acceptance_id,
      a.proposal_id,
      a.company_name,
      a.status AS client_status,
      a.timestamp AS accepted_at,
      a.expiration_date,
      COALESCE(
        public.parse_financial_numeric(p.monthly_fee::text),
        public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,monthly_fee}'),
        public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,value}'),
        public.parse_financial_numeric(a.contract_snapshot ->> 'monthly_fee'),
        public.parse_financial_numeric(a.contract_snapshot ->> 'value'),
        0::numeric
      ) AS monthly_fee,
      COALESCE(
        public.parse_financial_numeric(p.setup_fee::text),
        public.parse_financial_numeric(a.contract_snapshot #>> '{proposal,setup_fee}'),
        public.parse_financial_numeric(a.contract_snapshot ->> 'setup_fee'),
        0::numeric
      ) AS setup_fee,
      EXISTS (SELECT 1 FROM traffic_projects tp WHERE tp.acceptance_id = a.id) AS has_traffic,
      EXISTS (SELECT 1 FROM website_projects wp WHERE wp.acceptance_id = a.id) AS has_website,
      EXISTS (SELECT 1 FROM landing_page_projects lp WHERE lp.acceptance_id = a.id) AS has_landing_page
    FROM acceptances a
    LEFT JOIN proposals p ON p.id = a.proposal_id
    WHERE (p_company_name IS NULL OR a.company_name ILIKE '%' || p_company_name || '%')
      AND (
        v_status_norm IS NULL
        OR (
          v_status_norm = 'ativo'
          AND (
            nullif(trim(coalesce(a.status, '')), '') IS NULL
            OR lower(trim(a.status)) IN ('ativo', 'onboarding', 'em andamento')
          )
        )
        OR (
          v_status_norm <> 'ativo'
          AND lower(trim(coalesce(a.status, ''))) = v_status_norm
        )
      )
  ),
  normalized AS (
    SELECT
      cb.*,
      (
        CASE WHEN cb.has_traffic THEN 1 ELSE 0 END +
        CASE WHEN cb.has_website THEN 1 ELSE 0 END +
        CASE WHEN cb.has_landing_page THEN 1 ELSE 0 END
      )::int AS total_projects,
      (
        (
          nullif(trim(coalesce(cb.client_status, '')), '') IS NULL
          OR lower(trim(cb.client_status)) IN ('ativo', 'onboarding', 'em andamento')
        )
        AND (cb.accepted_at IS NULL OR cb.accepted_at::date <= v_reference_date)
        AND (cb.expiration_date IS NULL OR cb.expiration_date >= v_reference_date)
      ) AS is_active_contract
    FROM contract_base cb
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE is_active_contract) AS active_contracts,
      COUNT(DISTINCT company_name) FILTER (WHERE is_active_contract) AS active_clients,
      COALESCE(SUM(total_projects) FILTER (WHERE is_active_contract), 0)::int AS active_projects,
      COALESCE(SUM(CASE WHEN is_active_contract AND has_traffic THEN 1 ELSE 0 END), 0)::int AS active_traffic_projects,
      COALESCE(SUM(CASE WHEN is_active_contract AND has_website THEN 1 ELSE 0 END), 0)::int AS active_website_projects,
      COALESCE(SUM(CASE WHEN is_active_contract AND has_landing_page THEN 1 ELSE 0 END), 0)::int AS active_landing_page_projects,
      COALESCE(SUM(monthly_fee) FILTER (WHERE is_active_contract), 0)::numeric AS mrr,
      (COALESCE(SUM(monthly_fee) FILTER (WHERE is_active_contract), 0)::numeric * 12)::numeric AS arr,
      COALESCE(SUM(setup_fee) FILTER (WHERE is_active_contract), 0)::numeric AS active_setup_fee_total,
      COUNT(*) FILTER (WHERE is_active_contract AND monthly_fee > 0) AS active_contracts_with_monthly_fee,
      COUNT(*) FILTER (WHERE is_active_contract AND monthly_fee <= 0) AS active_contracts_without_monthly_fee
    FROM normalized
  )
  SELECT json_build_object(
    'reference_date', v_reference_date,
    'status_filter', p_status,
    'company_filter', p_company_name,
    'totals', json_build_object(
      'active_contracts', t.active_contracts,
      'active_clients', t.active_clients,
      'active_projects', t.active_projects,
      'active_projects_by_service', json_build_object(
        'traffic', t.active_traffic_projects,
        'website', t.active_website_projects,
        'landing_page', t.active_landing_page_projects
      ),
      'mrr', t.mrr,
      'arr', t.arr,
      'active_setup_fee_total', t.active_setup_fee_total,
      'active_contracts_with_monthly_fee', t.active_contracts_with_monthly_fee,
      'active_contracts_without_monthly_fee', t.active_contracts_without_monthly_fee
    ),
    'active_contracts', COALESCE(
      (
        SELECT json_agg(json_build_object(
          'acceptance_id', n.acceptance_id,
          'company_name', n.company_name,
          'client_status', n.client_status,
          'accepted_at', n.accepted_at,
          'expiration_date', n.expiration_date,
          'monthly_fee', n.monthly_fee,
          'setup_fee', n.setup_fee,
          'has_traffic', n.has_traffic,
          'has_website', n.has_website,
          'has_landing_page', n.has_landing_page,
          'total_projects', n.total_projects
        ) ORDER BY n.company_name)
        FROM normalized n
        WHERE n.is_active_contract
      ),
      '[]'::json
    )
  )
  INTO result
  FROM totals t;

  RETURN COALESCE(result, '{}'::json);
END;
$$;


ALTER FUNCTION "public"."query_financial_summary"("p_reference_date" "date", "p_status" "text", "p_company_name" "text", "p_reference_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_memory_slo"("p_days" integer DEFAULT 1, "p_target_recall_hit_rate" numeric DEFAULT 95, "p_max_critical_canary_failures" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
DECLARE
  v_cutoff timestamptz;
  v_jwt_role text;
  v_user_role text;

  v_recall_total bigint := 0;
  v_recall_hits bigint := 0;
  v_recall_misses bigint := 0;
  v_recall_hit_rate numeric := NULL;

  v_canary_runs bigint := 0;
  v_canary_critical_failures bigint := 0;
  v_last_canary_status text := 'no_data';
  v_last_canary_at timestamptz := NULL;

  v_recall_below_slo boolean := false;
  v_canary_alert boolean := false;
  v_overall text := 'ok';
BEGIN
  v_jwt_role := coalesce(auth.role(), nullif(current_setting('request.jwt.claim.role', true), ''));

  -- Security rule:
  -- - service_role can query directly (automation/ops).
  -- - authenticated users must be gestor.
  IF coalesce(v_jwt_role, '') <> 'service_role' THEN
    SELECT role
      INTO v_user_role
      FROM public.app_users
     WHERE email = auth.jwt() ->> 'email'
     LIMIT 1;

    IF v_user_role IS DISTINCT FROM 'gestor' THEN
      RAISE EXCEPTION 'Access denied: only gestores can access memory SLO.';
    END IF;
  END IF;

  v_cutoff := now() - (greatest(1, p_days) || ' days')::interval;

  -- Recall events are inferred from canonical assistant recall answers saved in cognitive memory.
  WITH recall_events AS (
    SELECT
      d.created_at,
      CASE
        WHEN d.content ILIKE '%A ultima informacao que voce pediu para salvar foi:%'
          OR d.content ILIKE '%A última informação que você pediu para salvar foi:%'
          THEN 'hit'
        WHEN d.content ILIKE '%Nao encontrei uma memoria explicita salva recentemente para recuperar agora.%'
          OR d.content ILIKE '%Não encontrei uma memória explícita salva recentemente para recuperar agora.%'
          THEN 'miss'
        ELSE NULL
      END AS recall_result
    FROM brain.documents d
    WHERE d.created_at >= v_cutoff
      AND d.metadata->>'source' = 'cognitive_live_memory'
      AND d.metadata->>'role' = 'assistant'
      AND (
        d.content ILIKE '%A ultima informacao que voce pediu para salvar foi:%'
        OR d.content ILIKE '%A última informação que você pediu para salvar foi:%'
        OR d.content ILIKE '%Nao encontrei uma memoria explicita salva recentemente para recuperar agora.%'
        OR d.content ILIKE '%Não encontrei uma memória explícita salva recentemente para recuperar agora.%'
      )
  )
  SELECT
    count(*) FILTER (WHERE recall_result IN ('hit', 'miss')),
    count(*) FILTER (WHERE recall_result = 'hit'),
    count(*) FILTER (WHERE recall_result = 'miss')
  INTO v_recall_total, v_recall_hits, v_recall_misses
  FROM recall_events;

  IF v_recall_total > 0 THEN
    v_recall_hit_rate := round((v_recall_hits::numeric / v_recall_total::numeric) * 100, 2);
  END IF;

  -- Canary runs are captured in brain.execution_logs by scripts/check_brain_canary.js
  -- when SUPABASE_SERVICE_ROLE_KEY is configured.
  SELECT
    count(*),
    count(*) FILTER (
      WHERE el.status <> 'success'
         OR coalesce((el.params->>'critical_failed')::int, 0) > 0
    )
  INTO v_canary_runs, v_canary_critical_failures
  FROM brain.execution_logs el
  WHERE el.created_at >= v_cutoff
    AND el.agent_name = 'Canary_BrainMemory'
    AND el.action = 'memory_canary';

  SELECT el.status, el.created_at
    INTO v_last_canary_status, v_last_canary_at
  FROM brain.execution_logs el
  WHERE el.agent_name = 'Canary_BrainMemory'
    AND el.action = 'memory_canary'
  ORDER BY el.created_at DESC
  LIMIT 1;

  v_recall_below_slo := (
    v_recall_total > 0
    AND v_recall_hit_rate IS NOT NULL
    AND v_recall_hit_rate < p_target_recall_hit_rate
  );

  v_canary_alert := v_canary_critical_failures > p_max_critical_canary_failures;

  IF v_recall_total = 0 AND v_canary_runs = 0 THEN
    v_overall := 'no_data';
  ELSIF v_recall_below_slo OR v_canary_alert THEN
    v_overall := 'alert';
  ELSE
    v_overall := 'ok';
  END IF;

  RETURN jsonb_build_object(
    'period_days', greatest(1, p_days),
    'cutoff_date', v_cutoff::date,
    'targets', jsonb_build_object(
      'recall_hit_rate_min', p_target_recall_hit_rate,
      'critical_canary_failures_max', p_max_critical_canary_failures
    ),
    'recall', jsonb_build_object(
      'total_requests', coalesce(v_recall_total, 0),
      'hits', coalesce(v_recall_hits, 0),
      'misses', coalesce(v_recall_misses, 0),
      'hit_rate', v_recall_hit_rate
    ),
    'canary', jsonb_build_object(
      'runs', coalesce(v_canary_runs, 0),
      'critical_failures', coalesce(v_canary_critical_failures, 0),
      'last_status', coalesce(v_last_canary_status, 'no_data'),
      'last_run_at', v_last_canary_at
    ),
    'alerts', jsonb_build_object(
      'recall_below_slo', v_recall_below_slo,
      'canary_critical_failures', v_canary_alert,
      'overall', v_overall
    )
  );
END;
$$;


ALTER FUNCTION "public"."query_memory_slo"("p_days" integer, "p_target_recall_hit_rate" numeric, "p_max_critical_canary_failures" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_survey_responses"("p_client_name" "text" DEFAULT NULL::"text", "p_project_type" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      a.company_name AS client_name,
      'traffic' as project_type,
      tp.survey_status,
      tp.survey_data,
      tp.created_at
    FROM traffic_projects tp
    JOIN acceptances a ON tp.acceptance_id = a.id
    WHERE 
      (p_client_name IS NULL OR a.company_name ILIKE '%' || p_client_name || '%')
      AND (p_project_type IS NULL OR p_project_type = 'traffic')
      AND tp.survey_data IS NOT NULL

    UNION ALL

    SELECT 
      a.company_name AS client_name,
      'landing_page' as project_type,
      lp.survey_status,
      lp.survey_data,
      lp.created_at
    FROM landing_page_projects lp
    JOIN acceptances a ON lp.acceptance_id = a.id
    WHERE 
      (p_client_name IS NULL OR a.company_name ILIKE '%' || p_client_name || '%')
      AND (p_project_type IS NULL OR p_project_type = 'landing_page')
      AND lp.survey_data IS NOT NULL

    UNION ALL

    SELECT 
      a.company_name AS client_name,
      'website' as project_type,
      wp.survey_status,
      wp.survey_data,
      wp.created_at
    FROM website_projects wp
    JOIN acceptances a ON wp.acceptance_id = a.id
    WHERE 
      (p_client_name IS NULL OR a.company_name ILIKE '%' || p_client_name || '%')
      AND (p_project_type IS NULL OR p_project_type = 'website')
      AND wp.survey_data IS NOT NULL
    
    ORDER BY created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 10), 1)
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."query_survey_responses"("p_client_name" "text", "p_project_type" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_task_telemetry"("p_days" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_today            date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cutoff           date    := v_today - p_days;
  v_has_overdue_col  boolean := false;
  v_has_completed_col boolean := false;
  v_summary          jsonb;
  v_monthly_trend    jsonb;
  v_by_assignee      jsonb;
  v_by_client        jsonb;
  v_snapshot_history jsonb   := '[]'::jsonb;
  v_status_dist      jsonb;
BEGIN

  -- ── 1. Detect which columns are available ────────────────────────────────────
  SELECT
    bool_or(column_name = 'overdue_flagged_at'),
    bool_or(column_name = 'completed_at')
  INTO v_has_overdue_col, v_has_completed_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'project_tasks'
    AND column_name  IN ('overdue_flagged_at', 'completed_at');

  -- ── 2. Summary KPIs ──────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT jsonb_build_object(
        'total',               count(*),
        'open',                count(*) FILTER (WHERE status NOT IN ('done','paused')),
        'done',                count(*) FILTER (WHERE status = 'done'),
        'paused',              count(*) FILTER (WHERE status = 'paused'),
        'overdue_now',         count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done'),
        'ever_overdue',        count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL),
        'overdue_completed',   count(*) FILTER (
                                 WHERE overdue_flagged_at IS NOT NULL
                                   AND status = 'done'),
        'overdue_still_open',  count(*) FILTER (
                                 WHERE overdue_flagged_at IS NOT NULL
                                   AND status != 'done')
      )
      FROM public.project_tasks
    $q$, v_today) INTO v_summary;
  ELSE
    -- Fallback: compute overdue on-the-fly from due_date
    EXECUTE format($q$
      SELECT jsonb_build_object(
        'total',               count(*),
        'open',                count(*) FILTER (WHERE status NOT IN ('done','paused')),
        'done',                count(*) FILTER (WHERE status = 'done'),
        'paused',              count(*) FILTER (WHERE status = 'paused'),
        'overdue_now',         count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done'),
        'ever_overdue',        count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done'),
        'overdue_completed',   0,
        'overdue_still_open',  count(*) FILTER (
                                 WHERE due_date IS NOT NULL
                                   AND due_date::date < %L
                                   AND status != 'done')
      )
      FROM public.project_tasks
    $q$, v_today, v_today, v_today) INTO v_summary;
  END IF;

  -- ── 3. Monthly trend ─────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.month_date), '[]'::jsonb)
      FROM (
        SELECT
          to_char(date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'), 'MM/YY') AS month,
          date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')                    AS month_date,
          count(*)                                                AS criadas,
          count(*) FILTER (WHERE status = 'done')                AS concluidas,
          count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL)  AS atrasadas
        FROM public.project_tasks
        WHERE created_at >= %L
        GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
      ) r
    $q$, (v_cutoff - interval '2 months')::timestamptz) INTO v_monthly_trend;
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.month_date), '[]'::jsonb)
      FROM (
        SELECT
          to_char(date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo'), 'MM/YY') AS month,
          date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')                    AS month_date,
          count(*)                                               AS criadas,
          count(*) FILTER (WHERE status = 'done')               AS concluidas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS atrasadas
        FROM public.project_tasks
        WHERE created_at >= %L
        GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
      ) r
    $q$, v_today, (v_cutoff - interval '2 months')::timestamptz) INTO v_monthly_trend;
  END IF;

  -- ── 4. By assignee ───────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(trim(assignee),''), 'Sem responsável') AS assignee,
          count(*)                                                AS total_tasks,
          count(*) FILTER (WHERE status = 'done')                AS concluidas,
          count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
          count(*) FILTER (WHERE overdue_flagged_at IS NOT NULL)  AS ja_atrasadas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS atrasadas_agora
        FROM public.project_tasks
        GROUP BY COALESCE(NULLIF(trim(assignee),''), 'Sem responsável')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today) INTO v_by_assignee;
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(trim(assignee),''), 'Sem responsável') AS assignee,
          count(*)                                                AS total_tasks,
          count(*) FILTER (WHERE status = 'done')                AS concluidas,
          count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS ja_atrasadas,
          count(*) FILTER (
            WHERE due_date IS NOT NULL
              AND due_date::date < %L
              AND status != 'done')                              AS atrasadas_agora
        FROM public.project_tasks
        GROUP BY COALESCE(NULLIF(trim(assignee),''), 'Sem responsável')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today, v_today) INTO v_by_assignee;
  END IF;

  -- ── 5. By client ─────────────────────────────────────────────────────────────

  IF v_has_overdue_col THEN
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(a.company_name, 'Sem cliente')                  AS client,
          count(pt.*)                                               AS total_tasks,
          count(pt.*) FILTER (WHERE pt.status = 'done')            AS concluidas,
          count(pt.*) FILTER (WHERE pt.status NOT IN ('done','paused')) AS abertas,
          count(pt.*) FILTER (WHERE pt.overdue_flagged_at IS NOT NULL)  AS ja_atrasadas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < %L
              AND pt.status != 'done')                             AS atrasadas_agora
        FROM public.project_tasks pt
        LEFT JOIN public.acceptances a ON pt.project_id = a.id
        GROUP BY COALESCE(a.company_name, 'Sem cliente')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today) INTO v_by_client;
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(jsonb_agg(r ORDER BY r.total_tasks DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(a.company_name, 'Sem cliente')                  AS client,
          count(pt.*)                                               AS total_tasks,
          count(pt.*) FILTER (WHERE pt.status = 'done')            AS concluidas,
          count(pt.*) FILTER (WHERE pt.status NOT IN ('done','paused')) AS abertas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < %L
              AND pt.status != 'done')                             AS ja_atrasadas,
          count(pt.*) FILTER (
            WHERE pt.due_date IS NOT NULL
              AND pt.due_date::date < %L
              AND pt.status != 'done')                             AS atrasadas_agora
        FROM public.project_tasks pt
        LEFT JOIN public.acceptances a ON pt.project_id = a.id
        GROUP BY COALESCE(a.company_name, 'Sem cliente')
        ORDER BY total_tasks DESC
        LIMIT 10
      ) r
    $q$, v_today, v_today) INTO v_by_client;
  END IF;

  -- ── 6. Snapshot history (only if table exists) ───────────────────────────────

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'task_monthly_snapshots'
  ) THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r.snapshot_month), '[]'::jsonb)
    INTO v_snapshot_history
    FROM (
      SELECT
        to_char(snapshot_month, 'MM/YY')                       AS month,
        snapshot_month,
        count(*)                                               AS total,
        count(*) FILTER (WHERE status = 'done')                AS concluidas,
        count(*) FILTER (WHERE status NOT IN ('done','paused')) AS abertas,
        count(*) FILTER (WHERE was_overdue = true)             AS atrasadas
      FROM public.task_monthly_snapshots
      WHERE snapshot_month >= (v_cutoff - interval '1 month')::date
      GROUP BY snapshot_month
      ORDER BY snapshot_month
    ) r;
  END IF;

  -- ── 7. Status distribution ───────────────────────────────────────────────────

  SELECT COALESCE(jsonb_agg(r ORDER BY r.count DESC), '[]'::jsonb)
  INTO v_status_dist
  FROM (
    SELECT status, count(*) AS count
    FROM public.project_tasks
    GROUP BY status
  ) r;

  -- ── 8. Return ────────────────────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'summary',            v_summary,
    'monthly_trend',      COALESCE(v_monthly_trend,    '[]'::jsonb),
    'by_assignee',        COALESCE(v_by_assignee,      '[]'::jsonb),
    'by_client',          COALESCE(v_by_client,        '[]'::jsonb),
    'snapshot_history',   v_snapshot_history,
    'status_distribution', COALESCE(v_status_dist,    '[]'::jsonb),
    'has_overdue_tracking', v_has_overdue_col
  );

END;
$_$;


ALTER FUNCTION "public"."query_task_telemetry"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."query_telemetry_summary"("p_days" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
DECLARE
    v_cutoff          TIMESTAMPTZ;
    v_total           BIGINT;
    v_success         BIGINT;
    v_errors          BIGINT;
    v_avg_latency     NUMERIC;
    v_tokens_input    BIGINT;
    v_tokens_output   BIGINT;
    v_tokens_total    BIGINT;
    v_cost_total      NUMERIC;
    v_top_actions     JSONB;
    v_error_by_day    JSONB;
    v_top_projects    JSONB;
    v_tokens_by_agent JSONB;
    v_usage_by_model  JSONB;
    v_user_role       TEXT;
BEGIN
    -- Verificação de acesso: somente gestores
    SELECT role INTO v_user_role FROM public.app_users WHERE email = auth.jwt() ->> 'email';
    IF v_user_role IS DISTINCT FROM 'gestor' THEN
        RAISE EXCEPTION 'Acesso negado: apenas gestores podem acessar dados de telemetria.';
    END IF;

    v_cutoff := now() - (p_days || ' days')::INTERVAL;

    SELECT
        count(*),
        count(*) FILTER (WHERE el.status = 'success'),
        count(*) FILTER (WHERE el.status = 'error'),
        round(avg(el.latency_ms)::NUMERIC, 2),
        coalesce(sum(el.tokens_input), 0),
        coalesce(sum(el.tokens_output), 0),
        coalesce(sum(el.tokens_total), 0),
        coalesce(round(sum(el.cost_est)::NUMERIC, 4), 0)
      INTO v_total, v_success, v_errors, v_avg_latency,
           v_tokens_input, v_tokens_output, v_tokens_total, v_cost_total
      FROM brain.execution_logs el
     WHERE el.created_at >= v_cutoff;

    SELECT coalesce(jsonb_agg(t ORDER BY t.count DESC), '[]'::jsonb)
      INTO v_top_actions
      FROM (
          SELECT
              el.action,
              count(*) AS count,
              round(avg(el.latency_ms)::NUMERIC, 2) AS avg_latency_ms,
              count(*) FILTER (WHERE el.status = 'error') AS error_count,
              coalesce(sum(el.tokens_total), 0) AS tokens_total
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.action
           ORDER BY count DESC
           LIMIT 10
      ) t;

    -- Tokens por agente
    SELECT coalesce(jsonb_agg(t ORDER BY t.tokens_total DESC), '[]'::jsonb)
      INTO v_tokens_by_agent
      FROM (
          SELECT
              el.agent_name,
              coalesce(sum(el.tokens_input), 0)  AS tokens_input,
              coalesce(sum(el.tokens_output), 0) AS tokens_output,
              coalesce(sum(el.tokens_total), 0)  AS tokens_total,
              coalesce(round(sum(el.cost_est)::NUMERIC, 4), 0) AS cost_est,
              count(*) AS executions
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.agent_name
           ORDER BY tokens_total DESC
      ) t;

    -- NOVO: Uso por Modelo
    -- Extrai do campo params->'model_usage' o detalhamento acumulado
    SELECT coalesce(jsonb_agg(t ORDER BY t.cost DESC), '[]'::jsonb)
      INTO v_usage_by_model
      FROM (
          WITH expanded AS (
              SELECT 
                m.model_name,
                (m.data->>'input_tokens')::INT as input_tokens,
                (m.data->>'output_tokens')::INT as output_tokens,
                (m.data->>'cost')::NUMERIC as cost
              FROM brain.execution_logs el
              CROSS JOIN LATERAL (
                  SELECT key as model_name, value as data
                  FROM jsonb_each(el.params->'model_usage')
                  WHERE jsonb_typeof(el.params->'model_usage') = 'object'
              ) m
              WHERE el.created_at >= v_cutoff
          )
          SELECT 
            model_name,
            sum(input_tokens) as tokens_input,
            sum(output_tokens) as tokens_output,
            sum(input_tokens + output_tokens) as tokens_total,
            round(sum(cost)::NUMERIC, 4) as cost
          FROM expanded
          GROUP BY model_name
      ) t;

    SELECT coalesce(jsonb_agg(t ORDER BY t.date), '[]'::jsonb)
      INTO v_error_by_day
      FROM (
          SELECT
              el.created_at::DATE AS date,
              count(*) AS total,
              count(*) FILTER (WHERE el.status = 'error')   AS errors,
              count(*) FILTER (WHERE el.status = 'success') AS successes
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
           GROUP BY el.created_at::DATE
           ORDER BY el.created_at::DATE
           LIMIT 30
      ) t;

    SELECT coalesce(jsonb_agg(t ORDER BY t.count DESC), '[]'::jsonb)
      INTO v_top_projects
      FROM (
          SELECT
              coalesce(el.params->>'client_name', 'Sem projeto') AS client_name,
              count(*) AS count
            FROM brain.execution_logs el
           WHERE el.created_at >= v_cutoff
             AND el.params->>'client_name' IS NOT NULL
           GROUP BY el.params->>'client_name'
           ORDER BY count DESC
           LIMIT 10
      ) t;

    RETURN jsonb_build_object(
        'period_days',          p_days,
        'cutoff_date',          v_cutoff::DATE,
        'total_executions',     coalesce(v_total, 0),
        'success_count',        coalesce(v_success, 0),
        'error_count',          coalesce(v_errors, 0),
        'success_rate',         CASE WHEN coalesce(v_total,0) > 0
                                     THEN round((v_success::NUMERIC / v_total) * 100, 1)
                                     ELSE 0 END,
        'avg_latency_ms',       coalesce(v_avg_latency, 0),
        'tokens_input',         coalesce(v_tokens_input, 0),
        'tokens_output',        coalesce(v_tokens_output, 0),
        'tokens_total',         coalesce(v_tokens_total, 0),
        'cost_total_usd',       coalesce(v_cost_total, 0),
        'top_actions',          coalesce(v_top_actions, '[]'::jsonb),
        'error_rate_by_day',    coalesce(v_error_by_day, '[]'::jsonb),
        'most_active_projects', coalesce(v_top_projects, '[]'::jsonb),
        'tokens_by_agent',      coalesce(v_tokens_by_agent, '[]'::jsonb),
        'usage_by_model',       coalesce(v_usage_by_model, '[]'::jsonb)
    );
END; $$;


ALTER FUNCTION "public"."query_telemetry_summary"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_brain_sync_job"("p_url" "text", "p_service_role_key" "text", "p_job_name" "text" DEFAULT 'invoke-brain-sync-every-5min'::"text", "p_schedule" "text" DEFAULT '*/5 * * * *'::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_headers jsonb;
  v_command text;
BEGIN
  IF nullif(trim(coalesce(p_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_url is required';
  END IF;

  IF nullif(trim(coalesce(p_service_role_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_service_role_key is required';
  END IF;

  IF nullif(trim(coalesce(p_job_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_job_name is required';
  END IF;

  IF nullif(trim(coalesce(p_schedule, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_schedule is required';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_service_role_key
  );

  v_command := format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := %L::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
    $cmd$,
    p_url,
    v_headers::text
  );

  -- Recreate the job safely if it already exists.
  BEGIN
    PERFORM cron.unschedule(p_job_name);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  PERFORM cron.schedule(p_job_name, p_schedule, v_command);
  RETURN p_job_name;
END;
$_$;


ALTER FUNCTION "public"."schedule_brain_sync_job"("p_url" "text", "p_service_role_key" "text", "p_job_name" "text", "p_schedule" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_proposal_acceptance"("p_name" "text", "p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_company_name" "text", "p_proposal_id" bigint, "p_contract_snapshot" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = p_proposal_id) THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  INSERT INTO public.acceptances (
    name, email, cpf, cnpj, company_name,
    proposal_id, contract_snapshot, status
  ) VALUES (
    p_name, p_email, p_cpf, p_cnpj, p_company_name,
    p_proposal_id, p_contract_snapshot, 'Ativo'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."submit_proposal_acceptance"("p_name" "text", "p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_company_name" "text", "p_proposal_id" bigint, "p_contract_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_task_history_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(
      id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details
    ) VALUES (
      gen_random_uuid(), NEW.id, NEW.project_id,
      'created', NULL, NEW.status,
      NEW.created_by, now(),
      jsonb_build_object(
        'title',    NEW.title,
        'assignee', NEW.assignee,
        'due_date', NEW.due_date,
        'priority', NEW.priority
      )
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_history(
      id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details
    ) VALUES (
      gen_random_uuid(), NEW.id, NEW.project_id,
      'status_change', OLD.status, NEW.status,
      NEW.assignee, now(),
      jsonb_build_object(
        'title',       NEW.title,
        'assignee',    NEW.assignee,
        'due_date',    NEW.due_date,
        'was_overdue', (NEW.overdue_flagged_at IS NOT NULL)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_task_history_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_task_timestamps_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := now();
    END IF;
    IF OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_task_timestamps_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_parse_timestamptz"("p_value" "text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."try_parse_timestamptz"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unschedule_brain_sync_job"("p_job_name" "text" DEFAULT 'invoke-brain-sync-every-5min'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF nullif(trim(coalesce(p_job_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_job_name is required';
  END IF;

  PERFORM cron.unschedule(p_job_name);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."unschedule_brain_sync_job"("p_job_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_chat_session_title"("p_session_id" "uuid", "p_title" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
BEGIN
  UPDATE brain.chat_sessions
  SET   title = p_title
  WHERE id      = p_session_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_chat_session_title"("p_session_id" "uuid", "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sync_item_status"("p_id" bigint, "p_status" "text", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'brain'
    AS $$
BEGIN
  UPDATE brain.sync_queue
  SET status = p_status,
      processed_at = NOW(),
      error_message = p_error_message
  WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."update_sync_item_status"("p_id" bigint, "p_status" "text", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_project_credentials"("p_acceptance_id" bigint, "p_credentials" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key text := 'c4marketingkey2026';
BEGIN
  INSERT INTO public.project_credentials (acceptance_id, credentials_encrypted, updated_by, updated_at)
  VALUES (
    p_acceptance_id,
    encode(extensions.pgp_sym_encrypt(p_credentials, v_key), 'base64'),
    auth.uid(),
    now()
  )
  ON CONFLICT (acceptance_id) DO UPDATE
    SET credentials_encrypted = EXCLUDED.credentials_encrypted,
        updated_by             = EXCLUDED.updated_by,
        updated_at             = now();
END;
$$;


ALTER FUNCTION "public"."upsert_project_credentials"("p_acceptance_id" bigint, "p_credentials" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("allowed_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE email = (SELECT auth.email())
      AND role = ANY(allowed_roles)
  );
$$;


ALTER FUNCTION "public"."user_has_role"("allowed_roles" "text"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "brain"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "brain"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "brain"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Nova Conversa'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "brain"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "brain"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "embedding" "extensions"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "brain"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "brain"."execution_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "agent_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "latency_ms" integer,
    "cost_est" numeric(10,6),
    "error_message" "text",
    "message_id" "text",
    "user_id" "uuid",
    "params" "jsonb" DEFAULT '{}'::"jsonb",
    "result" "jsonb" DEFAULT '{}'::"jsonb",
    "tokens_input" integer DEFAULT 0,
    "tokens_output" integer DEFAULT 0,
    "tokens_total" integer DEFAULT 0
);


ALTER TABLE "brain"."execution_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "brain"."sync_queue" (
    "id" bigint NOT NULL,
    "source_table" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "error_message" "text",
    CONSTRAINT "sync_queue_operation_check" CHECK (("operation" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"]))),
    CONSTRAINT "sync_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "brain"."sync_queue" OWNER TO "postgres";


ALTER TABLE "brain"."sync_queue" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "brain"."sync_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."acceptances" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "cpf" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "cnpj" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "status" "text" DEFAULT 'Inativo'::"text" NOT NULL,
    "proposal_id" bigint,
    "contract_snapshot" "jsonb",
    "expiration_date" "date"
);


ALTER TABLE "public"."acceptances" OWNER TO "postgres";


ALTER TABLE "public"."acceptances" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."acceptances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."access_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_email" "text",
    "accessed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_feedback" (
    "id" bigint NOT NULL,
    "user_email" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."ai_feedback" OWNER TO "postgres";


ALTER TABLE "public"."ai_feedback" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ai_feedback_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "cal_com_link" "text",
    CONSTRAINT "app_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'gestor'::"text", 'operacional'::"text", 'comercial'::"text", 'leitor'::"text", 'cliente'::"text"])))
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_users"."cal_com_link" IS 'Cal.com scheduling link or username for the user';



CREATE OR REPLACE VIEW "public"."chat_messages_view" AS
 SELECT "id",
    "session_id",
    "role",
    "content",
    "created_at"
   FROM "brain"."chat_messages";


ALTER VIEW "public"."chat_messages_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."chat_sessions_view" AS
 SELECT "id",
    "user_id",
    "title",
    "created_at",
    "updated_at"
   FROM "brain"."chat_sessions";


ALTER VIEW "public"."chat_sessions_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."contract_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landing_page_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acceptance_id" bigint,
    "survey_link" "text",
    "survey_status" "text" DEFAULT 'pending'::"text",
    "account_setup_status" "text" DEFAULT 'pending'::"text",
    "briefing_status" "text" DEFAULT 'pending'::"text",
    "survey_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "access_guide_data" "jsonb",
    CONSTRAINT "landing_page_projects_account_setup_status_check" CHECK (("account_setup_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"]))),
    CONSTRAINT "landing_page_projects_briefing_status_check" CHECK (("briefing_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"]))),
    CONSTRAINT "landing_page_projects_survey_status_check" CHECK (("survey_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."landing_page_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."landing_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "landing_page_project_id" "uuid",
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'content_received'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "landing_pages_status_check" CHECK (("status" = ANY (ARRAY['content_received'::"text", 'design'::"text", 'approval'::"text", 'adjustments'::"text", 'delivered'::"text"])))
);


ALTER TABLE "public"."landing_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message" "text" NOT NULL,
    "author_email" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "priority" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notices_priority_check" CHECK (("priority" = ANY (ARRAY['normal'::"text", 'importante'::"text", 'urgente'::"text"])))
);


ALTER TABLE "public"."notices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acceptance_id" bigint NOT NULL,
    "credentials_encrypted" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'backlog'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "assignee" "text",
    "due_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "attachment_url" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "created_by" "text",
    "overdue_flagged_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "project_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "project_tasks_status_check" CHECK (("status" = ANY (ARRAY['backlog'::"text", 'in_progress'::"text", 'approval'::"text", 'done'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."project_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."project_tasks"."overdue_flagged_at" IS 'Timestamp when task first became overdue. Never cleared — even if task is later completed.';



COMMENT ON COLUMN "public"."project_tasks"."completed_at" IS 'Timestamp when task status changed to done. Cleared if task is reopened.';



CREATE TABLE IF NOT EXISTS "public"."proposals" (
    "id" bigint NOT NULL,
    "slug" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "responsible_name" "text" NOT NULL,
    "monthly_fee" numeric NOT NULL,
    "setup_fee" numeric NOT NULL,
    "media_limit" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "contract_duration" integer DEFAULT 6 NOT NULL,
    "services" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."proposals" OWNER TO "postgres";


ALTER TABLE "public"."proposals" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."proposals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."task_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "project_id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "changed_by" "text",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "details" "jsonb"
);


ALTER TABLE "public"."task_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_monthly_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_month" "date" NOT NULL,
    "task_id" "uuid",
    "project_id" bigint,
    "company_name" "text",
    "title" "text",
    "status" "text",
    "assignee" "text",
    "created_by" "text",
    "due_date" timestamp with time zone,
    "created_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "overdue_flagged_at" timestamp with time zone,
    "was_overdue" boolean GENERATED ALWAYS AS (("overdue_flagged_at" IS NOT NULL)) STORED,
    "snapshotted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_monthly_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_monthly_snapshots" IS 'Permanent monthly archive of task state. Records overdue history even after task completion.';



CREATE TABLE IF NOT EXISTS "public"."traffic_campaign_timeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "step_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "responsible_id" "uuid",
    "observations" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "checklist_data" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "traffic_campaign_timeline_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text"]))),
    CONSTRAINT "traffic_campaign_timeline_step_key_check" CHECK (("step_key" = ANY (ARRAY['planning'::"text", 'creatives'::"text", 'execution'::"text", 'optimization'::"text", 'finalization'::"text"])))
);


ALTER TABLE "public"."traffic_campaign_timeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."traffic_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "traffic_project_id" "uuid",
    "platform" "text",
    "name" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "traffic_campaigns_platform_check" CHECK (("platform" = ANY (ARRAY['google_ads'::"text", 'meta_ads'::"text", 'linkedin_ads'::"text", 'tiktok_ads'::"text"]))),
    CONSTRAINT "traffic_campaigns_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."traffic_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."traffic_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acceptance_id" bigint,
    "survey_link" "text",
    "survey_status" "text" DEFAULT 'pending'::"text",
    "account_setup_status" "text" DEFAULT 'pending'::"text",
    "strategy_meeting_notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "survey_data" "jsonb",
    "access_data" "jsonb",
    CONSTRAINT "traffic_projects_account_setup_status_check" CHECK (("account_setup_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"]))),
    CONSTRAINT "traffic_projects_survey_status_check" CHECK (("survey_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."traffic_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acceptance_id" bigint,
    "survey_link" "text",
    "survey_status" "text" DEFAULT 'pending'::"text",
    "account_setup_status" "text" DEFAULT 'pending'::"text",
    "briefing_status" "text" DEFAULT 'pending'::"text",
    "survey_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "access_guide_data" "jsonb",
    CONSTRAINT "website_projects_account_setup_status_check" CHECK (("account_setup_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"]))),
    CONSTRAINT "website_projects_briefing_status_check" CHECK (("briefing_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"]))),
    CONSTRAINT "website_projects_survey_status_check" CHECK (("survey_status" = ANY (ARRAY['pending'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."website_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."websites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "website_project_id" "uuid",
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'content_received'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "websites_status_check" CHECK (("status" = ANY (ARRAY['content_received'::"text", 'design'::"text", 'approval'::"text", 'adjustments'::"text", 'delivered'::"text"])))
);


ALTER TABLE "public"."websites" OWNER TO "postgres";


ALTER TABLE ONLY "brain"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "brain"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "brain"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "brain"."execution_logs"
    ADD CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "brain"."sync_queue"
    ADD CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acceptances"
    ADD CONSTRAINT "acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."access_logs"
    ADD CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_feedback"
    ADD CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_templates"
    ADD CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_page_projects"
    ADD CONSTRAINT "landing_page_projects_acceptance_id_key" UNIQUE ("acceptance_id");



ALTER TABLE ONLY "public"."landing_page_projects"
    ADD CONSTRAINT "landing_page_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."landing_pages"
    ADD CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_credentials"
    ADD CONSTRAINT "project_credentials_acceptance_id_key" UNIQUE ("acceptance_id");



ALTER TABLE ONLY "public"."project_credentials"
    ADD CONSTRAINT "project_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."task_history"
    ADD CONSTRAINT "task_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_monthly_snapshots"
    ADD CONSTRAINT "task_monthly_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."traffic_campaign_timeline"
    ADD CONSTRAINT "traffic_campaign_timeline_campaign_id_step_key_key" UNIQUE ("campaign_id", "step_key");



ALTER TABLE ONLY "public"."traffic_campaign_timeline"
    ADD CONSTRAINT "traffic_campaign_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."traffic_campaigns"
    ADD CONSTRAINT "traffic_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."traffic_projects"
    ADD CONSTRAINT "traffic_projects_acceptance_id_key" UNIQUE ("acceptance_id");



ALTER TABLE ONLY "public"."traffic_projects"
    ADD CONSTRAINT "traffic_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_projects"
    ADD CONSTRAINT "website_projects_acceptance_id_key" UNIQUE ("acceptance_id");



ALTER TABLE ONLY "public"."website_projects"
    ADD CONSTRAINT "website_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."websites"
    ADD CONSTRAINT "websites_pkey" PRIMARY KEY ("id");



CREATE INDEX "documents_embedding_idx" ON "brain"."documents" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "idx_brain_documents_authority_type" ON "brain"."documents" USING "btree" (COALESCE(NULLIF("lower"(("metadata" ->> 'authority_type'::"text")), ''::"text"), 'memo'::"text"));



CREATE INDEX "idx_brain_documents_document_key" ON "brain"."documents" USING "btree" ((("metadata" ->> 'document_key'::"text")));



CREATE INDEX "idx_brain_documents_is_current" ON "brain"."documents" USING "btree" (COALESCE(NULLIF("lower"(("metadata" ->> 'is_current'::"text")), ''::"text"), 'true'::"text"));



CREATE INDEX "idx_brain_documents_source" ON "brain"."documents" USING "btree" ((("metadata" ->> 'source_table'::"text")), (("metadata" ->> 'source_id'::"text")));



CREATE INDEX "idx_brain_documents_status" ON "brain"."documents" USING "btree" (COALESCE(NULLIF("lower"(("metadata" ->> 'status'::"text")), ''::"text"), 'active'::"text"));



CREATE INDEX "idx_brain_documents_tenant_id" ON "brain"."documents" USING "btree" ((("metadata" ->> 'tenant_id'::"text")));



CREATE INDEX "idx_brain_sync_queue_status" ON "brain"."sync_queue" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_execution_logs_agent_name" ON "brain"."execution_logs" USING "btree" ("agent_name");



CREATE INDEX "idx_execution_logs_created_at" ON "brain"."execution_logs" USING "btree" ("created_at");



CREATE INDEX "idx_execution_logs_session_id" ON "brain"."execution_logs" USING "btree" ("session_id");



CREATE INDEX "idx_ai_feedback_is_read" ON "public"."ai_feedback" USING "btree" ("is_read");



CREATE INDEX "idx_ai_feedback_user_email" ON "public"."ai_feedback" USING "btree" ("user_email");



CREATE INDEX "idx_notices_created_at" ON "public"."notices" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_project_tasks_completed_at" ON "public"."project_tasks" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_project_tasks_overdue_flagged" ON "public"."project_tasks" USING "btree" ("overdue_flagged_at") WHERE ("overdue_flagged_at" IS NOT NULL);



CREATE INDEX "idx_project_tasks_project_id" ON "public"."project_tasks" USING "btree" ("project_id");



CREATE INDEX "idx_project_tasks_status" ON "public"."project_tasks" USING "btree" ("status");



CREATE INDEX "idx_task_history_action" ON "public"."task_history" USING "btree" ("action");



CREATE INDEX "idx_task_history_changed_at" ON "public"."task_history" USING "btree" ("changed_at");



CREATE INDEX "idx_task_history_project_id" ON "public"."task_history" USING "btree" ("project_id");



CREATE INDEX "idx_task_history_task_id" ON "public"."task_history" USING "btree" ("task_id");



CREATE INDEX "idx_task_snapshots_assignee" ON "public"."task_monthly_snapshots" USING "btree" ("assignee");



CREATE INDEX "idx_task_snapshots_company" ON "public"."task_monthly_snapshots" USING "btree" ("company_name");



CREATE INDEX "idx_task_snapshots_month" ON "public"."task_monthly_snapshots" USING "btree" ("snapshot_month");



CREATE UNIQUE INDEX "idx_task_snapshots_month_task" ON "public"."task_monthly_snapshots" USING "btree" ("snapshot_month", "task_id");



CREATE OR REPLACE TRIGGER "trg_brain_documents_auto_invalidate" BEFORE INSERT OR UPDATE ON "brain"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."brain_documents_auto_invalidate"();



CREATE OR REPLACE TRIGGER "t_brain_sync_landing_pages" AFTER INSERT OR DELETE OR UPDATE ON "public"."landing_pages" FOR EACH ROW EXECUTE FUNCTION "brain"."handle_project_change"();



CREATE OR REPLACE TRIGGER "t_brain_sync_lp_projects" AFTER INSERT OR DELETE OR UPDATE ON "public"."landing_page_projects" FOR EACH ROW EXECUTE FUNCTION "brain"."handle_project_change"();



CREATE OR REPLACE TRIGGER "t_brain_sync_traffic_campaigns" AFTER INSERT OR DELETE OR UPDATE ON "public"."traffic_campaigns" FOR EACH ROW EXECUTE FUNCTION "brain"."handle_project_change"();



CREATE OR REPLACE TRIGGER "t_brain_sync_traffic_projects" AFTER INSERT OR DELETE OR UPDATE ON "public"."traffic_projects" FOR EACH ROW EXECUTE FUNCTION "brain"."handle_project_change"();



CREATE OR REPLACE TRIGGER "t_brain_sync_website_projects" AFTER INSERT OR DELETE OR UPDATE ON "public"."website_projects" FOR EACH ROW EXECUTE FUNCTION "brain"."handle_project_change"();



CREATE OR REPLACE TRIGGER "t_brain_sync_websites" AFTER INSERT OR DELETE OR UPDATE ON "public"."websites" FOR EACH ROW EXECUTE FUNCTION "brain"."handle_project_change"();



CREATE OR REPLACE TRIGGER "trg_project_tasks_history" AFTER INSERT OR UPDATE ON "public"."project_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trg_task_history_fn"();



CREATE OR REPLACE TRIGGER "trg_project_tasks_timestamps" BEFORE INSERT OR UPDATE ON "public"."project_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trg_task_timestamps_fn"();



CREATE OR REPLACE TRIGGER "trigger_create_campaign_timeline" AFTER INSERT ON "public"."traffic_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."create_campaign_timeline"();



ALTER TABLE ONLY "brain"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "brain"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "brain"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acceptances"
    ADD CONSTRAINT "acceptances_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."access_logs"
    ADD CONSTRAINT "access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landing_page_projects"
    ADD CONSTRAINT "landing_page_projects_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."landing_pages"
    ADD CONSTRAINT "landing_pages_landing_page_project_id_fkey" FOREIGN KEY ("landing_page_project_id") REFERENCES "public"."landing_page_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_credentials"
    ADD CONSTRAINT "project_credentials_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_credentials"
    ADD CONSTRAINT "project_credentials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_history"
    ADD CONSTRAINT "task_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_history"
    ADD CONSTRAINT "task_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_monthly_snapshots"
    ADD CONSTRAINT "task_monthly_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_monthly_snapshots"
    ADD CONSTRAINT "task_monthly_snapshots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."traffic_campaign_timeline"
    ADD CONSTRAINT "traffic_campaign_timeline_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."traffic_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."traffic_campaign_timeline"
    ADD CONSTRAINT "traffic_campaign_timeline_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."app_users"("id");



ALTER TABLE ONLY "public"."traffic_campaigns"
    ADD CONSTRAINT "traffic_campaigns_traffic_project_id_fkey" FOREIGN KEY ("traffic_project_id") REFERENCES "public"."traffic_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."traffic_projects"
    ADD CONSTRAINT "traffic_projects_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."website_projects"
    ADD CONSTRAINT "website_projects_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "public"."acceptances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."websites"
    ADD CONSTRAINT "websites_website_project_id_fkey" FOREIGN KEY ("website_project_id") REFERENCES "public"."website_projects"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete their own sessions" ON "brain"."chat_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert messages into their sessions" ON "brain"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "brain"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own sessions" ON "brain"."chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own sessions" ON "brain"."chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view messages from their sessions" ON "brain"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "brain"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own sessions" ON "brain"."chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "brain"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "brain"."chat_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow public read access to contract templates" ON "public"."contract_templates" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert ai_feedback" ON "public"."ai_feedback" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert profiles" ON "public"."app_users" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can read acceptances" ON "public"."acceptances" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read access logs" ON "public"."access_logs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read notices" ON "public"."notices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read profiles" ON "public"."app_users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read proposals" ON "public"."proposals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users manage campaign timeline" ON "public"."traffic_campaign_timeline" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage landing page projects" ON "public"."landing_page_projects" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage landing pages" ON "public"."landing_pages" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage project tasks" ON "public"."project_tasks" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage task history" ON "public"."task_history" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage traffic campaigns" ON "public"."traffic_campaigns" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage traffic projects" ON "public"."traffic_projects" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage website projects" ON "public"."website_projects" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users manage websites" ON "public"."websites" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Clients can view their campaigns" ON "public"."traffic_campaigns" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("au"."role" = 'cliente'::"text")))) AND (EXISTS ( SELECT 1
   FROM ("public"."traffic_projects" "tp"
     JOIN "public"."acceptances" "a" ON (("tp"."acceptance_id" = "a"."id")))
  WHERE (("tp"."id" = "traffic_campaigns"."traffic_project_id") AND ("lower"("a"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "Clients can view their own traffic projects" ON "public"."traffic_projects" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("au"."role" = 'cliente'::"text")))) AND (EXISTS ( SELECT 1
   FROM "public"."acceptances" "a"
  WHERE (("a"."id" = "traffic_projects"."acceptance_id") AND ("lower"("a"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "Clients can view their timeline" ON "public"."traffic_campaign_timeline" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("au"."role" = 'cliente'::"text")))) AND (EXISTS ( SELECT 1
   FROM (("public"."traffic_campaigns" "tc"
     JOIN "public"."traffic_projects" "tp" ON (("tc"."traffic_project_id" = "tp"."id")))
     JOIN "public"."acceptances" "a" ON (("tp"."acceptance_id" = "a"."id")))
  WHERE (("tc"."id" = "traffic_campaign_timeline"."campaign_id") AND ("lower"("a"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "Enable insert for authenticated users only" ON "public"."traffic_projects" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."proposals" FOR SELECT USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."proposals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Gestor full access to task snapshots" ON "public"."task_monthly_snapshots" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("app_users"."role" = ANY (ARRAY['admin'::"text", 'gestor'::"text"]))))));



CREATE POLICY "Gestores can create notices" ON "public"."notices" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = "notices"."author_email") AND ("app_users"."role" = 'gestor'::"text")))));



CREATE POLICY "Gestores can delete notices" ON "public"."notices" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))) AND ("app_users"."role" = 'gestor'::"text")))));



CREATE POLICY "Gestores can delete users" ON "public"."app_users" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("au"."role" = ANY (ARRAY['gestor'::"text", 'admin'::"text"]))))));



CREATE POLICY "Permitir leitura para logados" ON "public"."proposals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can read acceptances" ON "public"."acceptances" FOR SELECT USING (true);



CREATE POLICY "Public can view profiles" ON "public"."app_users" FOR SELECT USING (true);



CREATE POLICY "Public proposals access" ON "public"."proposals" FOR SELECT USING (true);



CREATE POLICY "Public proposals access by slug" ON "public"."proposals" FOR SELECT USING (true);



CREATE POLICY "Public update survey via link" ON "public"."landing_page_projects" FOR UPDATE TO "anon" USING (("survey_status" IS DISTINCT FROM 'completed'::"text")) WITH CHECK (("survey_status" IS DISTINCT FROM 'completed'::"text"));



CREATE POLICY "Public update survey via link" ON "public"."traffic_projects" FOR UPDATE TO "anon" USING (("survey_status" IS DISTINCT FROM 'completed'::"text")) WITH CHECK (("survey_status" IS DISTINCT FROM 'completed'::"text"));



CREATE POLICY "Public update survey via link" ON "public"."website_projects" FOR UPDATE TO "anon" USING (("survey_status" IS DISTINCT FROM 'completed'::"text")) WITH CHECK (("survey_status" IS DISTINCT FROM 'completed'::"text"));



CREATE POLICY "Staff can delete acceptances" ON "public"."acceptances" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text"]));



CREATE POLICY "Staff can delete proposals" ON "public"."proposals" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text"]));



CREATE POLICY "Staff can insert acceptances" ON "public"."acceptances" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text", 'comercial'::"text"]));



CREATE POLICY "Staff can insert app_users" ON "public"."app_users" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "app_users_1"
  WHERE (("app_users_1"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("app_users_1"."role" = ANY (ARRAY['admin'::"text", 'gestor'::"text"]))))));



CREATE POLICY "Staff can insert proposals" ON "public"."proposals" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text", 'comercial'::"text"]));



CREATE POLICY "Staff can update acceptances" ON "public"."acceptances" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text", 'comercial'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text", 'comercial'::"text"]));



CREATE POLICY "Staff can update proposals" ON "public"."proposals" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text", 'comercial'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['gestor'::"text", 'admin'::"text", 'comercial'::"text"]));



CREATE POLICY "Staff full access" ON "public"."acceptances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("app_users"."role" = ANY (ARRAY['admin'::"text", 'gestor'::"text", 'operacional'::"text", 'comercial'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("app_users"."role" = ANY (ARRAY['admin'::"text", 'gestor'::"text", 'operacional'::"text", 'comercial'::"text"]))))));



CREATE POLICY "Staff full access" ON "public"."proposals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("app_users"."role" = ANY (ARRAY['admin'::"text", 'gestor'::"text", 'operacional'::"text", 'comercial'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("app_users"."role" = ANY (ARRAY['admin'::"text", 'gestor'::"text", 'operacional'::"text", 'comercial'::"text"]))))));



CREATE POLICY "Users can insert their own access logs" ON "public"."access_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."app_users" FOR UPDATE TO "authenticated" USING (("email" = ("auth"."jwt"() ->> 'email'::"text"))) WITH CHECK (("email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "Users can update their own feedback" ON "public"."ai_feedback" FOR UPDATE USING (("auth"."email"() = "user_email"));



CREATE POLICY "Users can view all profiles" ON "public"."app_users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view their own feedback" ON "public"."ai_feedback" FOR SELECT USING (("auth"."email"() = "user_email"));



ALTER TABLE "public"."acceptances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_can_manage_credentials" ON "public"."project_credentials" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."contract_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."landing_page_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."landing_pages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_monthly_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traffic_campaign_timeline" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traffic_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traffic_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."websites" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "brain" TO "authenticated";
GRANT USAGE ON SCHEMA "brain" TO "service_role";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."add_chat_message"("p_session_id" "uuid", "p_role" "text", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_chat_message"("p_session_id" "uuid", "p_role" "text", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_chat_message"("p_session_id" "uuid", "p_role" "text", "p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."brain_authority_rank"("p_authority_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."brain_authority_rank"("p_authority_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."brain_authority_rank"("p_authority_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."brain_documents_auto_invalidate"() TO "anon";
GRANT ALL ON FUNCTION "public"."brain_documents_auto_invalidate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."brain_documents_auto_invalidate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."c4_corporate_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."c4_corporate_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."c4_corporate_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_campaign_timeline"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_campaign_timeline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_campaign_timeline"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_chat_session"("title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_chat_session"("title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_chat_session"("title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_task_monthly_snapshot"("p_month" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_task_monthly_snapshot"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_task_monthly_snapshot"("p_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_chat_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_chat_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_create_traffic_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_title" "text", "p_description" "text", "p_due_date" "date", "p_priority" "text", "p_status" "text", "p_assignee" "text", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_create_traffic_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_title" "text", "p_description" "text", "p_due_date" "date", "p_priority" "text", "p_status" "text", "p_assignee" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_create_traffic_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_title" "text", "p_description" "text", "p_due_date" "date", "p_priority" "text", "p_status" "text", "p_assignee" "text", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_delete_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_delete_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_delete_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_move_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_status" "text", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_move_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_status" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_move_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_status" "text", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_update_project_status"("p_session_id" "text", "p_project_id" "uuid", "p_project_name" "text", "p_new_status" "text", "p_notes" "text", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_update_project_status"("p_session_id" "text", "p_project_id" "uuid", "p_project_name" "text", "p_new_status" "text", "p_notes" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_update_project_status"("p_session_id" "text", "p_project_id" "uuid", "p_project_name" "text", "p_new_status" "text", "p_notes" "text", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_update_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_title" "text", "p_new_description" "text", "p_new_due_date" "date", "p_new_priority" "text", "p_new_assignee" "text", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_update_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_title" "text", "p_new_description" "text", "p_new_due_date" "date", "p_new_priority" "text", "p_new_assignee" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_update_task"("p_session_id" "text", "p_project_id" bigint, "p_project_name" "text", "p_task_title" "text", "p_task_id" "uuid", "p_new_title" "text", "p_new_description" "text", "p_new_due_date" "date", "p_new_priority" "text", "p_new_assignee" "text", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."flag_overdue_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."flag_overdue_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."flag_overdue_tasks"() TO "service_role";






GRANT ALL ON FUNCTION "public"."get_pending_sync_items"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_sync_items"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_sync_items"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_project_credentials"("p_acceptance_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_project_credentials"("p_acceptance_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_project_credentials"("p_acceptance_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_explicit_user_facts"("p_user_id" "uuid", "p_session_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_explicit_user_facts"("p_user_id" "uuid", "p_session_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_explicit_user_facts"("p_user_id" "uuid", "p_session_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_history"("p_session_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_history"("p_session_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_history"("p_session_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_recent_history"("p_user_id" "uuid", "p_limit" integer, "p_exclude_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_recent_history"("p_user_id" "uuid", "p_limit" integer, "p_exclude_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_recent_history"("p_user_id" "uuid", "p_limit" integer, "p_exclude_session_id" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."invalidate_obsolete_brain_embeddings"("p_document_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invalidate_obsolete_brain_embeddings"("p_document_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invalidate_obsolete_brain_embeddings"("p_document_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_agent_execution"("p_session_id" "text", "p_agent_name" "text", "p_action" "text", "p_status" "text", "p_params" "jsonb", "p_result" "jsonb", "p_latency_ms" integer, "p_cost_est" numeric, "p_error_message" "text", "p_message_id" "text", "p_tokens_input" integer, "p_tokens_output" integer, "p_tokens_total" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."log_agent_execution"("p_session_id" "text", "p_agent_name" "text", "p_action" "text", "p_status" "text", "p_params" "jsonb", "p_result" "jsonb", "p_latency_ms" integer, "p_cost_est" numeric, "p_error_message" "text", "p_message_id" "text", "p_tokens_input" integer, "p_tokens_output" integer, "p_tokens_total" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_agent_execution"("p_session_id" "text", "p_agent_name" "text", "p_action" "text", "p_status" "text", "p_params" "jsonb", "p_result" "jsonb", "p_latency_ms" integer, "p_cost_est" numeric, "p_error_message" "text", "p_message_id" "text", "p_tokens_input" integer, "p_tokens_output" integer, "p_tokens_total" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_user_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_user_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_user_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."make_user_client"("target_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."make_user_client"("target_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."make_user_client"("target_email" "text") TO "service_role";









GRANT ALL ON FUNCTION "public"."parse_financial_numeric"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_financial_numeric"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_financial_numeric"("p_value" "text") TO "service_role";






GRANT ALL ON FUNCTION "public"."query_access_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."query_access_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_access_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."query_all_clients"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."query_all_clients"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_all_clients"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."query_all_projects"("p_service_type" "text", "p_status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."query_all_projects"("p_service_type" "text", "p_status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_all_projects"("p_service_type" "text", "p_status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."query_all_proposals"("p_status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."query_all_proposals"("p_status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_all_proposals"("p_status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."query_all_tasks"("p_project_id" bigint, "p_status" "text", "p_overdue" boolean, "p_reference_date" "date", "p_reference_tz" "text", "p_created_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."query_all_tasks"("p_project_id" bigint, "p_status" "text", "p_overdue" boolean, "p_reference_date" "date", "p_reference_tz" "text", "p_created_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_all_tasks"("p_project_id" bigint, "p_status" "text", "p_overdue" boolean, "p_reference_date" "date", "p_reference_tz" "text", "p_created_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."query_all_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."query_all_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_all_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."query_autonomy_suggestions"("p_project_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."query_autonomy_suggestions"("p_project_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_autonomy_suggestions"("p_project_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."query_financial_summary"("p_reference_date" "date", "p_status" "text", "p_company_name" "text", "p_reference_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."query_financial_summary"("p_reference_date" "date", "p_status" "text", "p_company_name" "text", "p_reference_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_financial_summary"("p_reference_date" "date", "p_status" "text", "p_company_name" "text", "p_reference_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."query_memory_slo"("p_days" integer, "p_target_recall_hit_rate" numeric, "p_max_critical_canary_failures" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."query_memory_slo"("p_days" integer, "p_target_recall_hit_rate" numeric, "p_max_critical_canary_failures" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_memory_slo"("p_days" integer, "p_target_recall_hit_rate" numeric, "p_max_critical_canary_failures" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."query_survey_responses"("p_client_name" "text", "p_project_type" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."query_survey_responses"("p_client_name" "text", "p_project_type" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_survey_responses"("p_client_name" "text", "p_project_type" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."query_task_telemetry"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."query_task_telemetry"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_task_telemetry"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."query_telemetry_summary"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."query_telemetry_summary"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_telemetry_summary"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."schedule_brain_sync_job"("p_url" "text", "p_service_role_key" "text", "p_job_name" "text", "p_schedule" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_brain_sync_job"("p_url" "text", "p_service_role_key" "text", "p_job_name" "text", "p_schedule" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_brain_sync_job"("p_url" "text", "p_service_role_key" "text", "p_job_name" "text", "p_schedule" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_proposal_acceptance"("p_name" "text", "p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_company_name" "text", "p_proposal_id" bigint, "p_contract_snapshot" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_proposal_acceptance"("p_name" "text", "p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_company_name" "text", "p_proposal_id" bigint, "p_contract_snapshot" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_proposal_acceptance"("p_name" "text", "p_email" "text", "p_cpf" "text", "p_cnpj" "text", "p_company_name" "text", "p_proposal_id" bigint, "p_contract_snapshot" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_task_history_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_task_history_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_task_history_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_task_timestamps_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_task_timestamps_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_task_timestamps_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."try_parse_timestamptz"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."try_parse_timestamptz"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_parse_timestamptz"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unschedule_brain_sync_job"("p_job_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unschedule_brain_sync_job"("p_job_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unschedule_brain_sync_job"("p_job_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_chat_session_title"("p_session_id" "uuid", "p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_chat_session_title"("p_session_id" "uuid", "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_chat_session_title"("p_session_id" "uuid", "p_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sync_item_status"("p_id" bigint, "p_status" "text", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_sync_item_status"("p_id" bigint, "p_status" "text", "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sync_item_status"("p_id" bigint, "p_status" "text", "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_project_credentials"("p_acceptance_id" bigint, "p_credentials" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_project_credentials"("p_acceptance_id" bigint, "p_credentials" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_project_credentials"("p_acceptance_id" bigint, "p_credentials" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("allowed_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("allowed_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("allowed_roles" "text"[]) TO "service_role";
























GRANT ALL ON TABLE "brain"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "brain"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "brain"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "brain"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "brain"."documents" TO "service_role";
GRANT SELECT ON TABLE "brain"."documents" TO "authenticated";



GRANT ALL ON TABLE "brain"."execution_logs" TO "service_role";
GRANT SELECT ON TABLE "brain"."execution_logs" TO "authenticated";


















GRANT ALL ON TABLE "public"."acceptances" TO "anon";
GRANT ALL ON TABLE "public"."acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."acceptances" TO "service_role";
GRANT INSERT ON TABLE "public"."acceptances" TO PUBLIC;



GRANT ALL ON SEQUENCE "public"."acceptances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."acceptances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."acceptances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."access_logs" TO "anon";
GRANT ALL ON TABLE "public"."access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_feedback" TO "anon";
GRANT ALL ON TABLE "public"."ai_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_feedback" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ai_feedback_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_feedback_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_feedback_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages_view" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages_view" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages_view" TO "service_role";



GRANT ALL ON TABLE "public"."chat_sessions_view" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions_view" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions_view" TO "service_role";



GRANT ALL ON TABLE "public"."contract_templates" TO "anon";
GRANT ALL ON TABLE "public"."contract_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_templates" TO "service_role";



GRANT ALL ON TABLE "public"."landing_page_projects" TO "anon";
GRANT ALL ON TABLE "public"."landing_page_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."landing_page_projects" TO "service_role";



GRANT ALL ON TABLE "public"."landing_pages" TO "anon";
GRANT ALL ON TABLE "public"."landing_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."landing_pages" TO "service_role";



GRANT ALL ON TABLE "public"."notices" TO "anon";
GRANT ALL ON TABLE "public"."notices" TO "authenticated";
GRANT ALL ON TABLE "public"."notices" TO "service_role";



GRANT ALL ON TABLE "public"."project_credentials" TO "anon";
GRANT ALL ON TABLE "public"."project_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."project_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."project_tasks" TO "anon";
GRANT ALL ON TABLE "public"."project_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."project_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."proposals" TO "anon";
GRANT ALL ON TABLE "public"."proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."proposals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proposals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proposals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proposals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."task_history" TO "anon";
GRANT ALL ON TABLE "public"."task_history" TO "authenticated";
GRANT ALL ON TABLE "public"."task_history" TO "service_role";



GRANT ALL ON TABLE "public"."task_monthly_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."task_monthly_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."task_monthly_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."traffic_campaign_timeline" TO "anon";
GRANT ALL ON TABLE "public"."traffic_campaign_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."traffic_campaign_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."traffic_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."traffic_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."traffic_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."traffic_projects" TO "anon";
GRANT ALL ON TABLE "public"."traffic_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."traffic_projects" TO "service_role";



GRANT ALL ON TABLE "public"."website_projects" TO "anon";
GRANT ALL ON TABLE "public"."website_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."website_projects" TO "service_role";



GRANT ALL ON TABLE "public"."websites" TO "anon";
GRANT ALL ON TABLE "public"."websites" TO "authenticated";
GRANT ALL ON TABLE "public"."websites" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































