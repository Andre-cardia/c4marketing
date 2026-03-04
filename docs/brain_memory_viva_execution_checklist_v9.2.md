# Checklist Executavel - Memoria Cognitiva Viva (v9.2)

**Projeto:** Segundo Cerebro C4 Marketing  
**Base:** `docs/brain_memory_viva_go_live_matrix_v9.2.md`  
**Data de referencia:** 2026-03-01  
**Objetivo:** fechar gaps P0/P1/P2 para evoluir de "aprovado condicional" para "memoria viva total".

## 0) Pre-check (obrigatorio)

- [ ] Confirmar janela de mudanca aprovada para banco remoto.
- [ ] Garantir credenciais locais:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (para limpeza de canario e operacoes seguras)
- [ ] Confirmar Supabase CLI funcional:

```bash
npx -y supabase --version
```

---

## P0 (imediato) - fechar itens 6, 7 e 8 da matriz

### P0.1 Backup + inventario de migrations

- [x] Gerar backup remoto antes de qualquer aplicacao:

```bash
npx -y supabase db dump --linked --file "supabase/backups/backup_pre_saneamento_$(date +%Y%m%d_%H%M%S).sql" --workdir .
```

- [x] Listar estado atual de migrations remotas:

```bash
npx -y supabase migration list --linked --workdir .
```

- [x] Validar duplicidade local de versao (14 digitos):

```bash
ls supabase/migrations/*.sql | sed -E 's|.*/([0-9]{14})_.*|\1|' | sort | uniq -d
```

Evidencia atual (2026-03-02):
- Backup remoto gerado com sucesso:
  - `supabase/backups/backup_pre_saneamento_20260302_185224.sql` (~168 KB).
- Inventario remoto executado com `supabase migration list --linked --workdir .`.
  - Resultado: sem divergencia local/remoto para as migrations listadas (incluindo `20260302193000` e `20260302194500`).
- Checagem de duplicidade local executada com:
  - `ls supabase/migrations/*.sql | sed -E 's|.*/([0-9]{14})_.*|\\1|' | sort | uniq -d`
  - Resultado: sem duplicidades (saida vazia).
- Backups gerenciados no projeto (API Supabase) tambem confirmados:
  - ultimo backup fisico `COMPLETED` em `2026-03-02T03:12:30.874Z`.

**Criterio de aceite:** backup gerado em `supabase/backups/` e sem surpresa critica no inventario.

### P0.2 Saneamento de mismatch remoto/local

Seguir o runbook em `docs/migration_sanitation_plan.md`.

- [x] Rodar dry-run inicial:

```bash
npx -y supabase db push --linked --dry-run --workdir .
```

- [x] Se houver mismatch estrutural, executar rebaseline (N/A: dry-run limpo, sem mismatch):

```bash
npx -y supabase db pull --linked --workdir .
```

- [x] Marcar baseline como aplicado (N/A: sem baseline novo nesta etapa):

```bash
npx -y supabase migration repair --linked --status applied <BASELINE_14_DIGITOS> --workdir .
```

- [x] Revalidar dry-run (N/A: dry-run inicial ja retornou limpo):

```bash
npx -y supabase db push --linked --dry-run --workdir .
```

Evidencia atual (2026-03-02):
- `npx -y supabase db push --linked --dry-run --workdir .`
- Resultado: `Remote database is up to date.`
- Sem erro `schema_migrations_pkey`.

**Criterio de aceite:** dry-run limpo, sem erro `schema_migrations_pkey`.

### P0.3 Aplicar migrations criticas de memoria/cron

Migrations alvo:
- `supabase/migrations/20260227193000_add_brain_sync_cron_management.sql`
- `supabase/migrations/20260228111500_add_recent_explicit_user_facts_rpc.sql`

- [x] Aplicar pendencias no ambiente-alvo:

```bash
npx -y supabase db push --linked --workdir .
```

Evidencia atual (2026-03-02):
- `npx -y supabase db push --linked --workdir .`
- Resultado: `Remote database is up to date.` (migrations criticas ja presentes no alvo).

**Criterio de aceite:** `db push` concluido sem falha.

### P0.4 Validar RPC deterministica de fatos recentes (item 6)

- [x] Confirmar funcao criada (validacao funcional via RPC):

```sql
select n.nspname as schema, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_recent_explicit_user_facts';
```

- [x] Executar chamada de smoke test:

```sql
select * 
from public.get_recent_explicit_user_facts('<USER_UUID>'::uuid, null, 6);
```

Evidencia atual (2026-03-02):
- RPC executada com service role:
  - `get_recent_explicit_user_facts(p_user_id='321f03b7-4b78-41f5-8133-6967d6aea169', p_limit=6)`
  - Resultado: `rpc_ok=1`, `rows=6`, sem erro.

**Criterio de aceite:** funcao listada e retorno sem erro.

### P0.5 Validar gestao segura de cron por ambiente (item 8)

- [x] Confirmar funcoes de schedule/unschedule (validacao funcional via RPC):

```sql
select n.nspname as schema, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('schedule_brain_sync_job', 'unschedule_brain_sync_job');
```

- [x] Criar/agendar job usando parametros (sem hardcode em migration):

```sql
select public.schedule_brain_sync_job(
  'https://<PROJECT_REF>.supabase.co/functions/v1/brain-sync',
  '<SERVICE_ROLE_KEY>',
  'invoke-brain-sync-every-5min',
  '*/5 * * * *'
);
```

- [x] Validar job:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'invoke-brain-sync-every-5min';
```

Evidencia atual (2026-03-03):
- `schedule_brain_sync_job` executada com sucesso:
  - retorno: `invoke-brain-sync-every-5min`.
- URL e chave passadas por parametro (sem hardcode em migration).
- Validacao manual no SQL Editor:
  - `jobid=8`
  - `jobname=invoke-brain-sync-every-5min`
  - `schedule=*/5 * * * *`
  - `active=true`

**Criterio de aceite:** job ativo, sem segredo hardcoded em arquivo SQL.

### P0.6 Revalidacao canario completo (pos-migration)

- [x] Executar canario:

```bash
node scripts/check_brain_canary.js
```

- [x] Registrar evidencia no PR ou changelog com:
  - `Falhas criticas: 0`
  - `Recuperacao Imediata da Memoria: [PASS]`
  - `Pergunta Composta (multi-RPC): [PASS]`

Evidencia atual (2026-03-02):
- `node scripts/check_brain_canary.js`
- Resultado:
  - `Falhas criticas: 0`
  - `Recuperacao Imediata da Memoria: [PASS]`
  - `Pergunta Composta (multi-RPC): [PASS]`
  - Session ID: `6fc3c73c-4703-4604-a929-f8cfc76c77cb`

**Criterio de aceite:** canario verde e sem regressao de recall imediato.

---

## P1 (curto prazo) - confiabilidade operacional

### P1.1 Suite de memoria de longo prazo (T+1/T+7/T+30)

- [x] Criar suite automatizada dedicada (`scripts/check_brain_memory_long_horizon.js`).
- [x] Cobrir 3 cenarios minimos:
  - salvar fato explicito em T0;
  - validar recall em T+1, T+7 e T+30;
  - validar metadados (`memory_recall_scope/source/candidates`).
- [x] Rodar diariamente em CI (ou job agendado externo).

Evidencia atual (2026-03-03):
- Comando: `npm run check:brain:memory-long`
- Resultado baseline inicial: `PASS=0`, `PENDING=3`, `FAIL=0`
- Observacao operacional:
  - Foi corrigida a prioridade de recall para favorecer `explicit_fact_store` quando houver fatos explícitos disponíveis.
  - A suite foi ajustada para nao reseedar em loop quando houver marcador de outro horizonte.
- Execucao diaria validada (2026-03-03 UTC, pos-ajuste):
  - `PASS=1`, `PENDING=2`, `FAIL=0`
  - `Due windows evaluated now: 1`
  - T+1: `PASS` (idade 1d), `memory_recall_source=explicit_fact_store`, marcador canônico `LH::T+1`
  - T+7/T+30: `PENDING` (ainda nao due), com marcador canônico e fonte `explicit_fact_store`
  - relatorio LH: `docs/brain_memory_long_horizon_report_20260303_205612.md`
- Snapshot de estabilidade diaria (2026-03-03 UTC):
  - canario: `5/5` e `falhas criticas=0`
  - SLO (24h): `overall=ok`, `recall_hit_rate=100%`, `critical_failures=0`
  - observabilidade de canario para SLO: `slo_tracked=true` (canarios manuais de depuracao nao poluem a janela oficial)
  - streak de estabilidade (canario + long-horizon): `1/14`
  - relatorio: `docs/brain_memory_stability_streak_report_20260303_205620.md`
- CI diario configurado:
  - workflow: `.github/workflows/brain-memory-long-horizon-daily.yml` (`Brain Memory Daily Stability`)
  - gatilhos: `schedule` diario (`0 9 * * *`, 06:00 BRT) + `workflow_dispatch`
  - rotinas diarias: canario + long-horizon + SLO + streak de estabilidade
  - secrets exigidos no repositorio: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Janelas due esperadas:
  - T+1 em 2026-03-03
  - T+7 em 2026-03-09
  - T+30 em 2026-04-01

**Criterio de aceite:** 14 dias consecutivos sem falha nos cenarios T+1/T+7/T+30.

### P1.2 SLO e alertas de memoria

- [x] Definir SLO formal (minimo):
  - `recall_hit_rate >= 95%` (24h)
  - `critical_canary_failures = 0`
- [x] Instrumentar painel/alerta para queda de consistencia.
- [x] Definir rota de escalacao (quem recebe, em quanto tempo responde).

Evidencia atual (2026-03-03):
- RPC criada: `public.query_memory_slo(p_days, p_target_recall_hit_rate, p_max_critical_canary_failures)`
- Ajuste de governanca aplicado: `supabase/migrations/20260303211000_filter_slo_to_tracked_canary_runs.sql`
  - `query_memory_slo` passou a contar apenas canarios com `params.slo_tracked=true`.
- Painel: `pages/BrainTelemetry.tsx` agora consulta `query_memory_slo` e exibe bloco de status com badge `OK/ALERT/NO_DATA`.
- Canary: `scripts/check_brain_canary.js` registra execucao em `brain.execution_logs` com
  - `agent_name=Canary_BrainMemory`
  - `action=memory_canary`
  - `status=success|error`
  - `params.critical_failed`
  - `params.slo_tracked` (controle de canario oficial vs depuracao)
- Snapshot atual do SLO (24h):
  - `overall=ok`
  - `recall_hit_rate=100%`
  - `critical_canary_failures=0`
  - `runs=1` (canario oficial tracked)
- Escalacao operacional:
  - `ALERT` por recall abaixo da meta ou canario critico > 0.
  - resposta inicial em ate 15 min (gestao tecnica).
  - mitigacao/rollback em ate 60 min quando houver impacto no recall.

**Criterio de aceite:** alerta dispara em queda real e evidencia fica registrada.

### P1.3 Runbook de incidente de memoria

- [x] Publicar runbook operacional (`docs/runbook_memory_incidents.md`) contendo:
  - triagem inicial;
  - comandos de diagnostico;
  - rollback de migration;
  - validacao de recuperacao;
  - comunicacao de incidente.
- [x] Realizar simulacao de incidente com o time.

Evidencia atual (2026-03-02):
- Runbook publicado: `docs/runbook_memory_incidents.md`
- Escopo coberto: triagem, diagnostico, mitigacao/rollback, validacao e comunicacao.
- Simulacao executada e registrada: `docs/memory_incident_simulation_2026-03-02.md`
  - canario: `5/5` (falhas criticas `0`)
  - SLO: `overall=ok`, `recall_hit_rate=100%`, `critical_failures=0`

**Criterio de aceite:** runbook aprovado e usado em simulacao.

---

## P2 (maturidade) - escala e governanca

### P2.1 Carga e concorrencia

- [x] Criar teste de carga de recall com 20/50/100 sessoes simultaneas.
- [x] Medir taxa de sucesso, latencia e consistencia de resposta.
- [x] Definir limite operacional e gatilho de escala.

Evidencia atual (2026-03-03):
- Script criado: `scripts/check_brain_memory_load.js`
- Comando: `npm run check:brain:memory-load`
- Relatorio mais recente: `docs/brain_memory_load_report_20260303_204347.md`
- Resultado por patamar:
  - 20 sessoes: `PASS` (success 100%, consistency 100%, p95 8526ms)
  - 50 sessoes: `PASS` (success 100%, consistency 100%, p95 8335ms)
  - 100 sessoes: `PASS` (success 100%, consistency 100%, p95 4938ms)
- Limite operacional recomendado: `100 sessoes simultaneas`
- Gatilho de escala: degradacao sustentada (`success_rate` abaixo da meta, `consistency_rate` abaixo da meta ou `p95` acima de 20000ms por 3 ciclos consecutivos).

**Criterio de aceite:** relatorio com resultado por patamar (20/50/100) e plano de capacidade.

### P2.2 Auditoria de qualidade de memoria

- [x] Criar rotina semanal de amostragem de fatos salvos vs fatos recuperados.
- [x] Classificar amostras em: correta, parcial, incorreta, desatualizada.
- [x] Registrar taxa de qualidade semanal.

Evidencia atual (2026-03-03):
- Script criado: `scripts/check_brain_memory_quality_audit.js`
- Comando: `npm run check:brain:memory-quality`
- Workflow semanal configurado:
  - `.github/workflows/brain-memory-quality-audit-weekly.yml`
  - gatilhos: `schedule` semanal (segunda 06:30 BRT) + `workflow_dispatch`
- Relatorio semanal:
  - `docs/brain_memory_quality_audit_20260303_170058.md`
  - amostras: `8`
  - taxa:
    - correta: `100%` (8/8)
    - parcial: `0%` (0/8)
    - incorreta: `0%` (0/8)
    - desatualizada: `0%` (0/8)

**Criterio de aceite:** tendencia estavel de qualidade e acao corretiva quando cair.

### P2.3 Governanca custo x qualidade

- [x] Publicar relatorio mensal de custo de inferencia vs qualidade de recall.
- [x] Definir limite de custo por interacao e politica de ajuste.
- [x] Revisar estrategia de retrieval conforme dados reais.

Evidencia atual (2026-03-03):
- Script criado: `scripts/check_brain_cost_quality_governance.js`
- Comando: `npm run check:brain:governance-cost-quality`
- Workflow mensal configurado:
  - `.github/workflows/brain-cost-quality-governance-monthly.yml`
  - gatilhos: `schedule` mensal (dia 1, 07:00 BRT) + `workflow_dispatch`
- Migration aplicada para permitir telemetria com `service_role`:
  - `supabase/migrations/20260303143000_fix_query_telemetry_summary_service_role.sql`
- Relatorio mensal:
  - `docs/brain_memory_cost_quality_report_20260303_174352.md`
  - janela: `30 dias`
  - custo por interacao: `$0.013119` (limite `$0.0100`)
  - recall hit-rate: `90%` (meta `95%`)
  - decisao mensal: `RECUPERAR_QUALIDADE_E_CUSTO`
  - proxima acao: estabilizar recall e reduzir custo em paralelo com revisao de retrieval deterministico.

**Criterio de aceite:** decisao mensal registrada com metricas e proxima acao.

---

## Gate final para declarar "Memoria Viva Total"

Somente declarar "totalmente maduro" quando:

- [x] Itens 6, 7 e 8 da matriz estiverem `Pronto`.
- [ ] Itens 9, 10, 11 e 12 estiverem ao menos em risco baixo com evidencia operacional.
- [ ] Canary + suite de longo prazo estiverem estaveis por 14 dias consecutivos.

Status atual (2026-03-03):
- Gate 1: `OK` (itens 6/7/8 em `Pronto`).
- Gate 2: `PENDENTE` (itens 10/11/12 em `Pronto`; item 9 ainda em `Em risco`).
- Gate 3: `PENDENTE` (streak atual `1/14`; janela de 14 dias consecutivos ainda em formação).
