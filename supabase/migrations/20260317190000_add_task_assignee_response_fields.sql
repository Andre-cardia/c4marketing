ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS assignee_response text,
  ADD COLUMN IF NOT EXISTS assignee_response_attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assignee_response_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignee_response_updated_by text;

UPDATE public.project_tasks
SET assignee_response_attachments = '[]'::jsonb
WHERE assignee_response_attachments IS NULL;

COMMENT ON COLUMN public.project_tasks.assignee_response IS
'Resposta do responsável para atualizar o criador da tarefa.';

COMMENT ON COLUMN public.project_tasks.assignee_response_attachments IS
'Arquivos anexados pelo responsável na atualização da tarefa.';

COMMENT ON COLUMN public.project_tasks.assignee_response_updated_at IS
'Data e hora da última atualização enviada pelo responsável.';

COMMENT ON COLUMN public.project_tasks.assignee_response_updated_by IS
'Nome de quem enviou a última atualização do responsável.';
