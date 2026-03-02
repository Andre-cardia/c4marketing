# Runbook de Incidentes - Memoria do Segundo Cerebro

Data: 2026-03-02  
Projeto Supabase: `xffdrdoaysxfkpebhywl`  
Escopo: memoria explicita, recall imediato, canario e SLO de memoria

## 1. Objetivo

Padronizar resposta a incidentes que afetem o "Segundo Cerebro" com foco em:

- indisponibilidade de integracao LLM (ex.: erro 401 de API key);
- queda de consistencia de recall de memoria;
- regressao apos migration/deploy.

## 2. SLO e gatilhos de alerta

SLO operacional minimo (janela de 24h):

- `recall_hit_rate >= 95%`
- `critical_canary_failures = 0`

Abrir incidente quando ocorrer ao menos um gatilho:

- `query_memory_slo` retornar `alerts.overall = 'alert'`;
- canario `scripts/check_brain_canary.js` com `Falhas criticas > 0`;
- resposta degradada recorrente no `chat-brain` (ex.: fallback de erro de integracao).

## 3. Responsaveis e SLA de resposta

- Dono tecnico: gestao tecnica do Segundo Cerebro.
- Tempo maximo para resposta inicial: 15 min.
- Tempo alvo para mitigacao: 60 min quando houver impacto em producao.
- Canal primario: grupo operacional interno (Slack/WhatsApp/Teams) + registro no card/ticket do incidente.

## 4. Triagem inicial (0-15 min)

1. Confirmar impacto real com smoke test:

```bash
node scripts/check_brain_canary.js
```

2. Registrar timestamp da deteccao e sintoma principal.
3. Classificar severidade:
   - SEV1: indisponibilidade geral ou perda sistemica de recall.
   - SEV2: degradacao parcial com fallback funcional.
4. Congelar mudancas de banco/funcoes ate estabilizar.

## 5. Diagnostico tecnico (15-30 min)

Executar em ordem:

1. SLO atual:

```bash
npm run check:brain:slo
```

2. Historico recente do canario no banco:

```sql
select
  created_at,
  status,
  params->>'critical_failed' as critical_failed,
  error_message
from brain.execution_logs
where agent_name = 'Canary_BrainMemory'
  and action = 'memory_canary'
order by created_at desc
limit 20;
```

3. Verificar segredo OpenAI:

```bash
SUPABASE_ACCESS_TOKEN='***' npx -y supabase secrets list \
  --project-ref xffdrdoaysxfkpebhywl --workdir . -o json
```

4. Se incidente envolver memoria de horizonte longo, rodar:

```bash
npm run check:brain:memory-long
```

## 6. Mitigacao e rollback

### 6.1 Erro de integracao OpenAI (ex.: 401 API key)

1. Rotacionar `OPENAI_API_KEY` no projeto:

```bash
SUPABASE_ACCESS_TOKEN='***' npx -y supabase secrets set \
  OPENAI_API_KEY='sk-proj-...' \
  --project-ref xffdrdoaysxfkpebhywl --workdir .
```

2. Reexecutar smoke test (`node scripts/check_brain_canary.js`).
3. Confirmar que `meta.error` deixou de aparecer nas respostas do `chat-brain`.

### 6.2 Regressao apos migration

1. Identificar migration candidata (ultima aplicada).
2. Se necessario, marcar como revertida no historico para interromper propagacao:

```bash
SUPABASE_ACCESS_TOKEN='***' npx -y supabase migration repair \
  --linked --status reverted <VERSAO> --workdir .
```

3. Aplicar SQL de rollback/hotfix previamente revisado.
4. Se impacto for estrutural e nao houver rollback seguro rapido, restaurar backup operacional.

### 6.3 Regressao apos deploy de function

1. Reimplantar versao estavel da `chat-brain` (ultimo commit validado).
2. Confirmar secrets necessarios (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Validar canario apos redeploy.

## 7. Validacao de recuperacao (30-60 min)

Incidente so pode ser encerrado quando todos os itens abaixo passarem:

- `node scripts/check_brain_canary.js` com `Falhas criticas: 0`;
- `npm run check:brain:slo` sem alerta ativo (`overall = ok` ou `no_data` controlado);
- consulta funcional no `chat-brain` sem fallback de erro de integracao;
- evidencia registrada no ticket/PR com hora de deteccao, causa raiz, acao aplicada e hora de recuperacao.

## 8. Comunicacao do incidente

Template curto para atualizacao:

```text
[INCIDENTE MEMORIA][SEVx]
Inicio: <YYYY-MM-DD HH:MM BRT>
Sintoma: <erro observado>
Impacto: <quem/quantos fluxos foram afetados>
Causa provavel: <hipotese atual>
Mitigacao em andamento: <acao>
Proxima atualizacao: <HH:MM BRT>
```

Template de encerramento:

```text
[ENCERRADO][INCIDENTE MEMORIA]
Inicio: <...>
Fim: <...>
Causa raiz: <...>
Correcao aplicada: <...>
Validacao: canario=<PASS/FAIL>, slo=<OK/ALERT>
Acoes preventivas: <lista curta>
```

## 9. Pos-incidente (obrigatorio)

1. Abrir acao preventiva com dono e prazo.
2. Atualizar este runbook quando houver lacuna descoberta.
3. Executar simulacao mensal (tabletop) com ao menos 1 cenario:
   - 401 de API key;
   - regressao de recall apos migration;
   - alerta SLO por queda de hit-rate.
