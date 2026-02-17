-- Seed Data for Test B (Project Status)
-- We need a specific project document to verify the 'Agent_Projects' router.

insert into brain.documents (id, content, metadata)
values (
  gen_random_uuid(),
  '[PROJETO] Website Institucional da C4 Marketing.
   Status: Em Desenvolvimento (Fase 2 de 5).
   Entregas Concluídas: Wireframes, Identidade Visual.
   Próxima Entrega: Desenvolvimento do Frontend (Previsto: 20/03/2026).
   Responsável: Equipe de Design e Dev.
   Riscos: Baixo.',
  jsonb_build_object(
    'type', 'official_doc',
    'artifact_kind', 'project',
    'title', 'Projeto Website C4',
    'status', 'active',
    'source_table', 'projects',
    'tenant_id', (select id from auth.users limit 1) -- Assign to a valid user/tenant
  )
);
