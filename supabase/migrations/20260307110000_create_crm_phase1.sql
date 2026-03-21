BEGIN;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.app_users
  WHERE email = auth.jwt() ->> 'email'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_role() TO service_role;

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key IN (
    'new_lead',
    'contacted',
    'meeting_scheduled',
    'proposal_sent',
    'proposal_won',
    'proposal_lost'
  )),
  name TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  whatsapp_normalized TEXT,
  email TEXT,
  email_normalized TEXT,
  address TEXT,
  notes TEXT,
  owner_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  last_interaction_at TIMESTAMPTZ,
  source TEXT CHECK (
    source IS NULL OR source IN (
      'indicacao',
      'trafego_pago',
      'organico',
      'prospeccao',
      'site',
      'evento',
      'outro'
    )
  ),
  lead_temperature TEXT CHECK (
    lead_temperature IS NULL OR lead_temperature IN ('frio', 'morno', 'quente')
  ),
  estimated_value NUMERIC(12, 2),
  loss_reason TEXT,
  proposal_id BIGINT REFERENCES public.proposals(id) ON DELETE SET NULL,
  acceptance_id BIGINT REFERENCES public.acceptances(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  moved_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE TABLE IF NOT EXISTS public.crm_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'note',
    'call',
    'email',
    'whatsapp_in',
    'whatsapp_out',
    'meeting',
    'system'
  )),
  summary TEXT NOT NULL,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_position
  ON public.crm_pipeline_stages(position);

CREATE INDEX IF NOT EXISTS idx_crm_leads_stage_id
  ON public.crm_leads(stage_id);

CREATE INDEX IF NOT EXISTS idx_crm_leads_owner_user_id
  ON public.crm_leads(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_crm_leads_opened_at
  ON public.crm_leads(opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_leads_closed_at
  ON public.crm_leads(closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_leads_last_interaction_at
  ON public.crm_leads(last_interaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_leads_whatsapp_normalized
  ON public.crm_leads(whatsapp_normalized);

CREATE INDEX IF NOT EXISTS idx_crm_leads_email_normalized
  ON public.crm_leads(email_normalized);

CREATE INDEX IF NOT EXISTS idx_crm_leads_proposal_id
  ON public.crm_leads(proposal_id);

CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at
  ON public.crm_leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_lead_stage_history_lead_id
  ON public.crm_lead_stage_history(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_lead_stage_history_moved_at
  ON public.crm_lead_stage_history(moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_lead_id
  ON public.crm_lead_activities(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_created_at
  ON public.crm_lead_activities(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_followups_lead_id
  ON public.crm_followups(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_followups_owner_due
  ON public.crm_followups(owner_user_id, due_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_followups_status
  ON public.crm_followups(status);

INSERT INTO public.crm_pipeline_stages (key, name, position, is_closed)
VALUES
  ('new_lead', 'Novo Lead', 1, FALSE),
  ('contacted', 'Contato Realizado', 2, FALSE),
  ('meeting_scheduled', 'Reunião Agendada', 3, FALSE),
  ('proposal_sent', 'Proposta Enviada', 4, FALSE),
  ('proposal_won', 'Proposta Aceita', 5, TRUE),
  ('proposal_lost', 'Proposta Perdida', 6, TRUE)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  position = EXCLUDED.position,
  is_closed = EXCLUDED.is_closed;

CREATE OR REPLACE FUNCTION public.crm_prepare_lead_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage public.crm_pipeline_stages%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at = COALESCE(NEW.created_at, now());
    NEW.opened_at = COALESCE(NEW.opened_at, NEW.created_at, now());
  END IF;

  NEW.updated_at = now();
  NEW.email_normalized = NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.whatsapp_normalized = NULLIF(regexp_replace(COALESCE(NEW.whatsapp, ''), '\D', '', 'g'), '');

  SELECT *
  INTO v_stage
  FROM public.crm_pipeline_stages
  WHERE id = NEW.stage_id;

  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'Estágio do CRM inválido.';
  END IF;

  IF v_stage.key = 'proposal_lost' AND COALESCE(btrim(NEW.loss_reason), '') = '' THEN
    RAISE EXCEPTION 'Motivo de perda é obrigatório ao mover para Proposta Perdida.';
  END IF;

  IF v_stage.is_closed THEN
    NEW.closed_at = COALESCE(NEW.closed_at, now());
  ELSE
    NEW.closed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_log_stage_history_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_lead_stage_history (
      lead_id,
      from_stage_id,
      to_stage_id,
      moved_by,
      note
    ) VALUES (
      NEW.id,
      NULL,
      NEW.stage_id,
      COALESCE(NEW.updated_by, NEW.created_by),
      'Lead criado'
    );
  ELSIF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO public.crm_lead_stage_history (
      lead_id,
      from_stage_id,
      to_stage_id,
      moved_by,
      note
    ) VALUES (
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      NEW.updated_by,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_touch_last_interaction_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_leads
  SET
    last_interaction_at = COALESCE(NEW.created_at, now()),
    updated_at = now()
  WHERE id = NEW.lead_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_prepare_lead_write ON public.crm_leads;
CREATE TRIGGER trg_crm_prepare_lead_write
  BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_prepare_lead_write();

DROP TRIGGER IF EXISTS trg_crm_log_stage_history ON public.crm_leads;
CREATE TRIGGER trg_crm_log_stage_history
  AFTER INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_log_stage_history_fn();

DROP TRIGGER IF EXISTS trg_crm_touch_last_interaction ON public.crm_lead_activities;
CREATE TRIGGER trg_crm_touch_last_interaction
  AFTER INSERT ON public.crm_lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_touch_last_interaction_fn();

ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM stages read" ON public.crm_pipeline_stages;
DROP POLICY IF EXISTS "CRM stages manage" ON public.crm_pipeline_stages;
CREATE POLICY "CRM stages read" ON public.crm_pipeline_stages
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM stages manage" ON public.crm_pipeline_stages
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "CRM leads read" ON public.crm_leads;
DROP POLICY IF EXISTS "CRM leads manage" ON public.crm_leads;
CREATE POLICY "CRM leads read" ON public.crm_leads
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM leads manage" ON public.crm_leads
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

DROP POLICY IF EXISTS "CRM stage history read" ON public.crm_lead_stage_history;
CREATE POLICY "CRM stage history read" ON public.crm_lead_stage_history
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

DROP POLICY IF EXISTS "CRM activities read" ON public.crm_lead_activities;
DROP POLICY IF EXISTS "CRM activities manage" ON public.crm_lead_activities;
CREATE POLICY "CRM activities read" ON public.crm_lead_activities
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM activities manage" ON public.crm_lead_activities
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

DROP POLICY IF EXISTS "CRM followups read" ON public.crm_followups;
DROP POLICY IF EXISTS "CRM followups manage" ON public.crm_followups;
CREATE POLICY "CRM followups read" ON public.crm_followups
  FOR SELECT TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial', 'leitor'));

CREATE POLICY "CRM followups manage" ON public.crm_followups
  FOR ALL TO authenticated
  USING (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'))
  WITH CHECK (public.current_app_user_role() IN ('admin', 'gestor', 'comercial'));

COMMIT;
