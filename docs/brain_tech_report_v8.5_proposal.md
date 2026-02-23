# Plano de Evolução: Segundo Cérebro v8.5

Este documento consolida o plano original da v8.0 e registra todas as implementações realizadas até esta versão, transformando o Segundo Cérebro de um assistente reativo em um **ecossistema de agentes executores** com governança, auditoria e gestão completa de tarefas via linguagem natural.

---

## Resposta Técnica às Colocações (v8.0)

### A. Versionamento e Single Source of Truth

Concordo totalmente. Embora a v6.5 tenha introduzido o `authority_rank` e o gatilho de invalidação, falta uma **Camada de Curadoria Humana**.

- **Proposta**: Implementar uma flag `metadata->>'is_canonical_truth'` que sobrepõe qualquer similaridade semântica. Se um documento for marcado como "Vigente Canônico", o agente o citará obrigatoriamente, ignorando versões obsoletas ou conversas conflitantes.

### B. Estratificação de Memória

A sugestão de estruturar explicitamente as camadas é excelente para reduzir o ruído.

- **Camada 1: Memória Volátil**: Mantida no `session_history` (contexto imediato).
- **Camada 2: Memória Consolidada**: Fatos extraídos e aprendizados via `user_facts` (autonomia cognitiva).
- **Camada 3: Base Documental**: Políticas, contratos e a nova Identidade Canônica (v7.0).
- **Ação**: Ajustaremos o `RetrievalPolicy` para tratar essas fontes com pesos diferentes no prompt do sistema.

### C. Observabilidade e Controle

Atualmente, nossa telemetria é focada em eventos (o que aconteceu). Precisamos focar em performance (como aconteceu).

- **Ação**: Instrumentar o `chat-brain` para registrar `latency_ms`, `token_usage` e `routing_type` (LLM vs Heurística), além de um log de `routing_confidence`.

### D. Evolução para Agentes Executores

Este é o maior salto. Sairemos de "consultar" para "fazer".

- **Ação**: Introduzir o `Agent_Executor` com permissão de escrita (ex: criar tarefas, atualizar status de projeto).
- **Segurança**: Implementação de `AuditLog` obrigatório para toda ação de escrita e uso de `idempotency_keys` para evitar duplicação de ações em retentativas.

---

## Implementações Realizadas (v8.0 → v8.5)

### ✅ 1. Infraestrutura de Observabilidade e Execução

#### Tabela `brain.execution_logs`

- Auditoria completa de todas as ações dos agentes executores
- Campos: `session_id`, `agent_name`, `action`, `status`, `params`, `result`, `latency_ms`, `cost_est`, `error_message`
- Função `public.log_agent_execution()` com `SECURITY DEFINER` para acesso via `service_role`
- Logging fail-safe em cada RPC (erros no log nunca interrompem a operação principal)

#### Telemetria no `chat-brain`

- Medição de latência por RPC (`performance.now()`)
- Diferenciação entre ações de leitura (`db_query`) e escrita (`EXECUTOR`)
- Injeção automática de `p_session_id` em todas as RPCs de escrita

---

### ✅ 2. Agent_Executor — Gestão Completa de Tarefas

O Agent_Executor é o componente central da v8.5. Permite ao usuário gerenciar tarefas do Kanban inteiramente via linguagem natural no chat.

#### 5 RPCs Implementadas

| RPC | Ação | Parâmetros Chave |
|-----|------|-----------------|
| `execute_create_traffic_task` | Criar tarefa | título, descrição, prazo, prioridade, responsável, status |
| `execute_delete_task` | Deletar tarefa | por título ou UUID |
| `execute_move_task` | Mover entre colunas | novo status (backlog → in_progress → approval → done → paused) |
| `execute_update_task` | Atualizar campos | título, descrição, prazo, prioridade, responsável |
| `execute_update_project_status` | Alterar status do projeto | novo status (Ativo, Inativo, Pausado) |

#### Resolução por Nome de Projeto

Todas as RPCs aceitam `p_project_name` como alternativa ao `p_project_id`:

- Busca fuzzy via `ILIKE` na tabela `acceptances.company_name`
- Exemplo: *"Crie uma tarefa no projeto Duarte Vinhos"* → resolve automaticamente para `project_id = 28`

#### Resolução por Título de Tarefa

As RPCs de delete, move e update aceitam `p_task_title` como alternativa ao `p_task_id`:

- Busca fuzzy via `ILIKE` em `project_tasks.title`
- Filtragem opcional por projeto para maior precisão

#### Status do Kanban

| Coluna (UI) | Valor no DB |
|-------------|------------|
| Backlog | `backlog` |
| Em Execução | `in_progress` |
| Aprovação | `approval` |
| Finalizado | `done` |
| Pausado | `paused` |

---

### ✅ 3. LLM Router Aprimorado

#### Exemplos de Escrita no Prompt do Sistema

O Router LLM (`callRouterLLM`) foi expandido com exemplos explícitos de ações de escrita:

```
"crie uma tarefa chamada X no projeto Duarte Vinhos" → execute_create_traffic_task
"delete a tarefa Teste Func" → execute_delete_task
"mova a tarefa X para em execução" → execute_move_task
"defina o André como responsável pela tarefa X" → execute_update_task
"marque o projeto Duarte Vinhos como concluído" → execute_update_project_status
```

#### Mapeamento de Status em Português

O Router converte automaticamente:

- "em execução" → `in_progress`
- "aprovação" → `approval`
- "finalizado/concluído/feito" → `done`
- "pausado" → `paused`
- "backlog" → `backlog`

#### Instruções de Execução Direta

O Router foi instruído a **nunca pedir confirmação** para ações de escrita — executa diretamente e reporta o resultado.

---

### ✅ 4. Correções Críticas

| Problema | Causa Raiz | Solução |
|----------|-----------|---------|
| JWT inválido na Edge Function | Relay do Supabase rejeitava JWT antes do código | Deploy com `--no-verify-jwt` |
| `v_task_id BIGINT` vs UUID | `project_tasks.id` é UUID, não BIGINT | Corrigido para `v_task_id UUID` |
| `catch {}` syntax error | Deno Edge Runtime não aceita `catch {}` sem variável | Corrigido para `catch (_e) {}` |
| `auth.uid()` retornando NULL | `service_role` não tem `auth.uid()` | Removido do logging |
| Schema `brain` inacessível via RPC | `supabaseAdmin.rpc()` só acessa schema `public` | Wrapper em `public` com `SET search_path` |

---

## Arquitetura de Arquivos

### Camada de Dados (SQL/Migrations)

#### [MODIFY] [20260223000000_v8_0_core.sql](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/migrations/20260223000000_v8_0_core.sql)

- Schema `brain` com tabela `execution_logs`
- Função `public.log_agent_execution()` com `SECURITY DEFINER`

#### [MODIFY] [20260223000002_v8_0_executor_tools.sql](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/migrations/20260223000002_v8_0_executor_tools.sql)

- 5 funções SQL: create, delete, move, update_task, update_project_status
- Todas com resolução por nome de projeto e logging fail-safe

### Backend (Edge Functions)

#### [MODIFY] [index.ts](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/functions/chat-brain/index.ts)

- `dbRpcNames`: 5 RPCs de escrita registradas
- `availableTools`: Tool definitions com `p_project_name` em todas
- `callRouterLLM`: Prompt expandido com 15+ exemplos de escrita
- `funcToAgent`: 5 RPCs mapeadas para `Agent_Executor`
- `executorRpcNames`: Set de RPCs de escrita para injeção automática de `p_session_id`
- `executeDbRpc`: Logging de telemetria, tratamento de erros e log de falha

#### [MODIFY] [router.ts](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/functions/_shared/agents/router.ts)

- `routeRequestHybrid`: LLM Router tem prioridade sobre heurísticas (confidence ≥ 0.7)
- `enforcePostLLMGuards`: Guardrails pós-LLM mantidos

---

## Plano de Verificação

### Testes Automatizados

- Executar `scripts/check_brain_canary.js` para garantir coerência documental
- Teste de carga para validar impacto da telemetria na latência

### Verificação Funcional via Chat

| # | Comando | RPC Esperada | Validação |
|---|---------|-------------|-----------|
| 1 | "Crie uma tarefa chamada 'Revisão' no projeto Duarte Vinhos para 25/02" | `execute_create_traffic_task` | Tarefa no Backlog |
| 2 | "Defina o André como responsável pela tarefa Revisão" | `execute_update_task` | Campo `assignee` preenchido |
| 3 | "Mova a tarefa Revisão para em execução" | `execute_move_task` | Tarefa em "Em Execução" |
| 4 | "Delete a tarefa Revisão do projeto Duarte Vinhos" | `execute_delete_task` | Tarefa removida |
| 5 | "Pause o projeto Duarte Vinhos" | `execute_update_project_status` | Status do projeto atualizado |

### Verificação de Logs

```sql
SELECT action, status, params->>'title' as tarefa, created_at 
FROM brain.execution_logs 
ORDER BY created_at DESC LIMIT 10;
```

---

## Próximos Passos (v9.0)

1. **Batch Operations**: Operações em lote (deletar todas as tarefas de um status, mover múltiplas tarefas)
2. **Confirmação Inteligente**: Ações destrutivas (delete) pedem confirmação; ações construtivas (create) executam direto
3. **Notificações**: Agente envia notificação ao responsável quando uma tarefa é atribuída
4. **Agendamento Recorrente**: "Crie uma tarefa toda segunda-feira" → integração com calendário
5. **Dashboard de Telemetria**: Visualização das métricas de `execution_logs` no frontend
6. **Agent_Autonomy**: Agente sugere proativamente tarefas com base em padrões detectados
