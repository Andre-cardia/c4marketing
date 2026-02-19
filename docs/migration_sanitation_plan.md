# Plano de Saneamento de Migrations (Supabase)

Data: 2026-02-19
Projeto: `xffdrdoaysxfkpebhywl`

## Objetivo
Corrigir o histórico de migrations para eliminar conflito de versões duplicadas (ex.: `20240201`) e voltar a usar `supabase db push` de forma previsível em produção.

## Diagnóstico
- O diretório `supabase/migrations` possui múltiplos arquivos com o mesmo prefixo de versão.
- O Supabase usa `version` como chave única em `supabase_migrations.schema_migrations`.
- Resultado: falha com `duplicate key value violates unique constraint "schema_migrations_pkey"`.

## Estratégia Recomendada (Rebaseline)
Em vez de renomear dezenas de migrations antigas, criar um baseline único e mover o legado para arquivo morto.

## Fase 0 - Estabilização imediata
1. Congelar `db push` no branch principal até concluir o saneamento.
2. Aplicar mudanças urgentes via SQL Editor (quando necessário) + `migration repair`.
3. Manter deploy das Edge Functions normalmente.

## Fase 1 - Backup e inventário
1. Backup completo do banco remoto:
```powershell
npx supabase db dump --linked --file backup_pre_saneamento.sql --workdir .
```
2. Inventário do estado atual:
```powershell
npx supabase migration list --linked --workdir .
```
3. Abrir PR só para saneamento (sem outras features).

## Fase 2 - Isolar legado
1. Criar pasta de legado:
```powershell
New-Item -ItemType Directory -Path supabase/migrations_legacy -Force
```
2. Mover migrations antigas para legado (manter no Git para auditoria):
- Mover tudo de `supabase/migrations` para `supabase/migrations_legacy`.
- Deixar em `supabase/migrations` apenas:
  - um novo baseline (próxima fase)
  - migrations novas pós-baseline.

## Fase 3 - Criar baseline único
1. Gerar baseline a partir do estado atual remoto:
```powershell
npx supabase db pull --linked --workdir .
```
2. Renomear o arquivo gerado para um versionamento único (14 dígitos), por exemplo:
`20260219150000_baseline_remote_schema.sql`
3. Confirmar que `supabase/migrations` não contém versões duplicadas:
```powershell
Get-ChildItem supabase/migrations -File | ForEach-Object {
  if ($_.BaseName -match '^([0-9]+)_') { $matches[1] }
} | Group-Object | Where-Object { $_.Count -gt 1 }
```

## Fase 4 - Alinhar histórico remoto sem reexecutar baseline
O baseline representa estado já existente no banco de produção, então marque como `applied` sem executar:
```powershell
npx supabase migration repair --linked --status applied 20260219150000 --workdir .
```

## Fase 5 - Reintroduzir migrations novas
1. Manter as migrations funcionais novas após o baseline, por exemplo:
- `20260219130000_fix_memory_history_and_match_status.sql`
2. Se essa migration já foi aplicada manualmente no SQL Editor, marcar também como `applied`:
```powershell
npx supabase migration repair --linked --status applied 20260219130000 --workdir .
```
3. Rodar dry-run:
```powershell
npx supabase db push --dry-run --workdir .
```
4. Se dry-run limpo, executar:
```powershell
npx supabase db push --workdir .
```

## Fase 6 - Governança para evitar regressão
1. Regra obrigatória: versão sempre com timestamp de 14 dígitos (`YYYYMMDDHHMMSS`).
2. Criar migrations apenas via CLI:
```powershell
npx supabase migration new nome_da_migration --workdir .
```
3. CI check para bloquear duplicidade de versão.
4. Proibir edição retroativa de migrations já publicadas.

## Checklist de aceite
- `supabase migration list --linked` sem divergência crítica.
- `supabase db push --dry-run` sem erro.
- `supabase db push` executando sem `schema_migrations_pkey`.
- Nova migration criada e aplicada com sucesso no fluxo normal.

## Rollback
- Restaurar backup:
```powershell
npx supabase db reset --linked --workdir .
```
- Reaplicar dump conforme procedimento operacional interno.

