-- Create Chat Sessions table in Brain schema
CREATE TABLE IF NOT EXISTS brain.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Nova Conversa',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Chat Messages table in Brain schema
CREATE TABLE IF NOT EXISTS brain.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES brain.chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies for Sessions
ALTER TABLE brain.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
    ON brain.chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
    ON brain.chat_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
    ON brain.chat_sessions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
    ON brain.chat_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for Messages
ALTER TABLE brain.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages from their sessions"
    ON brain.chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM brain.chat_sessions
            WHERE brain.chat_sessions.id = brain.chat_messages.session_id
            AND brain.chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages into their sessions"
    ON brain.chat_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM brain.chat_sessions
            WHERE brain.chat_sessions.id = brain.chat_messages.session_id
            AND brain.chat_sessions.user_id = auth.uid()
        )
    );

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA brain TO authenticated;
GRANT ALL ON TABLE brain.chat_sessions TO authenticated;
GRANT ALL ON TABLE brain.chat_messages TO authenticated;

-- Expose tables to PostgREST (by granting on the schema/tables, they become visible if schema is in search_path or exposed)
-- NOTE: 'brain' schema is usually NOT exposed in API settings by default. 
-- If we want to access these via `supabase-js`, we might need to expose the schema OR create public wrappers.
-- Given the restrictions we faced before, creating PUBLIC wrappers (Views/Functions) might be safer/easier than exposing the whole schema if settings are locked.
-- HOWEVER, for a full CRUD UI, direct table access is better.
-- Let's try to Grant permissions and rely on the Service Key OR assume the user can add 'brain' to exposed schemas.
-- OPTION B: Create public views that proxy to these tables. This is safer and robust against "Schema not exposed" errors.

-- Public Views for Chat Sessions
CREATE OR REPLACE VIEW public.chat_sessions_view AS
    SELECT * FROM brain.chat_sessions;

-- Public Views for Chat Messages
CREATE OR REPLACE VIEW public.chat_messages_view AS
    SELECT * FROM brain.chat_messages;

-- Make views updatable (or use triggers, but simple views often work for simple 1:1 if configured, but PostgreSQL views are read-only by default unless simple).
-- Better approach: wrapper functions for creation, and views for reading.

GRANT SELECT ON public.chat_sessions_view TO authenticated;
GRANT SELECT ON public.chat_messages_view TO authenticated;

-- Public Function to create a session
CREATE OR REPLACE FUNCTION public.create_chat_session(title text)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.create_chat_session TO authenticated;

-- Public Function to add a message
CREATE OR REPLACE FUNCTION public.add_chat_message(p_session_id UUID, p_role TEXT, p_content TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.add_chat_message TO authenticated;
