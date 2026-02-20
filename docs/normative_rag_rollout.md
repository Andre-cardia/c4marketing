# Rollout Seguro: Governança Normativa no RAG

Data: 2026-02-19  
Projeto: `xffdrdoaysxfkpebhywl`

## Objetivo
Ativar versionamento normativo, documento vigente, hierarquia de autoridade e invalidação automática sem interromper a operação.

## O que já está implementado
1. Migration aplicada: `20260219195000_normative_rag_governance.sql`
2. Migration aplicada: `20260219201000_auto_invalidate_obsolete_embeddings_trigger.sql`
3. `chat-brain` com modo normativo por feature flag e fallback para fluxo legado.
4. `brain-sync` e `embed-content` com publicação versionada + fallback para `insert_brain_document`.

## Feature flags
1. `BRAIN_NORMATIVE_GOVERNANCE_ENABLED`
- `false` (default por ausência): mantém comportamento legado.
- `true`: ativa retrieval `NORMATIVE_FIRST` no `chat-brain` para consultas documentais, com fallback automático para `STRICT_DOCS_ONLY` se vier vazio.

2. `BRAIN_VERSIONED_PUBLISH_ENABLED`
- `false` (default por ausência): `embed-content` usa `insert_brain_document`.
- `true`: `embed-content` tenta `publish_brain_document_version` e cai para `insert_brain_document` se a RPC não existir.

## Sequência recomendada (sem downtime)
1. Estado atual (seguro): manter flags ausentes/`false`.
2. Canário de retrieval normativo:
```powershell
npx supabase secrets set BRAIN_NORMATIVE_GOVERNANCE_ENABLED=true --workdir .
```
3. Validar perguntas normativas reais:
- "qual é a política vigente de X?"
- "há versão mais recente desse procedimento?"
- "em caso de conflito entre memo e policy, qual prevalece?"
4. Se estável, ativar publicação versionada no ingest:
```powershell
npx supabase secrets set BRAIN_VERSIONED_PUBLISH_ENABLED=true --workdir .
```
5. Executar um ciclo de sincronização (`brain-sync`) e validar:
- novos documentos com `document_key`, `version`, `is_current`, `authority_type`, `authority_rank`;
- versões antigas marcadas como `superseded` e `searchable=false`.

## Script de checklist (1 comando)
Use o script de validação ponta a ponta:

```powershell
node scripts/check_brain_canary.js
```

O script valida:
1. Integração do `chat-brain` e flag normativa ativa.
2. Execução multi-RPC em pergunta composta.
3. Salvamento de memória explícita.
4. Recuperação imediata de memória (best effort).
5. Resposta de hierarquia normativa (best effort).

Observação:
- Para limpeza automática do marcador canário, exporte `SUPABASE_SERVICE_ROLE_KEY` no ambiente local antes de executar o script.

## Rollback rápido
```powershell
npx supabase secrets set BRAIN_NORMATIVE_GOVERNANCE_ENABLED=false --workdir .
npx supabase secrets set BRAIN_VERSIONED_PUBLISH_ENABLED=false --workdir .
```

## Consultas de verificação (SQL)
1. Vigência e versão por chave:
```sql
select
  metadata->>'document_key' as document_key,
  metadata->>'version' as version,
  metadata->>'status' as status,
  metadata->>'is_current' as is_current,
  metadata->>'authority_type' as authority_type,
  metadata->>'authority_rank' as authority_rank,
  metadata->>'searchable' as searchable,
  created_at
from brain.documents
where metadata->>'document_key' is not null
order by metadata->>'document_key', created_at desc;
```

2. Obsoletos ainda pesquisáveis (deve tender a zero):
```sql
select count(*) as obsolete_searchable
from brain.documents
where coalesce(nullif(lower(metadata->>'status'), ''), 'active') in ('superseded','revoked','archived')
  and coalesce(nullif(lower(metadata->>'searchable'), ''), 'true') = 'true';
```
