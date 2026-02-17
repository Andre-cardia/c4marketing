-- Seed Beiramar Project Data
-- The AI is blind to this project because it hasn't been indexed yet.
-- Using data from the user's screenshot.

insert into brain.documents (id, content, metadata)
values (
  gen_random_uuid(),
  '[PROJETO WEB] Novo Site Institucional - Shopping Beiramar.
   Status Atual: Em Fase de Ajustes.
   Progresso: 
   - [x] Pesquisa Inicial
   - [x] Configuração
   - [x] Reunião de Briefing
   - [x] Recebimento de Conteúdos
   - [x] Design e Template
   - [x] Aprovação
   - [>] Ajustes (FASE ATUAL)
   - [ ] Entrega
   Data Prevista: 17/02/2026.
   Responsável: Equipe de Web.',
  jsonb_build_object(
    'type', 'official_doc',
    'artifact_kind', 'project',
    'title', 'Projeto Site Beiramar',
    'status', 'active',
    'source_table', 'website_projects',
    'tenant_id', (select id from auth.users limit 1)
  )
);
