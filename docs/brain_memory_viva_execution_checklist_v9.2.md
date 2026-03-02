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

- [ ] Gerar backup remoto antes de qualquer aplicacao:

```bash
npx -y supabase db dump --linked --file "supabase/backups/backup_pre_saneamento_$(date +%Y%m%d_%H%M%S).sql" --workdir .
```

- [ ] Listar estado atual de migrations remotas:

```bash
npx -y supabase migration list --linked --workdir .
```

- [ ] Validar duplicidade local de versao (14 digitos):

```bash
ls supabase/migrations/*.sql | sed -E 's|.*/([0-9]{14})_.*|\1|' | sort | uniq -d
```

**Criterio de aceite:** backup gerado em `supabase/backups/` e sem surpresa critica no inventario.

### P0.2 Saneamento de mismatch remoto/local

Seguir o runbook em `docs/migration_sanitation_plan.md`.

- [ ] Rodar dry-run inicial:

```bash
npx -y supabase db push --linked --dry-run --workdir .
```

- [ ] Se houver mismatch estrutural, executar rebaseline:

```bash
npx -y supabase db pull --linked --workdir .
```

- [ ] Marcar baseline como aplicado (sem reexecucao):

```bash
npx -y supabase migration repair --linked --status applied <BASELINE_14_DIGITOS> --workdir .
```

- [ ] Revalidar dry-run:

```bash
npx -y supabase db push --linked --dry-run --workdir .
```

**Criterio de aceite:** dry-run limpo, sem erro `schema_migrations_pkey`.

### P0.3 Aplicar migrations criticas de memoria/cron

Migrations alvo:
- `supabase/migrations/20260227193000_add_brain_sync_cron_management.sql`
- `supabase/migrations/20260228111500_add_recent_explicit_user_facts_rpc.sql`

- [ ] Aplicar pendencias no ambiente-alvo:

```bash
npx -y supabase db push --linked --workdir .
```

**Criterio de aceite:** `db push` concluido sem falha.

### P0.4 Validar RPC deterministica de fatos recentes (item 6)

- [ ] Confirmar funcao criada:

```sql
select n.nspname as schema, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_recent_explicit_user_facts';
```

- [ ] Executar chamada de smoke test:

```sql
select * 
from public.get_recent_explicit_user_facts('<USER_UUID>'::uuid, null, 6);
```

**Criterio de aceite:** funcao listada e retorno sem erro.

### P0.5 Validar gestao segura de cron por ambiente (item 8)

- [ ] Confirmar funcoes de schedule/unschedule:

```sql
select n.nspname as schema, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('schedule_brain_sync_job', 'unschedule_brain_sync_job');
```

- [ ] Criar/agendar job usando parametros (sem hardcode em migration):

```sql
select public.schedule_brain_sync_job(
  'https://<PROJECT_REF>.supabase.co/functions/v1/brain-sync',
  '<SERVICE_ROLE_KEY>',
  'invoke-brain-sync-every-5min',
  '*/5 * * * *'
);
```

- [ ] Validar job:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'invoke-brain-sync-every-5min';
```

**Criterio de aceite:** job ativo, sem segredo hardcoded em arquivo SQL.

### P0.6 Revalidacao canario completo (pos-migration)

- [ ] Executar canario:

```bash
node scripts/check_brain_canary.js
```

- [ ] Registrar evidencia no PR ou changelog com:
  - `Falhas criticas: 0`
  - `Recuperacao Imediata da Memoria: [PASS]`
  - `Pergunta Composta (multi-RPC): [PASS]`

**Criterio de aceite:** canario verde e sem regressao de recall imediato.

---

## P1 (curto prazo) - confiabilidade operacional

### P1.1 Suite de memoria de longo prazo (T+1/T+7/T+30)

- [x] Criar suite automatizada dedicada (`scripts/check_brain_memory_long_horizon.js`).
- [x] Cobrir 3 cenarios minimos:
  - salvar fato explicito em T0;
  - validar recall em T+1, T+7 e T+30;
  - validar metadados (`memory_recall_scope/source/candidates`).
- [ ] Rodar diariamente em CI (ou job agendado externo).

Evidencia atual (2026-03-02):
- Comando: `npm run check:brain:memory-long`
- Resultado: `PASS=0`, `PENDING=3`, `FAIL=0`
- Observacao operacional:
  - T+1 e T+7 ainda pendentes com `memory_recall_source=cognitive_fallback` retornando marcador de T+30.
  - A suite foi ajustada para nao reseedar em loop quando houver marcador de outro horizonte.
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

Evidencia atual (2026-03-02):
- RPC criada: `public.query_memory_slo(p_days, p_target_recall_hit_rate, p_max_critical_canary_failures)`
- Painel: `pages/BrainTelemetry.tsx` agora consulta `query_memory_slo` e exibe bloco de status com badge `OK/ALERT/NO_DATA`.
- Canary: `scripts/check_brain_canary.js` passou a registrar execucao em `brain.execution_logs` com
  - `agent_name=Canary_BrainMemory`
  - `action=memory_canary`
  - `status=success|error`
  - `params.critical_failed`
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

- [ ] Criar teste de carga de recall com 20/50/100 sessoes simultaneas.
- [ ] Medir taxa de sucesso, latencia e consistencia de resposta.
- [ ] Definir limite operacional e gatilho de escala.

**Criterio de aceite:** relatorio com resultado por patamar (20/50/100) e plano de capacidade.

### P2.2 Auditoria de qualidade de memoria

- [ ] Criar rotina semanal de amostragem de fatos salvos vs fatos recuperados.
- [ ] Classificar amostras em: correta, parcial, incorreta, desatualizada.
- [ ] Registrar taxa de qualidade semanal.

**Criterio de aceite:** tendencia estavel de qualidade e acao corretiva quando cair.

### P2.3 Governanca custo x qualidade

- [ ] Publicar relatorio mensal de custo de inferencia vs qualidade de recall.
- [ ] Definir limite de custo por interacao e politica de ajuste.
- [ ] Revisar estrategia de retrieval conforme dados reais.

**Criterio de aceite:** decisao mensal registrada com metricas e proxima acao.

---

## Gate final para declarar "Memoria Viva Total"

Somente declarar "totalmente maduro" quando:

- [ ] Itens 6, 7 e 8 da matriz estiverem `Pronto`.
- [ ] Itens 9, 10, 11 e 12 estiverem ao menos em risco baixo com evidencia operacional.
- [ ] Canary + suite de longo prazo estiverem estaveis por 14 dias consecutivos.
