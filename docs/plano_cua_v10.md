# Plano de Implementação — Segundo Cérebro v10.0
## Computer-Use Agent (CUA): Agente Autônomo com Poderes de Gestor

**Data:** 2026-03-19
**Status:** Proposta — aguardando aprovação
**Objetivo:** Transformar o agente reativo em um agente autônomo que opera o sistema como um gestor — preenchendo formulários, criando registros, corrigindo documentos, monitorando continuamente e entregando relatórios — com política gestor-only e integridade total do sistema existente.

---

## 0. Política de Comunicação: Gestor-Only (Inviolável)

> **Regra:** O Segundo Cérebro CUA só se comunica e executa ações para usuários com `role = 'gestor'`. Qualquer outro perfil recebe `403 Forbidden`.

### Onde a política é aplicada:

| Camada | Mecanismo |
|---|---|
| Edge Functions (todas) | JWT check: `role = 'gestor'` na entrada — rejeita antes de processar |
| RPCs de escrita (`execute_*`) | `PERFORM brain.assert_gestor()` como primeira instrução de toda RPC |
| Tabelas `brain.*` | RLS: `USING (brain.is_gestor())` em toda tabela do schema brain |
| Notices (watchdog/relatórios) | INSERT filtrado: só `app_users` com `role = 'gestor'` como destinatário |
| Frontend `/brain-autonomo` | `<ProtectedRoute allowedRoles={['gestor']}>` |
| Canary / CI | Teste explícito: colaborador tenta ação CUA → deve receber 403 |

```sql
-- Função auxiliar reutilizada em toda RPC CUA
CREATE OR REPLACE FUNCTION brain.assert_gestor() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.app_users
  WHERE email = auth.jwt() ->> 'email';
  IF v_role IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'Acesso negado: apenas gestores podem usar o Agente Autônomo.';
  END IF;
END; $$;
```

---

## 1. Situação Atual (v9.6)

| Capacidade | Status |
|---|---|
| Responde perguntas (gestor) | ✅ Reativo |
| Loop ReAct + Controller | ✅ Máx. 5 iter. |
| Cria tarefas simples | ✅ Básico |
| Scheduled tasks (pg_cron) | ✅ Simples |
| Preenchimento de formulários | ❌ |
| Monitoramento contínuo | ❌ |
| Leitura de screenshots/DOM | ❌ |
| Notificações proativas | ⚠️ Parcial |
| Sessões autônomas longas | ❌ |
| Relatórios agendados | ❌ |
| Política gestor-only end-to-end | ⚠️ Parcial (só chat-brain) |

---

## 2. Visão do Estado Final

```
GESTOR: "Crie uma proposta para Beatrak com tráfego pago R$2.000
         e hospedagem R$300/mês"
                    ↓
    [JWT: role='gestor' ✓]  [Colaborador → 403]
                    ↓
    [AGENT_EXECUTOR v2 — Ciclo Gestor]
         Plan → Execute → Verify → Report
                    ↓
    "✅ Proposta #000075 criada. Rollback disponível 24h."

GESTOR: "Fique de olho nos projetos atrasados"
                    ↓
    [CUA Session criada — loop a cada 30 min]
                    ↓
    [Detecta tarefa atrasada]
                    ↓
    [Notice enviado SOMENTE para gestores]
    "⚠️ Tarefa X está 2 dias atrasada. Responsável: Felipe."
```

---

## 3. GestorAPI: RPCs de Escrita

Todas iniciam com `PERFORM brain.assert_gestor()`.

### Propostas
```sql
execute_create_proposal(p_client_id, p_title, p_services JSONB,
  p_monthly_value, p_setup_value, p_notes) → proposal_id
execute_update_proposal(p_proposal_id, p_field, p_value) → success
execute_update_proposal_status(p_proposal_id, p_status) → success
execute_add_proposal_service(p_proposal_id, p_service_type, p_value) → success
```

### Projetos e Tarefas
```sql
execute_create_project(p_client_id, p_title, p_type, p_deadline,
  p_assignees JSONB, p_description) → project_id
execute_create_task(p_project_id, p_title, p_status, p_assignee,
  p_due_date, p_priority, p_description) → task_id
execute_move_task(p_task_id, p_new_status) → success
execute_assign_task(p_task_id, p_assignee_email) → success
execute_update_project_status(p_project_id, p_status) → success
```

### Usuários
```sql
execute_invite_user(p_email, p_name, p_role) → user_id
execute_update_user_role(p_user_id, p_new_role) → success
execute_deactivate_user(p_user_id) → success
```

### Documentos e Contratos
```sql
execute_update_document(p_document_id, p_field,
  p_old_value, p_new_value) → success   -- grava diff no log
execute_generate_contract(p_proposal_id) → contract_id
execute_mark_clause_reviewed(p_contract_id, p_clause, p_note) → success
```

### Relatórios
```sql
brain_save_report(p_title, p_content, p_report_type, p_session_id) → report_id
brain_schedule_report(p_report_id, p_deliver_at) → success
brain_deliver_report(p_report_id) → success
```

---

## 4. Plano por Fases

---

### FASE 1 — GestorAPI + Agent_Executor v2 + Política End-to-End (v10.0)
**Pré-requisito de tudo. Risco: Médio.**

**Arquivos criados/modificados:**
- `supabase/migrations/YYYYMMDD_cua_gestor_api.sql` — função `brain.assert_gestor()`, todas as RPCs `execute_*`, tabelas `brain.cua_sessions` + `brain.autonomous_actions`, RLS gestor-only
- `supabase/functions/_shared/brain-types.ts` — tipos `CUASession`, `CUAAction`, `CUAActionType`
- `supabase/functions/_shared/agents/specialists.ts` — Agent_Executor v2 com prompt de Gerente Autônomo
- `supabase/functions/_shared/agents/controller.ts` — novas write tools no planner
- `supabase/functions/chat-brain/index.ts` — detecta intenção CUA, valida gestor reforçado

**Resultado:** gestor cria proposta, projeto, convida usuário via chat. Colaborador recebe 403.

---

### FASE 2 — Relatórios e Correção de Documentos (v10.1)
**Risco: Baixo.**

**Arquivos criados/modificados:**
- `supabase/migrations/YYYYMMDD_brain_reports.sql` — tabela `brain.reports`, RLS gestor-only
- `supabase/functions/brain-reports/index.ts` — gera `ops_daily`, `contract_pulse`, `proposal_pipeline`, `client_health`, `custom`
- `pages/BrainRelatorios.tsx` — visualização + download MD/PDF

**Resultado:** gestor diz "gere relatório de projetos toda segunda" → entregue automaticamente.

---

### FASE 3 — Agent_Watchdog: Monitoramento Contínuo (v10.2)
**Risco: Médio.**

**Arquivos criados/modificados:**
- `supabase/functions/brain-watchdog/index.ts` — 6 verificadores por ciclo
- pg_cron: `*/30 * * * *`
- `supabase/functions/chat-brain/index.ts` — detecta "fique observando" → cria `cua_sessions`

Notices: inseridos **somente** para destinatários com `role = 'gestor'`.

---

### FASE 4 — Vision Layer: Leitura de Screenshots e DOM (v10.2)
**Risco: Médio.**

**Arquivos criados/modificados:**
- `supabase/functions/brain-vision/index.ts` — GPT-4o Vision, requer `role = 'gestor'`
- `lib/screenshot.ts` — captura com html2canvas
- `lib/domSnapshot.ts` — serializa estado React em JSON
- `specialists.ts` — Agent_Vision
- `controller.ts` — tool `analyze_current_screen`

---

### FASE 5 — Sessões CUA de Longa Duração (v10.3)
**Risco: Alto.**

**Arquivos criados/modificados:**
- `supabase/functions/brain-cua/index.ts` — `POST /start|pause|stop`, `GET /status`
- Loop: Perceive → Diff → Evaluate → Act → Wait
- Controles: max 1 sessão ativa por gestor, `severity=critical` pausa, timeout `max_hours`

---

### FASE 6 — Painel de Controle CUA (v10.4)
**Risco: Baixo.**

**Arquivos criados/modificados:**
- `pages/BrainAutonomo.tsx` — `<ProtectedRoute allowedRoles={['gestor']}>`
- `components/cua/CUASessionCard.tsx`
- `components/cua/AutonomousActionLog.tsx` — timeline + Desfazer (rollback 24h)
- `components/cua/ReportScheduler.tsx`
- `components/Sidebar.tsx` — novo item com badge sessões ativas
- `App.tsx` — nova rota `/brain-autonomo` e `/brain-relatorios`

---

## 5. FASE 7 — Testes e Validação de Integridade (Transversal)

> **Objetivo:** garantir que nenhuma funcionalidade existente foi quebrada e que todas as funcionalidades novas operam corretamente, incluindo as de segurança (política gestor-only).

Esta fase não é sequencial — cada sub-fase de teste é executada **imediatamente após** a implementação da fase correspondente, antes de fazer deploy.

---

### 5.1 Testes por Fase

#### Após Fase 1 (GestorAPI):

| Teste | Entrada | Esperado |
|---|---|---|
| Criar proposta via chat | "Crie proposta para Beatrak R$2.000/mês" (gestor) | Proposta criada no DB, log em `autonomous_actions` |
| Criar projeto via chat | "Crie projeto Landing Page para Beatrak" (gestor) | Projeto criado com campos corretos |
| Convidar usuário | "Convide ana@c4.com como colaboradora" (gestor) | Usuário criado + e-mail de convite |
| Bloqueio de colaborador | Mesma query com role='colaborador' | HTTP 403 + RAISE EXCEPTION na RPC |
| Rollback de ação | Desfazer proposta criada | `status='rolled_back'` em `autonomous_actions` |
| Compatibilidade: fluxo existente | "Quais projetos estão atrasados?" (gestor) | Resposta normal sem regressão |
| Compatibilidade: Agent_Executor v1 | "Crie tarefa X no projeto Y" | Ainda funciona (backward compat) |

#### Após Fase 2 (Relatórios):

| Teste | Entrada | Esperado |
|---|---|---|
| Gerar relatório on-demand | "Me dê um relatório de projetos agora" | Markdown gerado + salvo em `brain.reports` |
| Agendar relatório | "Envie relatório de contratos toda segunda" | `brain_schedule_report` criado + notice entregue no horário |
| Corrigir documento | "Corrija o valor do contrato Beatrak para R$2.300" | `execute_update_document` com diff logado |
| Colaborador tenta ver relatório | Acessa `/brain-relatorios` | Bloqueado pelo ProtectedRoute |

#### Após Fase 3 (Watchdog):

| Teste | Entrada | Esperado |
|---|---|---|
| Ciclo manual do watchdog | `POST /brain-watchdog` com service_role | 6 checks executados, log em `autonomous_actions` |
| Detecção de tarefa atrasada | Tarefa com `due_date = ontem, status = 'in_progress'` | Notice criado para gestores |
| Bloqueio de notice para colaborador | `app_users` com `role = 'colaborador'` como destinatário | Notice NÃO inserido |
| Intenção "fique observando" | "Monitore os projetos Beatrak" (gestor) | `cua_sessions` criada, confirmação no chat |
| Compatibilidade: telemetria existente | Abre `/brain-telemetry` | Dados exibidos normalmente, sem regressão |

#### Após Fase 4 (Vision):

| Teste | Entrada | Esperado |
|---|---|---|
| Screenshot básico | "O que está nessa tela?" + screenshot | Descrição visual retornada |
| Análise de formulário | Screenshot de proposta aberta | Campos identificados, sugestão de preenchimento |
| DOM snapshot fallback | `dom_snapshot` sem screenshot | Análise baseada em JSON, sem erro |
| Colaborador tenta vision | Role≠gestor, qualquer input | 403 na Edge Function `brain-vision` |

#### Após Fase 5 (Sessões CUA):

| Teste | Entrada | Esperado |
|---|---|---|
| Start/Pause/Stop session | Via API + via chat | Status correto em `cua_sessions` |
| Sessão duplicada | Gestor tenta criar 2ª sessão ativa | Erro: "já existe sessão ativa" |
| Timeout automático | `max_hours=1` → aguarda 1h | Sessão muda para `status='completed'` |
| Ação critical → pausa | Watchdog detecta anomalia crítica | Sessão pausada + notice urgente ao gestor |
| Rollback de ação autônoma | Desfazer ação executada há 6h | `rolled_back_at` preenchido, DB revertido |

#### Após Fase 6 (Painel):

| Teste | Entrada | Esperado |
|---|---|---|
| Colaborador acessa `/brain-autonomo` | Navigate direto | Redirecionado (ProtectedRoute) |
| Badge de sessões ativas | 2 sessões ativas | Badge "2" na Sidebar |
| Botão Desfazer | Clique em ação < 24h | Rollback executado, log atualizado |
| Parar Tudo | Botão de emergência | Todas sessões pausadas imediatamente |

---

### 5.2 Canary Script — Extensão do Existente

O arquivo `scripts/check_brain_canary.js` (já existente) será extendido com:

```javascript
// Novos testes canary para CUA
const CUA_CANARY_TESTS = [
  // Segurança
  { name: 'CUA-SEC-01: colaborador bloqueado',
    role: 'colaborador', query: 'Crie uma proposta',
    expect: { status: 403 } },

  // Escrita via GestorAPI
  { name: 'CUA-OPS-01: criar tarefa via chat',
    role: 'gestor', query: 'Crie uma tarefa de teste no projeto 1',
    expect: { answer_contains: 'criada', db_check: 'project_tasks' } },

  // Relatórios
  { name: 'CUA-REP-01: gerar relatório ops',
    role: 'gestor', query: 'Gere um relatório de projetos agora',
    expect: { answer_contains: 'relatório', db_check: 'brain.reports' } },

  // Compatibilidade regressão
  { name: 'CUA-REG-01: query existente projetos',
    role: 'gestor', query: 'Quais projetos estão atrasados?',
    expect: { answer_not_empty: true, no_error: true } },

  { name: 'CUA-REG-02: telemetria operacional',
    endpoint: '/query_telemetry_summary',
    expect: { has_key: 'total_executions', no_error: true } },

  { name: 'CUA-REG-03: memory SLO',
    endpoint: '/query_memory_slo',
    expect: { has_key: 'recall_hit_rate', no_error: true } },
]
```

**Critério de aprovação para deploy:** 100% dos testes canary passando (existentes + novos).

---

### 5.3 GitHub Actions — CI Automático

Adicionar ao workflow `.github/workflows/brain-cua-validation.yml`:

```yaml
name: Brain CUA Validation
on:
  push:
    paths:
      - 'supabase/functions/**'
      - 'supabase/migrations/**'
jobs:
  canary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run check:brain:canary        # testes existentes
      - run: npm run check:brain:cua           # novos testes CUA
      - run: npm run check:brain:regression    # compatibilidade
```

---

### 5.4 Checklist de Integridade por Deploy

Antes de cada deploy de fase, verificar:

```
□ Todos os canary tests passando (existentes)
□ Novos canary tests da fase passando
□ Colaborador bloqueado em todos os novos endpoints
□ Fluxo de chat normal (non-CUA) sem regressão
□ Telemetria registrando o modelo correto (gpt-5.4-mini)
□ Rollback disponível para ações de escrita
□ pg_cron agendado (watchdog/relatórios)
□ RLS ativo em todas as tabelas brain.*
□ Edge Functions deployadas com --no-verify-jwt
□ Sintaxe Deno validada (sem ?? misturado com ||)
```

---

## 6. Modelo de Segurança Consolidado

```
NÍVEL 1 — Auto-execute (risco baixo)
  create_task, move_task, generate_report
  → Executa direto, loga, notice após
  → Requer: role=gestor

NÍVEL 2 — Execute + Notify (risco médio)
  create_proposal, update_proposal, create_project, update_document
  → Executa, notice detalhado, rollback 24h
  → Requer: role=gestor

NÍVEL 3 — Confirm First (risco alto)
  invite_user, update_user_role, generate_contract, deactivate_user
  → Pausa, pede confirmação explícita do gestor
  → Requer: role=gestor + confirmação

BLOQUEIO TOTAL
  role != 'gestor' em qualquer ponto
  → 403 nas Edge Functions + RAISE EXCEPTION nas RPCs
  → Canary testa isso automaticamente
```

---

## 7. Schema de Banco de Dados

```sql
brain.cua_sessions      -- sessões autônomas ativas (RLS: gestor-only)
brain.autonomous_actions -- auditoria de ações com rollback (RLS: gestor-only)
brain.reports           -- relatórios gerados e agendados (RLS: gestor-only)
```

---

## 8. Mapa de Arquivos

### Novos:
```
supabase/migrations/YYYYMMDD_cua_gestor_api.sql
supabase/migrations/YYYYMMDD_brain_cua_schema.sql
supabase/migrations/YYYYMMDD_brain_reports.sql
supabase/functions/brain-reports/index.ts
supabase/functions/brain-watchdog/index.ts
supabase/functions/brain-vision/index.ts
supabase/functions/brain-cua/index.ts
lib/screenshot.ts
lib/domSnapshot.ts
pages/BrainAutonomo.tsx
pages/BrainRelatorios.tsx
components/cua/CUASessionCard.tsx
components/cua/AutonomousActionLog.tsx
components/cua/ReportScheduler.tsx
scripts/check_brain_cua.js              ← canary CUA
.github/workflows/brain-cua-validation.yml
```

### Modificados:
```
supabase/functions/_shared/brain-types.ts
supabase/functions/_shared/agents/specialists.ts
supabase/functions/_shared/agents/controller.ts
supabase/functions/chat-brain/index.ts
scripts/check_brain_canary.js           ← testes de regressão adicionados
App.tsx
components/Sidebar.tsx
```

---

## 9. Caminho Crítico

```
FASE 1 (GestorAPI + Política) ──────── PRÉ-REQUISITO
    ↓ [Testes Fase 1]        ↓ [Testes Fase 1]
FASE 2 (Relatórios)     FASE 3 (Watchdog)    ← paralelo
    ↓ [Testes Fase 2]        ↓ [Testes Fase 3]
FASE 4 (Vision) ─────────────┘ [Testes Fase 4]
    ↓
FASE 5 (Sessões CUA) ← [Testes Fase 5]
    ↓
FASE 6 (Painel) ← [Testes Fase 6]
    ↓
FASE 7 (Canary CI completo) ← deploy somente após 100% pass
```

---

## 10. Versionamento

| Versão | Fases | Capacidade Nova |
|---|---|---|
| **v10.0** | 1 + Testes 1 | GestorAPI: formulários, propostas, projetos, usuários. Política gestor-only end-to-end |
| **v10.1** | 2 + Testes 2 | Relatórios automáticos e agendados, correção de documentos |
| **v10.2** | 3+4 + Testes 3+4 | Watchdog contínuo, screenshots, Agent_Vision |
| **v10.3** | 5 + Testes 5 | Sessões CUA de longa duração, loop autônomo |
| **v10.4** | 6 + Testes 6 | Painel de controle, rollback, configuração |
| **v10.5** | Futuro | Anthropic claude-sonnet-4-5 com `computer_use` nativo |

---

## 11. Custo Estimado por Operação

| Operação | Tokens | Custo |
|---|---|---|
| Criar proposta (3 steps) | ~6k | ~$0.005 |
| Relatório diário (1 query) | ~4k | ~$0.003 |
| Ciclo watchdog (6 checks) | ~3k | ~$0.002 |
| Screenshot analysis (GPT-4o) | ~2k | ~$0.005 |
| **Watchdog/dia (48 ciclos)** | ~144k | **~$0.11/dia** |

---

*Plano v10.0 — elaborado com base na análise completa da arquitetura v9.6.*
*Testes e validação de integridade integrados em cada fase.*
*Aguardando aprovação para início da Fase 1.*
