# Plano de Evolução: Segundo Cérebro v8.0

Este plano endereça as colocações técnicas levantadas sobre o Relatório v7.0, focando em transformar o sistema de um assistente puramente reativo em um ecossistema de agentes executores com governança rigorosa.

## Resposta Técnica às Colocações

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

## Mudanças Propostas

### Camada de Dados (SQL/Migrations)

#### [NEW] [v8.0_observability_and_execution_logs.sql](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/migrations/20260221000000_v8_0_observability_and_execution_logs.sql)

- Criação da tabela `brain.execution_logs` para auditoria de ações dos agentes.
- Adição de colunas de telemetria em `brain.sessions`.

### Backend (Edge Functions)

#### [MODIFY] [index.ts](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/functions/chat-brain/index.ts)

- Implementação de medição de latência e custo estimado.
- Refatoração do prompt do sistema para refletir a **Estratificação de Memória**.
- Integração de `idempotency_key` (via hash de sessão + timestamp).

#### [MODIFY] [router.ts](file:///d:/GitHub/C4%20Marketing/aistudio-repository-template/supabase/functions/_shared/agents/router.ts)

- Adição de novos agentes executores e filtros de "Vigência Absoluta".

---

## Plano de Verificação

### Testes Automatizados

- Executar `scripts/check_brain_canary.js` para garantir que as novas políticas de retrieval não quebraram a coerência documental.
- Novo teste de carga para validar o impacto da telemetria na latência total.

### Verificação Manual

- Pedir ao usuário para testar um comando de "escrita controlado", como "Agende uma tarefa de revisão para segunda-feira às 10h", e verificar se o `AuditLog` e a `idempotency_key` funcionaram corretamente na tabela de tarefas.
- Validar no dashboard se as métricas de latência e custo estão sendo reportadas no objeto `meta` da resposta.
