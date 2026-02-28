-- Adicionar coluna created_by para rastrear o autor da tarefa
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS created_by text;
-- Preencher tarefas existentes com valor padrão
UPDATE project_tasks SET created_by = 'Sistema' WHERE created_by IS NULL;
-- Comentário explicativo
COMMENT ON COLUMN project_tasks.created_by IS 'Nome do autor que criou a tarefa. Usado para controle de permissão de edição do prazo.';
