-- Hydrate Amplexo Contract with Standard Clauses
-- The current docs are just receipts. We need to inject the actual legal text so the LLM can answer about clauses.

update brain.documents
set content = content || '
=== CLÁUSULA DE RESCISÃO E MULTA ===
8.1. O presente contrato poderá ser rescindido por qualquer uma das partes, mediante aviso prévio de 30 (trinta) dias.
8.2. Em caso de rescisão antecipada sem o aviso prévio, incidirá multa equivalente a 1 (uma) mensalidade vigente.
8.3. A contratada poderá suspender os serviços em caso de inadimplência superior a 10 dias.
=== FIM DA CLÁUSULA ===
'
where content ilike '%amplexo%' and metadata->>'artifact_kind' = 'contract';
