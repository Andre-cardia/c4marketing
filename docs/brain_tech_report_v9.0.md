# Relatório Técnico v9.0: Consolidação Integral (v7.0 + v8.0 + v8.5 + v8.6 + v8.7 + v9.0)

**Sistema "Segundo Cérebro" da C4 Marketing — 26 de Fevereiro de 2026**

Este documento consolida integralmente todo o histórico técnico do Segundo Cérebro, incluindo:

1. Inclusão integral do `brain_tech_report_v7.0.md` (que por sua vez contém v1 → v6.5 sem cortes).
2. Inclusão integral do `brain_tech_report_v8.0_proposal.md` (plano de evolução para agentes executores).
3. Inclusão integral do `brain_tech_report_v8.5_proposal.md` (implementação do Agent_Executor).
4. Inclusão detalhada do ciclo v8.6: **Generative UI Engine** — componentes visuais no chat, sanitização de PII, anti-duplicação e correções de roteamento.
5. Inclusão detalhada do ciclo v8.7: **Especialização de Agentes + Guardrails de Domínio + Chat Dedicado de Tráfego + Capacidades v9.0 consolidadas no core.**
6. Inclusão detalhada do ciclo v9.0: **Governança de Dados + Rastreamento Operacional + Segurança de Contratos + Títulos de Sessão + Credenciais Criptografadas.**

---

## Bloco Integral 1 — Conteúdo Original do Relatório v7.0 (sem resumo, sem cortes)

> O relatório v7.0 (`brain_tech_report_v7.0.md`) contém integralmente todo o histórico desde v1 até v7.0.
> O conteúdo abaixo replica integralmente esse relatório.

### Linha do Tempo da Evolução (v1 → v7.0)

| Versão | Nome | Capacidade Principal |
|--------|------|---------------------|
| v1 | Chat RAG | Busca vetorial + filtro anti-eco |
| v2 | Agentic RAG | Router heurístico, 6 agentes, ETL automático |
| v3 | Hybrid Intelligence | Tool use (RAG + SQL direto) |
| v4.1 | Cognitive Agent | Identidade + memória de sessão + cobertura total |
| v4.5 | Semantic Router | LLM Router (Function Calling) + gestão de propostas |
| v5.0 | Resilient Cognitive Router | JWT resiliente + Multi-RPC SQL + resposta composta |
| v6.0 | Cognitive Stabilization | Memória viva cognitiva + guardrails anti-alucinação |
| v6.5 | Normative Governance | NORMATIVE_FIRST + versionamento + canário automático |
| v7.0 | Corporate Canonical Layer | Guardrail corporativo absoluto + controle por cargo |

---

### v4.5 — Mudança Arquitetural Principal: De Keywords para Semântica

#### O Problema (v2–v4.1)

O roteamento do sistema dependia de listas de palavras-chave fixas para decidir qual ferramenta usar:

```typescript
// ❌ Abordagem antiga (heurística)
if (hasAny(msg, ["aberta", "pendente", "aguardando"])) {
    statusFilter = 'open'  // ← e se o usuário disser "em aberto"?
}
```

Isso gerava falhas reais:

- **"quais propostas estão em aberto?"** → Palavra "aberto" não matchava com "aberta" → resposta errada
- **"quais propostas..."** → "quais" sozinho não era keyword de listagem → caía no RAG genérico
- **"tem tarefa pendente?"** → Sem "liste" ou "todos", não era detectado como listagem

Cada erro exigia adição manual de mais keywords, criando uma lista infinita e frágil.

#### A Solução (v4.5): LLM Router com Function Calling

Em vez de keywords, o sistema agora usa GPT-4o-mini como classificador inteligente. O LLM recebe as ferramentas disponíveis (RPCs) como funções tipadas e escolhe qual usar com base na compreensão semântica:

```typescript
// ✅ Abordagem nova (LLM Function Calling)
const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',       // Rápido (~500ms) e barato (~$0.001/chamada)
    temperature: 0,              // Determinístico
    tools: availableTools,       // 7 ferramentas tipadas
    tool_choice: "required",     // Sempre escolhe uma
    messages: [
        { role: 'system', content: routerPrompt },
        { role: 'user', content: perguntaDoUsuario }
    ]
})
```

**Hierarquia de Decisão (v4.1 → v4.5):**

**Inversão crítica**: Na v4.1, a heurística (keywords) era executada PRIMEIRO e o LLM era fallback. Na v4.5, o **LLM é executado PRIMEIRO** e a heurística é o fallback para resiliência.

#### Ferramentas Tipadas (Function Definitions)

O LLM Router recebe 7 ferramentas com schemas JSON tipados:

| Ferramenta | Parâmetros |
|------------|-----------|
| `query_all_proposals` | `p_status_filter`: "all" / "open" / "accepted" |
| `query_all_clients` | `p_status`: "Ativo" / "Inativo" / "Suspenso" |
| `query_all_projects` | `p_service_type`, `p_status_filter` |
| `query_all_tasks` | `p_project_id`, `p_status`, `p_overdue`, `p_reference_date` |
| `query_all_users` | (sem parâmetros) |
| `query_access_summary` | (sem parâmetros) |
| `rag_search` | (busca semântica — documentos e contratos) |

#### Gestão de Propostas: Open vs Accepted

Todas as propostas são separadas em duas listas no Frontend e no Backend:

| Arquivo | Mudança |
|---------|---------|
| `ProposalView.tsx` | Aceite grava `status: 'Inativo'` na tabela `acceptances` |
| `Proposals.tsx` | Lista principal filtra propostas não aceitas |
| `query_all_proposals` RPC | Novo parâmetro `p_status_filter` ('all', 'open', 'accepted') |
| `router.ts` | LLM Router seleciona filtro correto via function calling |

#### Limpeza de Parâmetros RPC

```typescript
const cleanParams: Record<string, any> = {}
for (const [k, v] of Object.entries(rpcParams)) {
    if (v !== null && v !== undefined && v !== 'null') cleanParams[k] = v
}
```

---

### v5.0 — Resiliência de Autenticação e Multi-Consulta SQL

#### Incidente de Produção (Fev/2026)

Sintomas observados:

- Mensagens recorrentes: `Falha de integração... Sessão inválida (JWT)`
- Perda de continuidade de identidade em alguns fluxos
- Respostas parciais para perguntas compostas
- Respostas alucinatórias de "não tenho acesso ao sistema/banco"

Causas-raiz:

- Pipeline de roteamento preso ao conceito de uma única tool por pergunta
- Em cenários de sessão/token inconsistente, a autenticação falhava cedo

#### Resiliência JWT (Camada de Autenticação v5.0)

1. Tentativa primária: `auth.getUser(authToken)`
2. Fallback controlado:
   - Decodifica claims JWT localmente
   - Compara `ref` do token com o project ref esperado
   - Reaproveita `sub` como `userId` somente se `ref` compatível
   - Enriquecimento por `auth.admin.getUserById(sub)`
   - Enriquecimento de perfil em `app_users` por e-mail
3. Fail-closed quando não há identidade válida

#### Multi-Consulta SQL na Mesma Pergunta (Batch RPC)

- Prompt do Router permite múltiplas function calls para perguntas compostas
- Backend parseia todas as `tool_calls`
- Aplica inferência complementar por intenção
- Faz deduplicação por chave (`rpc_name + params`)
- Executa lote de RPCs sequencialmente
- Retorna telemetria em `meta.executed_db_rpcs`

**Exemplo:** `"quais sao as tarefas do lucas, quantos usuários temos e quantos projetos ativos?"` → executa `query_all_tasks` + `query_all_users` + `query_all_projects` em um único ciclo.

#### Regra de Memória Explícita (v5.0)

Quando o usuário envia "guarde isso / salve / lembre que...":

1. Extrai o fato da frase (`extractMemoryFactText`)
2. Gera embedding com `text-embedding-3-small`
3. Persiste via `insert_brain_document`
4. Metadados: `source_table=user_facts`, `source=explicit_user_memory`, `fact_kind=user_asserted`
5. Retorna confirmação determinística de gravação

#### Comparativo v4.5 vs v5.0

| Dimensão | v4.5 | v5.0 |
|----------|------|------|
| Roteamento de intenção | 1 tool por pergunta | Múltiplas tools por pergunta composta |
| Execução SQL | RPC única | Batch de RPCs com dedupe |
| JWT em sessão inconsistente | Suscetível a falha | Fallback resiliente |
| Resposta a perguntas compostas | Parcial | Cobertura integral |
| Telemetria de execução | Limitada | `meta.executed_db_rpcs` |

---

### v6.0 — Estabilização Cognitiva

#### Memória viva cognitiva

- `persistCognitiveChatMemory(role, content, stage)` — grava user e assistant
- Wrapper resiliente: falha não derruba o chat
- Metadados: `type=chat_log`, `source=cognitive_live_memory`, `authority_rank=20`
- Telemetria: `memory_write_events` por estágio

#### Consulta cognitiva obrigatória antes da resposta

Guardrail global: sempre executar busca vetorial cognitiva antes da geração final. Injeta no prompt:

- `FATOS EXPLÍCITOS SALVOS PELO USUÁRIO`
- `MEMÓRIA COGNITIVA RELEVANTE`

#### Expansão de C-level no roteamento

Termos cobertos: `ceo`, `cto`, `cfo`, `coo`, `cmo`, `cio`, `presidente`, `fundador`, `dono`, `diretor executivo`.

#### Saneamento de migrations

Conflito de versão `20240201` duplicada resolvido por isolamento de migration legada em `supabase/migrations_legacy/`.

#### Telemetria adicionada

`meta` passou a carregar:

- `executed_db_rpcs`: lista de RPCs SQL efetivamente executadas
- `cognitive_memory_docs`: quantidade de documentos cognitivos recuperados
- `memory_write_events`: eventos de escrita de memória por estágio

---

### v6.5 — Governança Normativa

#### Retrieval policy normativa (`NORMATIVE_FIRST`)

- `status=active`, `is_current=true`, `searchable=true`, vigência válida
- Ordenação: maior autoridade → vigente → similaridade semântica
- Fail-open: se retornar vazio, fallback para `STRICT_DOCS_ONLY`

#### Feature flags de ativação gradual

1. `BRAIN_NORMATIVE_GOVERNANCE_ENABLED` — ativa NORMATIVE_FIRST no chat-brain
2. `BRAIN_VERSIONED_PUBLISH_ENABLED` — ativa publish_brain_document_version no embed-content

#### Hierarquia de autoridade

```
policy    = 100  (máxima autoridade)
procedure = 90
contract  = 80
memo      = 60
conversation = 20
```

#### Migrations do ciclo normativo

| Migration | Conteúdo |
|-----------|---------|
| `20260219195000_normative_rag_governance.sql` | `brain_authority_rank()`, `publish_brain_document_version()`, `invalidate_obsolete_brain_embeddings()`, upgrade de `match_brain_documents()`, índices |
| `20260219201000_auto_invalidate_obsolete_embeddings_trigger.sql` | Trigger `trg_brain_documents_auto_invalidate` |
| `20260219203000_cleanup_canary_memory_artifacts.sql` | Limpeza de artefatos de teste canário |
| `20260219204500_fix_match_brain_documents_json_null_filters.sql` | Hotfix crítico: normaliza JSON `null` para SQL `NULL` |
| `20260219210000_cleanup_normative_canary_docs.sql` | Limpeza de documentos canário normativos |

#### Validação canário

Resultado: 4/5 testes PASS, 0 falhas críticas, script finalizado com `exit code 0`.

Flags ativas em produção:

- `BRAIN_NORMATIVE_GOVERNANCE_ENABLED=true`
- `BRAIN_VERSIONED_PUBLISH_ENABLED=true`

---

### v7.0 — Camada Canônica Corporativa + Agentes por Perfil

#### Contexto e Motivação

Ao encerrar o ciclo v6.5, o Segundo Cérebro possuía:

- Hierarquia normativa de documentos (`authority_rank`)
- Retrieval NORMATIVE_FIRST para documentos ativos e vigentes
- Memória cognitiva por usuário isolada por `tenant_id = userId`

**O que faltava:** uma camada imutável com a identidade corporativa da C4 Marketing — missão, visão, valores, endgame e políticas de área — injetada antes de tudo em cada turno, servindo como guardrail absoluto para todos os agentes.

**Problema adicional:** toda memória era isolada por `tenant_id` (userId). Não havia mecanismo para compartilhar documentos entre todos os usuários com controle de acesso por cargo.

#### Arquitetura Tier 1 — Memória Canônica Corporativa

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1 — MEMÓRIA CANÔNICA CORPORATIVA  (tenant: c4_corporate)  │
│  Missão · Visão · Valores · Endgame  →  authority_rank = 100    │
│  Documentos de área por cargo        →  authority_rank = 90     │
│  Guardrail: injetado SEMPRE, ANTES de tudo, em todo turno       │
└─────────────────────────────────────────────────────────────────┘
```

#### Controle de Acesso por Cargo

| Cargo | Documentos canônicos visíveis |
|-------|-------------------------------|
| `gestão` | Todos (missão, visão, valores, endgame + todos os docs de área) |
| `financeiro` | Missão + Visão + Valores + Endgame + docs financeiros |
| `comercial` | Missão + Visão + Valores + Endgame + docs comerciais |
| `operacional` | Missão + Visão + Valores + Endgame + docs operacionais |
| `rh` (futuro) | Missão + Visão + Valores + Endgame + docs RH |
| `marketing` (futuro) | Missão + Visão + Valores + Endgame + docs estratégia digital |

Documentos sem `role_allowlist` são visíveis a todos os cargos.

#### Migration SQL: `20260220000000_corporate_canonical_memory.sql`

**Função de tenant corporativo global:**

```sql
CREATE OR REPLACE FUNCTION public.c4_corporate_tenant_id()
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'c4_corporate_identity'::text;
$$;
```

**RPC de retrieval canônico:**

```sql
CREATE OR REPLACE FUNCTION public.get_canonical_corporate_docs(
  query_embedding extensions.vector(1536),
  p_user_role     text    DEFAULT 'gestão',
  p_top_k         int     DEFAULT 10
)
RETURNS TABLE (id uuid, content text, metadata jsonb, similarity float)
LANGUAGE plpgsql SECURITY DEFINER
```

Características:

- `SECURITY DEFINER`: ignora RLS do usuário
- Filtra por `tenant_id = 'c4_corporate_identity'`
- Filtra por `role_allowlist` — documentos de área só aparecem para cargos autorizados
- `gestão` sempre enxerga tudo
- `embedding IS NOT NULL` — garante que só retorna documentos com embedding gerado

#### Seed dos documentos canônicos (conteúdo real C4)

| # | document_key | title | authority_rank | role_allowlist |
|---|-------------|-------|---------------|----------------|
| 1 | `corporate_identity:mission` | Missão Corporativa | 100 | (todos) |
| 2 | `corporate_identity:vision` | Visão Corporativa | 100 | (todos) |
| 3 | `corporate_identity:values` | Valores Corporativos | 100 | (todos) |
| 4 | `corporate_identity:endgame` | Endgame Estratégico | 100 | (todos) |
| 5 | `corporate_identity:financial_policy` | Política Financeira | 90 | `["gestão","financeiro"]` |
| 6 | `corporate_identity:commercial_policy` | Política Comercial | 90 | `["gestão","comercial"]` |
| 7 | `corporate_identity:operational_policy` | Política Operacional | 90 | `["gestão","operacional"]` |

**Conteúdo real inserido:**

**Missão:**
> Acelerar o crescimento de empresas brasileiras por meio de estratégias de marketing de performance e soluções de IA, integrando dados, criatividade e tecnologia para gerar tráfego qualificado, engajar, converter e fidelizar clientes. Atuamos de forma consultiva, colocando o cliente no centro e impulsionando resultados mensuráveis e sustentáveis.

**Visão:**
> Ser a agência de marketing de performance mais recomendada do Brasil até 2029, reconhecida por soluções inovadoras em IA, resiliência diante das mudanças e por multiplicar em dez vezes o faturamento de nossos clientes em até 36 meses. Após consolidar a liderança no Brasil, expandir para a América Latina com o mesmo padrão de excelência.

**Valores:**

- Foco no cliente: o cliente é o centro de todas as ações.
- Resultados mensuráveis: estratégias orientadas por dados que maximizem ROI e reduzam o CAC.
- Transparência e ética: comunicação clara e prática ética.
- Inovação: adoção contínua de novas tecnologias, incluindo IA própria.
- Resiliência: capacidade de adaptação e superação diante de desafios.
- Colaboração e desenvolvimento humano: valorização do trabalho em equipe e da capacitação.
- Responsabilidade social e sustentabilidade: compromisso com impactos positivos.

**Endgame:**
> Até 2029, tornar a C4 Marketing a líder nacional em marketing de performance com IA, oferecendo um ecossistema de soluções próprias que permitam aos clientes brasileiros multiplicar seu faturamento em 10× em até três anos. Após consolidar a liderança no Brasil, expandir para pelo menos três países da América Latina, mantendo uma cultura de inovação, resiliência e foco absoluto no cliente.

**Política Financeira** _(gestão + financeiro)_: ticket médio R$ 2.126, MRR atual ~R$ 32.000, meta 2026 triplicar para R$ 96.000, modelo de precificação por serviço, regras de inadimplência e cancelamento.

**Política Comercial** _(gestão + comercial)_: geração de leads por indicação e prospecção ativa, fechamento pelo CEO André Cardia (podendo delegar ao Gerente de Contas Lucas ou CTO Celso Ferreira), aceite da proposta formaliza o contrato, tempo médio 15–30 dias, meta 4 novos clientes/mês.

**Política Operacional** _(gestão + operacional)_: estrutura da equipe, onboarding em 24h, gestão pelo sistema AI Studio, comunicação via WhatsApp + reuniões + relatórios mensais, princípios de transparência e proatividade.

#### Alterações em `brain-types.ts`

Nova `RetrievalPolicy`:

```typescript
export type RetrievalPolicy =
  | "STRICT_DOCS_ONLY" | "NORMATIVE_FIRST" | "DOCS_PLUS_RECENT_CHAT"
  | "CHAT_ONLY" | "OPS_ONLY"
  | "CANONICAL_ALWAYS"; // Tier-1: documentos canônicos corporativos
```

Novos campos em `MatchFilters`:

```typescript
role_allowlist?: string[] | null;  // cargos com acesso ao documento canônico
canonical_scope?: boolean;         // quando true, ignora tenant isolation
```

#### Alterações em `brain-retrieval.ts`

```typescript
case "CANONICAL_ALWAYS": {
    f.canonical_scope = true;
    f.status = "active";
    f.require_current = true;
    f.require_searchable = true;
    f.authority_rank_min = 90;
    ensureBlock("chat_log", "session_summary");
    f.time_window_minutes = null;
    break;
}
```

#### Alterações em `chat-brain/index.ts`

**Feature flag:**

```typescript
const canonicalMemoryEnabled = isTruthyFlag(Deno.env.get('BRAIN_CANONICAL_MEMORY_ENABLED'))
```

**Função `runCanonicalRetrieval()`:**

- Se flag desativada, retorna vazio sem chamada de rede
- Se RPC falhar, retorna vazio e loga o erro — não derruba o chat
- Se não houver documentos, retorna vazio (graceful degradation)

**Execução antes de qualquer outro retrieval:**

```typescript
const { text: canonicalBlock, count: canonicalDocsCount } = await runCanonicalRetrieval()
```

**Injeção no topo absoluto do system prompt:**

```typescript
const canonicalSystemBlock = canonicalBlock
    ? `=== MEMÓRIA CANÔNICA CORPORATIVA — C4 MARKETING ===
Os documentos abaixo representam os princípios fundadores, a identidade
e as políticas inegociáveis da C4 Marketing. Eles têm autoridade máxima
sobre qualquer outra fonte de informação neste sistema.

GUARDRAIL ABSOLUTO: Nenhuma resposta pode contradizer, relativizar ou
ignorar estes princípios.

${canonicalBlock}
=== FIM DA MEMÓRIA CANÔNICA ===`
    : ''
```

**Telemetria adicionada:**

```typescript
meta: {
    canonical_memory_enabled: canonicalMemoryEnabled,
    canonical_docs_loaded: canonicalDocsCount,
}
```

#### Geração de Embeddings via pg_net

Após a migration inserir os 7 documentos com `embedding = NULL`:

```sql
SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/embed-content',
    headers := jsonb_build_object('Authorization', 'Bearer [SERVICE_ROLE_KEY]', 'Content-Type', 'application/json'),
    body := jsonb_build_object('content', d.content, 'metadata', d.metadata)
) AS request_id, d.metadata->>'document_key' AS doc_key
FROM brain.documents d
WHERE d.metadata->>'tenant_id' = 'c4_corporate_identity' AND d.embedding IS NULL;
```

Todos os 7 documentos retornaram `tem_embedding = true`.

#### Deploy e Ativação

Flag ativada: `BRAIN_CANONICAL_MEMORY_ENABLED = true`

**Teste de validação:** `"Qual é a missão da C4?"` → resposta 100% fiel ao conteúdo canônico. Zero alucinação. `meta.canonical_docs_loaded > 0` confirmado.

#### Arquivos Modificados no ciclo v7.0

| Arquivo | Tipo | Operação | Descrição |
|---------|------|----------|-----------|
| `20260220000000_corporate_canonical_memory.sql` | SQL | CRIAR | Função tenant, index, RPC canônico, seed de 7 documentos |
| `brain-types.ts` | TypeScript | MODIFICAR | `CANONICAL_ALWAYS`, `role_allowlist`, `canonical_scope` |
| `brain-retrieval.ts` | TypeScript | MODIFICAR | `case "CANONICAL_ALWAYS"` |
| `chat-brain/index.ts` | TypeScript | MODIFICAR | Flag, `runCanonicalRetrieval()`, injeção no topo do prompt, telemetria |

#### Encerramento da v7.0

A v7.0 representa uma mudança qualitativa fundamental: de um sistema de recuperação e geração para um **sistema com identidade corporativa imutável**. O Segundo Cérebro passou a ser o guardião da cultura e da estratégia da C4 Marketing.

---

## Bloco Integral 2 — Conteúdo Original do Relatório v8.0 (sem resumo, sem cortes)

> O conteúdo abaixo replica integralmente o relatório `brain_tech_report_v8.0_proposal.md`.

### Plano de Evolução: Segundo Cérebro v8.0

Este plano endereça as colocações técnicas levantadas sobre o Relatório v7.0, focando em transformar o sistema de um assistente puramente reativo em um ecossistema de agentes executores com governança rigorosa.

#### Resposta Técnica às Colocações

##### A. Versionamento e Single Source of Truth

Concordo totalmente. Embora a v6.5 tenha introduzido o `authority_rank` e o gatilho de invalidação, falta uma **Camada de Curadoria Humana**.

- **Proposta**: Implementar uma flag `metadata->>'is_canonical_truth'` que sobrepõe qualquer similaridade semântica. Se um documento for marcado como "Vigente Canônico", o agente o citará obrigatoriamente, ignorando versões obsoletas ou conversas conflitantes.

##### B. Estratificação de Memória

- **Camada 1: Memória Volátil**: Mantida no `session_history` (contexto imediato).
- **Camada 2: Memória Consolidada**: Fatos extraídos e aprendizados via `user_facts` (autonomia cognitiva).
- **Camada 3: Base Documental**: Políticas, contratos e a nova Identidade Canônica (v7.0).
- **Ação**: Ajustaremos o `RetrievalPolicy` para tratar essas fontes com pesos diferentes no prompt do sistema.

##### C. Observabilidade e Controle

- **Ação**: Instrumentar o `chat-brain` para registrar `latency_ms`, `token_usage` e `routing_type` (LLM vs Heurística), além de um log de `routing_confidence`.

##### D. Evolução para Agentes Executores

Este é o maior salto. Sairemos de "consultar" para "fazer".

- **Ação**: Introduzir o `Agent_Executor` com permissão de escrita (ex: criar tarefas, atualizar status de projeto).
- **Segurança**: Implementação de `AuditLog` obrigatório para toda ação de escrita e uso de `idempotency_keys` para evitar duplicação de ações em retentativas.

#### Mudanças Propostas

##### Camada de Dados (SQL/Migrations)

- [NEW] `v8.0_observability_and_execution_logs.sql`: Criação da tabela `brain.execution_logs` para auditoria. Adição de colunas de telemetria em `brain.sessions`.

##### Backend (Edge Functions)

- [MODIFY] `index.ts`: Implementação de medição de latência e custo estimado. Refatoração do prompt do sistema para refletir Estratificação de Memória. Integração de `idempotency_key`.
- [MODIFY] `router.ts`: Adição de novos agentes executores e filtros de "Vigência Absoluta".

#### Plano de Verificação

- Executar `scripts/check_brain_canary.js` para garantir coerência documental
- Novo teste de carga para validar impacto da telemetria na latência
- Teste de escrita controlado: "Agende uma tarefa de revisão para segunda-feira às 10h"
- Validar métricas de latência e custo no objeto `meta` da resposta

---

## Bloco Integral 3 — Conteúdo Original do Relatório v8.5 (sem resumo, sem cortes)

> O conteúdo abaixo replica integralmente o relatório `brain_tech_report_v8.5_proposal.md`.

### Plano de Evolução: Segundo Cérebro v8.5

Este documento consolida o plano original da v8.0 e registra todas as implementações realizadas, transformando o Segundo Cérebro de um assistente reativo em um **ecossistema de agentes executores** com governança, auditoria e gestão completa de tarefas via linguagem natural.

#### ✅ 1. Infraestrutura de Observabilidade e Execução

##### Tabela `brain.execution_logs`

- Auditoria completa de todas as ações dos agentes executores
- Campos: `session_id`, `agent_name`, `action`, `status`, `params`, `result`, `latency_ms`, `cost_est`, `error_message`
- Função `public.log_agent_execution()` com `SECURITY DEFINER` para acesso via `service_role`
- Logging fail-safe em cada RPC (erros no log nunca interrompem a operação principal)

##### Telemetria no `chat-brain`

- Medição de latência por RPC (`performance.now()`)
- Diferenciação entre ações de leitura (`db_query`) e escrita (`EXECUTOR`)
- Injeção automática de `p_session_id` em todas as RPCs de escrita

#### ✅ 2. Agent_Executor — Gestão Completa de Tarefas

O Agent_Executor permite ao usuário gerenciar tarefas do Kanban inteiramente via linguagem natural no chat.

##### 5 RPCs Implementadas

| RPC | Ação | Parâmetros Chave |
|-----|------|-----------------|
| `execute_create_traffic_task` | Criar tarefa | título, descrição, prazo, prioridade, responsável, status |
| `execute_delete_task` | Deletar tarefa | por título ou UUID |
| `execute_move_task` | Mover entre colunas | novo status (backlog → in_progress → approval → done → paused) |
| `execute_update_task` | Atualizar campos | título, descrição, prazo, prioridade, responsável |
| `execute_update_project_status` | Alterar status do projeto | novo status (Ativo, Inativo, Pausado) |

##### Resolução por Nome de Projeto

Todas as RPCs aceitam `p_project_name` como alternativa ao `p_project_id`:

- Busca fuzzy via `ILIKE` na tabela `acceptances.company_name`
- Exemplo: _"Crie uma tarefa no projeto Duarte Vinhos"_ → resolve automaticamente para `project_id = 28`

##### Resolução por Título de Tarefa

As RPCs de delete, move e update aceitam `p_task_title` como alternativa ao `p_task_id`:

- Busca fuzzy via `ILIKE` em `project_tasks.title`
- Filtragem opcional por projeto para maior precisão

##### Status do Kanban

| Coluna (UI) | Valor no DB |
|-------------|------------|
| Backlog | `backlog` |
| Em Execução | `in_progress` |
| Aprovação | `approval` |
| Finalizado | `done` |
| Pausado | `paused` |

#### ✅ 3. LLM Router Aprimorado

##### Exemplos de Escrita no Prompt do Sistema

```
"crie uma tarefa chamada X no projeto Duarte Vinhos" → execute_create_traffic_task
"delete a tarefa Teste Func" → execute_delete_task
"mova a tarefa X para em execução" → execute_move_task
"defina o André como responsável pela tarefa X" → execute_update_task
"marque o projeto Duarte Vinhos como concluído" → execute_update_project_status
```

##### Mapeamento de Status em Português

- "em execução" → `in_progress`
- "aprovação" → `approval`
- "finalizado/concluído/feito" → `done`
- "pausado" → `paused`
- "backlog" → `backlog`

##### Instruções de Execução Direta

O Router foi instruído a **nunca pedir confirmação** para ações de escrita — executa diretamente e reporta o resultado.

#### ✅ 4. Correções Críticas

| Problema | Causa Raiz | Solução |
|----------|-----------|---------|
| JWT inválido na Edge Function | Relay do Supabase rejeitava JWT antes do código | Deploy com `--no-verify-jwt` |
| `v_task_id BIGINT` vs UUID | `project_tasks.id` é UUID, não BIGINT | Corrigido para `v_task_id UUID` |
| `catch {}` syntax error | Deno Edge Runtime não aceita `catch {}` sem variável | Corrigido para `catch (_e) {}` |
| `auth.uid()` retornando NULL | `service_role` não tem `auth.uid()` | Removido do logging |
| Schema `brain` inacessível via RPC | `supabaseAdmin.rpc()` só acessa schema `public` | Wrapper em `public` com `SET search_path` |

#### Arquitetura de Arquivos v8.5

##### Camada de Dados (SQL/Migrations)

- [MODIFY] `20260223000000_v8_0_core.sql`: Schema `brain` com tabela `execution_logs`, Função `public.log_agent_execution()` com `SECURITY DEFINER`
- [MODIFY] `20260223000002_v8_0_executor_tools.sql`: 5 funções SQL: create, delete, move, update_task, update_project_status. Todas com resolução por nome de projeto e logging fail-safe.

##### Backend (Edge Functions)

- [MODIFY] `index.ts`: `dbRpcNames` (5 RPCs de escrita), `availableTools`, `callRouterLLM`, `funcToAgent`, `executorRpcNames`, `executeDbRpc`
- [MODIFY] `router.ts`: `routeRequestHybrid` LLM-first (confidence ≥ 0.7), guardrails pós-LLM

#### Verificação Funcional via Chat

| # | Comando | RPC Esperada | Validação |
|---|---------|-------------|-----------|
| 1 | "Crie uma tarefa chamada 'Revisão' no projeto Duarte Vinhos para 25/02" | `execute_create_traffic_task` | Tarefa no Backlog |
| 2 | "Defina o André como responsável pela tarefa Revisão" | `execute_update_task` | Campo `assignee` preenchido |
| 3 | "Mova a tarefa Revisão para em execução" | `execute_move_task` | Tarefa em "Em Execução" |
| 4 | "Delete a tarefa Revisão do projeto Duarte Vinhos" | `execute_delete_task` | Tarefa removida |
| 5 | "Pause o projeto Duarte Vinhos" | `execute_update_project_status` | Status atualizado |

#### Verificação de Logs

```sql
SELECT action, status, params->>'title' as tarefa, created_at
FROM brain.execution_logs
ORDER BY created_at DESC LIMIT 10;
```

#### Próximos Passos (v9.0) — Propostos na v8.5

1. **Batch Operations**: Operações em lote (deletar todas as tarefas de um status, mover múltiplas tarefas)
2. **Confirmação Inteligente**: Ações destrutivas (delete) pedem confirmação; ações construtivas (create) executam direto
3. **Notificações**: Agente envia notificação ao responsável quando uma tarefa é atribuída
4. **Agendamento Recorrente**: "Crie uma tarefa toda segunda-feira" → integração com calendário
5. **Dashboard de Telemetria**: Visualização das métricas de `execution_logs` no frontend
6. **Agent_Autonomy**: Agente sugere proativamente tarefas com base em padrões detectados

---

## Bloco 4 — Novo Ciclo v8.6: Generative UI Engine + Sanitização de PII

### 4.1 Contexto e Motivação

Ao encerrar o ciclo v8.5, o Segundo Cérebro podia **consultar** dados (RAG + SQL direto) e **executar** ações (criar/editar/deletar tarefas). Porém, a interface do chat era exclusivamente texto — todas as respostas eram parágrafos markdown, sem componentes visuais.

**Problema:** Respostas puramente textuais para listagens grandes (13+ tarefas, 10+ projetos, 8+ propostas) são difíceis de escanear e comparar. Métricas financeiras (MRR, ARR) perdiam impacto sem visualização em cards. Gráficos de distribuição exigiam que o usuário interpretasse tabelas de texto.

**Objetivo v8.6:** Criar uma **Generative UI Engine** completa — um pipeline no qual o backend injeta blocos JSON estruturados na resposta do LLM, e o frontend os intercepta e renderiza como componentes React ricos (cards, gráficos, listas visuais).

---

### 4.2 Arquitetura da GenUI Engine

```
┌──────────────────────────────────────────────────────────────────┐
│  BACKEND (chat-brain/index.ts)                                    │
│                                                                    │
│  1. LLM Router seleciona tool (ex: query_all_tasks)               │
│  2. executeDbRpc() executa a RPC e retorna rawData                │
│  3. GPT-4o gera resposta textual (answer)                         │
│  4. Backend INJETA bloco ```json na answer com tipo e dados       │
│  5. Anti-duplicação: limpa JSONs do LLM antes de injetar          │
│                                                                    │
│  PIPELINE:  LLM gera texto → strip JSONs do LLM → injetar JSON   │
│             oficial do backend → enviar pro frontend               │
└────────────────────────────┬─────────────────────────────────────┘
                             │ resposta com blocos ```json embutidos
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND (GenUIParser.tsx)                                       │
│                                                                    │
│  1. Regex extrai blocos ```json da resposta markdown              │
│  2. JSON.parse() converte cada bloco em objeto                    │
│  3. Switch por data.type renderiza componente React:              │
│     - task_list    → Cards de tarefas com status/badges           │
│     - project_list → Cards de projetos                            │
│     - proposal_list → Cards de propostas                          │
│     - client_list  → Cards de clientes                            │
│     - user_list    → Cards de usuários (sanitizados)              │
│     - access_list  → Cards de acessos (emails mascarados)         │
│     - report       → KPI cards (MRR, ARR)                        │
│     - chart        → Recharts (bar, line, pie)                    │
│     - image_grid   → Galeria de imagens                           │
└──────────────────────────────────────────────────────────────────┘
```

---

### 4.3 Componentes GenUI Implementados

#### 4.3.1 `task_list` — Lista de Tarefas

Cards com:

- Nome do projeto (uppercase) + badge de status colorido (backlog, in_progress, approval, done, paused)
- Badge de "Atrasada" com ícone AlertCircle se `due_date < hoje`
- Título da tarefa + preview da descrição (2 linhas)
- Data de vencimento, responsável e prioridade (Alta/Média/Baixa com cor)

#### 4.3.2 `project_list` — Lista de Projetos

Cards com nome do projeto, tipo de serviço e status.

#### 4.3.3 `proposal_list` — Lista de Propostas

Cards com dados da proposta, valor e status de aceite.

#### 4.3.4 `client_list` — Lista de Clientes

Cards com nome do cliente e informações de contato relevantes.

#### 4.3.5 `user_list` — Lista de Usuários (SANITIZADA)

Cards com:

- Avatar circular com gradiente roxo e inicial do nome
- Nome completo (extraído de `full_name` ou `name`)
- Badge de cargo colorido por tipo (Gestor=indigo, Operacional=amarelo, Cliente=verde, Admin=roxo)
- Último acesso (se disponível)

**Campos removidos (PII):** `id`, `email`, `phone`, `created_at`

#### 4.3.6 `access_list` — Resumo de Acessos (SANITIZADA)

Cards com:

- Avatar circular com gradiente verde-esmeralda e inicial
- Nome extraído do prefixo do email (ex: `andre@c4marketing.com.br` → `Andre`)
- Contagem de acessos
- Data/hora do último acesso

**Campos removidos (PII):** `user_email` (mascarado para nome), `first_access`

#### 4.3.7 `report` — Cards de Métricas Financeiras

Cards com:

- Título da métrica (ex: "Receita Recorrente (MRR)")
- Valor formatado em R$ com `toLocaleString('pt-BR')`
- Ícone de tendência (TrendingUp verde ou TrendingDown vermelho)
- Badge de status e subtítulo

Dados mapeados a partir de `query_financial_summary`:

- `financeRecord.totals.mrr` → Card MRR
- `financeRecord.totals.arr` → Card ARR (ou MRR × 12 como fallback)

#### 4.3.8 `chart` — Gráficos Recharts Dinâmicos

Suporta 3 tipos de gráfico:

- **Bar Chart** (padrão) — barras verticais com eixo Y e tooltip
- **Line Chart** — linhas com pontos
- **Pie Chart** — pizza com cells coloridas

Dados gerados via `query_task_distribution_chart`:

- Chama `query_all_tasks({})` internamente
- Agrupa por campo configurável (`status`, `assignee`, `project_name`)
- Gera `chartData = [{ name: 'STATUS', total: N }, ...]`

#### 4.3.9 `image_grid` — Galeria de Imagens

Grid responsivo para exibição de URLs de imagem em galeria.

---

### 4.4 Pipeline de Sanitização de PII (Proteção de Dados)

O sistema implementa sanitização em **duas camadas**:

#### Camada 1: Pré-LLM (Contexto)

Antes de enviar os dados para o GPT-4o como contexto textual, campos sensíveis são removidos ou mascarados:

```typescript
// query_access_summary: mascarar emails
sanitizedRecordsForPrompt = records.map((r: any) => {
    const email = r.user_email || '';
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return { nome: name, total_acessos: r.total_accesses, ultimo_acesso: r.last_access };
});

// query_all_users: remover PII
sanitizedRecordsForPrompt = records.map((r: any) => ({
    nome: r.full_name || r.name || 'Sem nome',
    cargo: r.role || 'Não definido',
    ultimo_acesso: r.last_access || null,
}));
```

**Objetivo:** O LLM nunca vê emails, telefones ou IDs internos. Assim, não pode mencioná-los na resposta textual.

#### Camada 2: Pós-LLM (JSON Block)

Antes de injetar o bloco JSON do backend, a mesma sanitização é aplicada ao payload:

- `query_all_users` → `user_list` com apenas nome, cargo e último acesso
- `query_access_summary` → `access_list` com nome mascarado, contagem e último acesso

---

### 4.5 Sistema Anti-Duplicação

**Problema:** O LLM (GPT-4o) recebia instruções no System Prompt para gerar blocos JSON, e ao mesmo tempo o backend injetava seu próprio bloco JSON oficial. Resultado: dois componentes idênticos renderizados no frontend.

**Solução:** Antes de injetar o bloco oficial do backend, uma regex limpa qualquer bloco JSON que o LLM tenha gerado:

```typescript
// ANTI-DUPLICAÇÃO: Remover blocos ```json que o LLM já tenha gerado por conta própria
answer = answer.replace(/```json\s*\n[\s\S]*?\n```/g, '').trim();
```

---

### 4.6 Filtros de Prioridade entre RPCs

**Problema:** O LLM frequentemente chamava RPCs redundantes (ex: `query_task_distribution_chart` + `query_all_tasks` ao mesmo tempo). Como `rawDbRecordsForGenUI` é sobrescrita pela última RPC executada, a lista de tarefas substituía o gráfico.

**Solução:** Filtros de prioridade adicionados:

```typescript
// Se pediu gráfico, não precisa da lista de tarefas
const hasTaskChartCall = dbCalls.some((c) => c.rpc_name === 'query_task_distribution_chart')
if (hasTaskChartCall) {
    dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_tasks')
}

// Se pediu access_summary, não precisa da lista genérica de usuários
const hasAccessSummaryCall = dbCalls.some((c) => c.rpc_name === 'query_access_summary')
if (hasAccessSummaryCall) {
    dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_users')
}
```

---

### 4.7 Bugs Críticos Corrigidos na v8.6

| # | Bug | Causa Raiz | Solução |
|---|-----|-----------|---------|
| 1 | MRR e ARR exibidos como R$ 0,00 | `financeRecord.mrr` não existia; valor estava em `financeRecord.totals.mrr` | Acessar `financeRecord.totals.mrr` com fallback |
| 2 | Gráfico de tarefas vazio | `query_all_tasks` era chamado com parâmetro inválido `p_user_role` | Removido o parâmetro |
| 3 | Gráfico de tarefas não aparecia | `query_task_distribution_chart` não estava na whitelist `dbRpcNames` | Adicionado ao Set e ao `funcToAgent` |
| 4 | Lista de tarefas aparecia no lugar do gráfico | LLM chamava `query_all_tasks` + `query_task_distribution_chart`, e a lista sobrescrevia o chart | Filtro de prioridade |
| 5 | Componentes duplicados (duas listas iguais) | LLM gerava JSON + backend injetava JSON | Regex anti-duplicação |
| 6 | Vazamento de PII (emails, telefones, IDs) | `query_all_users` e `query_access_summary` exibiam dados brutos como `unknown_list` | Handlers de sanitização + componentes visuais |
| 7 | LLM mencionava emails no texto | Dados brutos (com emails) eram enviados como contexto textual ao LLM | Sanitização pré-LLM no `executeDbRpc` |
| 8 | Lista de acessos mostrava todos os usuários (não só os de hoje) | LLM chamava `query_access_summary` + `query_all_users` e a lista genérica sobrescrevia | Filtro: access_summary remove query_all_users |

---

### 4.8 Arquivos Modificados no ciclo v8.6

| Arquivo | Tipo | Operação | Descrição |
|---------|------|----------|-----------|
| `components/chat/GenUIParser.tsx` | React/TSX | CRIAR | Parser de blocos JSON em markdown, renderiza 9 tipos de componentes visuais |
| `components/chat/BrainChat.tsx` | React/TSX | MODIFICAR | Integração do GenUIParser no renderer de mensagens do assistente |
| `components/chat/BrainManager.tsx` | React/TSX | MODIFICAR | Integração do GenUIParser no chat do gestor |
| `supabase/functions/chat-brain/index.ts` | TypeScript | MODIFICAR | GenUI injection pipeline, sanitização PII (2 camadas), anti-duplicação, filtros de prioridade, handlers para chart/report/user_list/access_list |

---

### 4.9 Linha do Tempo Completa da Evolução (v1 → v8.6)

| Versão | Nome | Capacidade Principal |
|--------|------|---------------------|
| v1 | Chat RAG | Busca vetorial + filtro anti-eco |
| v2 | Agentic RAG | Router heurístico, 6 agentes, ETL automático |
| v3 | Hybrid Intelligence | Tool use (RAG + SQL direto) |
| v4.1 | Cognitive Agent | Identidade + memória de sessão + cobertura total |
| v4.5 | Semantic Router | LLM Router (Function Calling) + gestão de propostas |
| v5.0 | Resilient Cognitive Router | JWT resiliente + Multi-RPC SQL + resposta composta |
| v6.0 | Cognitive Stabilization | Memória viva cognitiva + guardrails anti-alucinação |
| v6.5 | Normative Governance | NORMATIVE_FIRST + versionamento + canário automático |
| v7.0 | Corporate Canonical Layer | Guardrail corporativo absoluto + controle por cargo |
| v8.0 | Executor Proposal | Plano para agentes executores com auditoria |
| v8.5 | Agent Executor | Gestão completa de tarefas via linguagem natural (5 RPCs) |
| **v8.6** | **Generative UI Engine** | **Componentes visuais no chat + sanitização PII + anti-duplicação** |

---

### 4.10 Especificações Técnicas (v8.6)

- **Modelo de Geração**: GPT-4o
- **Modelo de Roteamento**: GPT-4o-mini (Function Calling, temperature: 0)
- **Modelo de Embedding**: `text-embedding-3-small` (1536 dimensões)
- **Banco de Dados**: PostgreSQL 15 com `pgvector` + `pg_cron`
- **Infraestrutura**: Supabase Edge Functions (Deno)
- **RPCs de leitura**: 8 funções SQL (proposals, clients, projects, tasks, users, access_summary, financial_summary, task_distribution_chart)
- **RPCs de escrita**: 5 funções SQL (create_task, delete_task, move_task, update_task, update_project_status)
- **Componentes GenUI**: 9 tipos (task_list, project_list, proposal_list, client_list, user_list, access_list, report, chart, image_grid)
- **Bibliotecas Frontend**: Recharts (gráficos), Lucide React (ícones), date-fns (formatação de datas)
- **Custo estimado por consulta**: ~$0.004

---

### 4.11 Checklist de Aceite v8.6

- [x] GenUIParser implementado e integrado em BrainChat.tsx e BrainManager.tsx
- [x] 9 tipos de componentes visuais renderizando corretamente
- [x] Pipeline de injeção de JSON no backend operacional
- [x] MRR e ARR exibindo valores reais (não mais R$ 0,00)
- [x] Gráfico de distribuição de tarefas com dados reais do banco (13 tarefas)
- [x] Sanitização de PII em duas camadas (pré-LLM e pós-LLM)
- [x] Anti-duplicação de blocos JSON implementada
- [x] Filtros de prioridade entre RPCs conflitantes
- [x] `query_task_distribution_chart` registrada em `dbRpcNames` e `funcToAgent`
- [x] Componente `user_list` renderizando sem dados sensíveis
- [x] Componente `access_list` renderizando com emails mascarados
- [x] Deploy da Edge Function em produção

---

## Encerramento da v8.6

A v8.6 marca a entrada do Segundo Cérebro na era da **Interface Generativa** — o sistema não apenas responde com texto, mas constrói componentes visuais dinâmicos em tempo real dentro do chat.

O agente agora pode:

1. **Consultar** dados (RAG + SQL direto) — desde v3
2. **Executar** ações (criar/editar/deletar tarefas) — desde v8.5
3. **Visualizar** dados (cards, gráficos, listas visuais) — **v8.6**
4. **Proteger** dados sensíveis (sanitização PII em duas camadas) — **v8.6**

---

## Bloco 5 — Novo Ciclo v8.7: Especialização de Agentes + Guardrails de Domínio + Chat Dedicado de Tráfego

**Sistema "Segundo Cérebro" da C4 Marketing — 25 de Fevereiro de 2026**

Este bloco adiciona ao histórico v8.6 todas as implementações já presentes no código até o momento, com foco em:

1. Especialização profunda dos prompts dos agentes.
2. Criação e endurecimento do fluxo do `Agent_MarketingTraffic`.
3. Chat dedicado de tráfego com histórico segregado e exclusão de conversa.
4. Guardrails de escopo (dados permitidos vs proibidos) no backend e no frontend.
5. Consolidação de capacidades v9.0 já implementadas (batch ops, agendamento recorrente, autonomia e confirmação inteligente).

---

### 5.1 Especialização dos agentes (Prompts de Sistema)

#### 5.1.1 `Agent_Contracts` — especialista contratual sênior

Arquivo: `supabase/functions/_shared/agents/specialists.ts`

Implementado:

- Expansão do prompt para perfil de especialista em análise contratual.
- Método explícito de análise: contrato-base, aditivos, anexos, distratos e conflito entre versões.
- Rigor de datas contratuais (assinatura, vigência, término, renovação, rescisão, aviso prévio, reajuste).
- Regra forte de evidência documental (sem inferência, sem completar lacunas).
- Formato de resposta orientado à rastreabilidade com base documental e limitações.

#### 5.1.2 `Agent_Projects` — especialista em gestão de projetos com Kanban simplificado C4

Arquivo: `supabase/functions/_shared/agents/specialists.ts`

Implementado:

- Prompt reescrito com foco em execução, previsibilidade e riscos.
- Formalização do Kanban simplificado C4 com 5 colunas oficiais:
  - `Backlog`
  - `Em Execução`
  - `Aprovação`
  - `Finalizado`
  - `Pausado`
- Regras para mapear nomenclaturas externas para o fluxo oficial.
- Regras de listagem completa em SQL direto (sem omissões) e distinção entre projeto x campanha.
- Mapeamento explícito de status visual para GenUI (`todo`, `in_progress`, `blocked`, `done`).

#### 5.1.3 `Agent_MarketingTraffic` — especialista em gestão de tráfego pago

Arquivo: `supabase/functions/_shared/agents/specialists.ts`

Implementado:

- Prompt dedicado para estratégia de Google Ads + Meta Ads.
- Método de trabalho estruturado (diagnóstico, estratégia por canal, estrutura operacional, 30/60/90, otimização contínua).
- Obrigatoriedade de relatório executivo pronto para apresentação.
- Guardrail de escopo no prompt:
  - Permitido: clientes, tarefas e questionários/surveys.
  - Proibido: financeiro/comercial (MRR, ARR, faturamento, propostas, pricing, pipeline etc.).
- Regra de não execução de escrita nesse agente (apenas consultivo/estratégico).

---

### 5.2 Chat dedicado do agente de tráfego (Frontend)

Arquivos principais:

- `pages/TrafficAgentChat.tsx`
- `App.tsx`
- `components/Sidebar.tsx`
- `lib/brain.ts`
- `supabase/migrations/20260224123000_add_delete_chat_session_rpc.sql`

Implementado:

1. Nova rota protegida do chat dedicado:
   - `GET /traffic-agent`
   - Perfis permitidos: `admin`, `gestor`, `operacional`.

2. Entrada dedicada no menu lateral:
   - Item "Agente Tráfego" no `Sidebar`.

3. Isolamento de histórico por tipo de sessão:
   - Prefixo canônico: `TrafficAgent:`.
   - Helpers de segregação:
     - `isTrafficSession(...)`
     - `formatTrafficSessionTitle(...)`
     - `buildTrafficSessionTitle(...)`
   - Resultado: sessões do chat de tráfego separadas do `/brain`.

4. Exclusão de conversa do histórico:
   - Botão de excluir por sessão no frontend.
   - RPC `public.delete_chat_session(uuid)` com validação de ownership (`auth.uid() == owner`).

5. Forçador de agente no frontend:
   - `askBrain(..., { forcedAgent: 'Agent_MarketingTraffic' })`.
   - Inclui `forced_agent` no payload para o backend.

6. Renderização alinhada com o `/brain`:
   - Chat de tráfego usa `GenUIParser` como renderer das respostas do assistente.

---

### 5.3 Guardrails de escopo e acesso do agente de tráfego (Backend)

Arquivo principal: `supabase/functions/chat-brain/index.ts`

Implementado:

#### 5.3.1 Forçador de agente com controle de acesso

- Leitura de `forced_agent` na requisição.
- Validação de agente existente no registry `AGENTS`.
- Controle de papéis permitidos por agente forçado:
  - `Agent_MarketingTraffic`: `gestor`, `operacional`, `admin`.
- Falhas explícitas com `status 400/403` + `meta.forced_agent_error`.

#### 5.3.2 Sanitização de chamadas SQL no contexto de tráfego

Whitelist de leitura para `Agent_MarketingTraffic`:

- `query_survey_responses`
- `query_all_clients`
- `query_all_tasks`

Qualquer chamada fora dessa whitelist é removida para esse contexto.

#### 5.3.3 Bloqueio de intenções fora do escopo

Perguntas com intenção financeira/comercial no agente de tráfego são bloqueadas com resposta determinística de escopo restrito.

#### 5.3.4 Bloqueio de escrita no agente de tráfego

Mesmo que o roteador sugira `execute_*`, o backend bloqueia no contexto de tráfego:

- Sem criar, mover, editar ou excluir tarefa nesse chat.
- Retorna resposta consultiva orientando limitação do agente.

#### 5.3.5 Filtros de retrieval para domínio de tráfego

No contexto `Agent_MarketingTraffic`, o retrieval é restringido a:

- `artifact_kind = 'project'`
- `source_table IN ('traffic_projects','project_tasks','acceptances','activity_logs')`
- `type_allowlist` apropriada
- Bloqueio de `chat_log` como fonte factual

---

### 5.4 GenUI no agente de tráfego: comportamento implementado

Arquivo principal: `supabase/functions/chat-brain/index.ts`

Implementado:

1. Detecção de JSON GenUI já gerado pelo LLM (`llmGeneratedGenUi`) para evitar duplicação.
2. Fluxo específico de tráfego priorizando `task_list` quando houver contexto de tarefas.
3. Injeção GenUI automática clássica (project/client/proposal/user/access/report/chart) mantida para contexto não-tráfego.
4. Ajuste semântico para intenção "tarefas em aberto":
   - Evita forçar apenas backlog em inferência suplementar.
   - Filtro de status aberto aplicado no payload quando aplicável.

---

### 5.5 Memória, sessões e robustez de autenticação

Arquivo principal: `lib/brain.ts`

Implementado:

- `ChatBrainPayload` expandido com:
  - `client_today`
  - `client_tz`
  - `forced_agent`
- Refresh proativo de sessão quando chamada usa `forcedAgent`.
- Reuso da política resiliente de JWT para reduzir falha por sessão inconsistente.

---

### 5.6 Capacidades v9.0 já implementadas no core

Embora propostas como próximos passos em versões anteriores, as seguintes entregas já estão no código e no schema atual:

#### 5.6.1 Operações em lote de tarefas

Migration: `20260223000003_v9_0_batch_ops.sql`

- `execute_batch_move_tasks(...)`
- `execute_batch_delete_tasks(...)`
- Validação de status canônicos, resolução por `project_name`, limite de lote e log em `brain.execution_logs`.

#### 5.6.2 Agendamento recorrente de tarefas

Migration: `20260223000005_v9_0_scheduled_tasks.sql`

- Tabela `scheduled_tasks`.
- Função `calculate_next_run(...)`.
- RPC `execute_schedule_task(...)`.
- Runner `run_scheduled_tasks()` para execução por `pg_cron`.

#### 5.6.3 Telemetria e sugestões de autonomia

Migration: `20260223000006_v9_0_telemetry_rpc.sql`

- `query_telemetry_summary(p_days)`.
- `query_autonomy_suggestions(p_project_id)`.

No `chat-brain/index.ts`:

- Após ação do `Agent_Executor`, o sistema consulta sugestões e anexa recomendações proativas à resposta (`Sugestões do Agente Autônomo`).

#### 5.6.4 Confirmação inteligente para ações destrutivas

No `chat-brain/index.ts`:

- `execute_delete_task` e `execute_batch_delete_tasks` exigem confirmação explícita por token semântico (`confirmar`, `sim excluir`, etc.) antes da execução.

#### 5.6.5 Ferramenta `no_action` para saudações/conversa casual

No roteador LLM (`availableTools`):

- Função `no_action` para evitar consulta desnecessária ao banco em mensagens de cumprimento/casual.

---

### 5.7 Dashboard de Telemetria IA (novo componente)

Arquivos principais:

- `pages/BrainTelemetry.tsx` (CRIADO)
- `components/Sidebar.tsx` (item "Telemetria IA" adicionado)
- `supabase/migrations/20260225120000_fix_execution_logs_and_telemetry.sql`
- `supabase/migrations/20260226000000_telemetry_model_breakdown.sql`

#### 5.7.1 Objetivo

Prover ao gestor um cockpit de observabilidade em tempo real sobre a performance dos agentes de IA, incluindo custos de API, taxa de erros, latência e padrões de uso por agente e modelo.

O acesso é restrito à role `gestor`. Qualquer outro perfil é redirecionado para `/dashboard`.

#### 5.7.2 KPIs de Execução (primeira linha de cards)

| KPI | Descrição |
|-----|-----------|
| Total Execuções | Quantidade absoluta de chamadas de agentes no período |
| Taxa de Sucesso | Percentual de execuções com `status = 'success'` |
| Erros | Contagem absoluta + percentual de falhas |
| Latência Média | Média de `latency_ms` em todos os agentes e ações |

#### 5.7.3 KPIs de Tokens e Custo (segunda linha de cards)

| KPI | Fonte |
|-----|-------|
| Tokens Entrada | `sum(tokens_input)` em `brain.execution_logs` |
| Tokens Saída | `sum(tokens_output)` |
| Total de Tokens | `sum(tokens_total)` + média por execução |
| Custo Estimado (USD) | `sum(cost_est)` convertido por modelo |

#### 5.7.4 Gráficos

- **Ações Mais Executadas**: BarChart horizontal com as 8 RPCs mais chamadas, exibindo volume e erros por ação.
- **Execuções por Dia**: BarChart empilhado com stack Sucesso/Erros por data, limitado aos últimos 30 pontos.
- **Detalhamento por Modelo de IA**: PieChart de donut com distribuição de custo por modelo + tabela lateral com tokens_input, tokens_output, tokens_total e custo por modelo.

#### 5.7.5 Tabela de Consumo por Agente

Tabela listando cada `agent_name` com:
- Execuções
- Tokens de Entrada
- Tokens de Saída
- Total de Tokens
- Custo estimado (USD)

Permite identificar quais agentes consomem mais orçamento de API.

#### 5.7.6 Alertas & Sugestões Proativas

Painel de alertas carregado via `query_autonomy_suggestions()` com 3 tipos:

| Tipo | Condição | Ícone |
|------|----------|-------|
| `overdue_task` | Tarefa com `due_date < hoje` e status != done | Vermelho |
| `unassigned_backlog` | Tarefa no backlog sem responsável há > 7 dias | Amarelo |
| `all_tasks_done` | Projeto ativo com 100% das tarefas concluídas | Verde |

#### 5.7.7 Seletor de Período

Botões de período: `7d`, `30d`, `90d`. Atualização sob demanda via botão de refresh com spinner durante carregamento.

#### 5.7.8 Segurança

- Verificação de role `gestor` no backend via `query_telemetry_summary` (SECURITY DEFINER).
- Frontend redireciona para `/dashboard` imediatamente se `userRole !== 'gestor'`.
- Dados de telemetria não são expostos a outras roles por nenhuma RPC.

---

### 5.8 Refatoração da Navegação: Sidebar + DashboardLayout

Arquivos:

- `components/Sidebar.tsx` (CRIADO — substitui navegação inline)
- `components/DashboardLayout.tsx` (CRIADO — layout unificado)

#### 5.8.1 Sidebar colapsável

A sidebar passou a ser um componente dedicado e independente (`Sidebar.tsx`) com:

- **Estado colapsado persistido em `localStorage`** (`sidebar-collapsed`): o gestor pode recolher para 80px ou expandir para 256px; o estado é lembrado entre sessões.
- **Modo desktop**: `sticky top-0 h-screen`, sempre visível.
- **Modo mobile**: Drawer com `fixed inset-0` + `backdrop-blur-sm` + animação de deslizamento (`-translate-x-full` / `translate-x-0`).
- **Tooltips no modo colapsado**: ao passar o mouse sobre um ícone, aparece tooltip com o nome do item.
- **Botão de recolher** (desktop only): Chevron Left / Right na parte inferior da sidebar.

#### 5.8.2 Estrutura de navegação por role

```typescript
const navItems = [
  { label: 'Dashboard',         path: '/dashboard',          roles: ['admin','gestor','operacional','comercial'] },
  { label: 'Segundo Cérebro',   path: '/brain',              roles: ['gestor'],        isIA: true },
  { label: 'Agente Tráfego',    path: '/traffic-agent',      roles: ['admin','gestor','operacional'], isIA: true },
  { label: 'Telemetria IA',     path: '/brain-telemetry',    roles: ['gestor'],        isIA: true },
  { label: 'Propostas',         path: '/proposals',          roles: ['gestor','comercial'] },
  { label: 'Dashboard Fin.',    path: '/commercial-dashboard',roles: ['gestor','comercial'] },
  { label: 'Projetos',          path: '/projects',           roles: ['admin','gestor','operacional'] },
  { label: 'Agenda',            path: '/meetings',           roles: ['admin','gestor','comercial','operacional'] },
  { label: 'Usuários',          path: '/users',              roles: ['gestor'] },
];
```

Itens com `isIA: true` recebem ícone na cor `brand-coral` para destacar os recursos de IA.

#### 5.8.3 Seção de perfil e logout

Na parte inferior da sidebar:
- Avatar do usuário (foto ou iniciais geradas automaticamente).
- Clique no avatar → navega para `/account`.
- Botão de logout (LogOut icon) → chama `supabase.auth.signOut()`.
- No modo colapsado, apenas o avatar é exibido (tooltip com nome ao hover).

#### 5.8.4 DashboardLayout

Componente wrapper que combina:

```tsx
<div className="flex min-h-screen">
  <Sidebar isMobileOpen={...} setIsMobileOpen={...} />
  <div className="flex-1 flex flex-col h-screen overflow-hidden">
    <Header onMenuClick={...} />
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      {children}
    </main>
  </div>
</div>
```

Todas as páginas autenticadas agora usam `DashboardLayout` como wrapper, garantindo consistência de layout e comportamento responsivo.

---

### 5.9 Evolução do Schema de Telemetria (brain.execution_logs)

#### 5.9.1 Novas colunas em brain.execution_logs

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `latency_ms` | INTEGER | Tempo de execução em milissegundos |
| `cost_est` | NUMERIC(10,6) | Custo estimado da chamada em USD |
| `error_message` | TEXT | Mensagem de erro quando status = 'error' |
| `message_id` | TEXT | ID da mensagem de chat associada |
| `user_id` | UUID | Usuário que originou a execução |
| `params` | JSONB | Parâmetros de entrada (inclui `token_usage`, `model_usage`) |
| `result` | JSONB | Resultado retornado pela execução |
| `tokens_input` | INTEGER | Tokens consumidos no prompt |
| `tokens_output` | INTEGER | Tokens gerados na completion |
| `tokens_total` | INTEGER | Soma de input + output |

#### 5.9.2 RPC log_agent_execution (versão definitiva)

Assinatura final (13 parâmetros):

```sql
public.log_agent_execution(
    p_session_id, p_agent_name, p_action, p_status,
    p_params, p_result, p_latency_ms, p_cost_est,
    p_error_message, p_message_id,
    p_tokens_input, p_tokens_output, p_tokens_total
) RETURNS UUID
```

#### 5.9.3 Quebra por modelo de IA

A migration `20260226000000_telemetry_model_breakdown.sql` adiciona a query de breakdown por modelo ao `query_telemetry_summary`, extraindo do campo `params->'model_usage'` a distribuição de tokens e custo por nome de modelo. O resultado é incluído no JSON retornado como `usage_by_model`, alimentando o gráfico de PieChart no `BrainTelemetry.tsx`.

---

### 5.10 Correções Críticas de RLS e Autenticação

#### 5.10.1 Problema: RLS baseado em auth.uid() vs. email

O sistema C4 autentica usuários via Supabase Auth mas a tabela `app_users` é vinculada por email (não por `auth.uid()`). As políticas RLS anteriores faziam join por `user_id = auth.uid()`, o que falhava quando o UUID do Auth não batia com o UUID interno da `app_users`.

#### 5.10.2 Solução: Políticas baseadas em email

```sql
CREATE POLICY "Staff full access" ON public.proposals
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.app_users
            WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'gestor', 'operacional', 'comercial')
        )
    );
```

#### 5.10.3 delete_chat_session RPC

```sql
CREATE OR REPLACE FUNCTION public.delete_chat_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_owner_id uuid;
BEGIN
  SELECT s.user_id INTO v_owner_id FROM brain.chat_sessions s WHERE s.id = p_session_id;
  IF v_owner_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> v_owner_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM brain.chat_sessions WHERE id = p_session_id;
  RETURN true;
END; $$;
```

Garante que apenas o dono da sessão possa excluí-la. No frontend, o botão de exclusão usa double-tap (primeiro clique entra em modo de confirmação vermelho, segundo clique executa a exclusão) com auto-cancelamento após 3 segundos.

---

### 5.11 Melhorias de Tarefas: Autoria, Datas e Timezone

#### 5.11.1 Autoria de tarefas (created_by)

Migration `20260224110000_add_created_by_to_tasks.sql` adiciona o campo `created_by` em `project_tasks`, registrando o usuário que criou cada tarefa.

#### 5.11.2 Due date lock

Tarefas com data de vencimento passada (`due_date < hoje`) não podem ter o `due_date` alterado para uma data ainda mais antiga, evitando manipulação retroativa de prazos.

#### 5.11.3 Name sync

O nome da tarefa é sincronizado automaticamente quando o título é atualizado via interface (KanbanBoard).

#### 5.11.4 Brasilia timezone fix

O fix alinha a referência de data para `now() AT TIME ZONE 'America/Sao_Paulo'` nas RPCs que comparam datas de vencimento e criação de tarefas.

---

### 5.12 Linha do Tempo Consolidada (v1 → v8.7)

| Versão | Nome | Capacidade Principal |
|--------|------|---------------------|
| v1 | Chat RAG | Busca vetorial + filtro anti-eco |
| v2 | Agentic RAG | Router heurístico, 6 agentes, ETL automático |
| v3 | Hybrid Intelligence | Tool use (RAG + SQL direto) |
| v4.1 | Cognitive Agent | Identidade + memória de sessão + cobertura total |
| v4.5 | Semantic Router | LLM Router (Function Calling) + gestão de propostas |
| v5.0 | Resilient Cognitive Router | JWT resiliente + Multi-RPC SQL + resposta composta |
| v6.0 | Cognitive Stabilization | Memória viva cognitiva + guardrails anti-alucinação |
| v6.5 | Normative Governance | NORMATIVE_FIRST + versionamento + canário automático |
| v7.0 | Corporate Canonical Layer | Guardrail corporativo absoluto + controle por cargo |
| v8.0 | Executor Proposal | Plano para agentes executores com auditoria |
| v8.5 | Agent Executor | Escrita operacional no Kanban via linguagem natural |
| v8.6 | Generative UI Engine | GenUI no chat + sanitização PII + anti-duplicação |
| **v8.7** | **Especialização de Domínio + Observabilidade** | **8 agentes especializados, chat dedicado de tráfego, telemetria de IA com custo/modelo, sidebar colapsável, RLS corrigido, tarefas com autoria e timezone** |

---

## Bloco 6 — Novo Ciclo v9.0: Governança de Dados + Rastreamento Operacional + Segurança de Contratos

**Sistema "Segundo Cérebro" da C4 Marketing — 26 de Fevereiro de 2026**

Este bloco documenta as implementações do ciclo v9.0, com foco em:

1. Títulos persistentes de sessões de chat.
2. Credenciais criptografadas de clientes por projeto.
3. Correção arquitetural crítica do trigger de rastreamento de tarefas.
4. Rastreamento automático de tarefas atrasadas e concluídas.
5. Segurança de assinatura de contratos para clientes não autenticados.
6. Melhoria de observabilidade no modal de tarefas.

---

### 6.1 Títulos Persistentes de Sessões de Chat

**Arquivos:**

- `pages/BrainManager.tsx` (MODIFICAR)
- `pages/TrafficAgentChat.tsx` (MODIFICAR)
- `lib/brain.ts` (MODIFICAR)
- `supabase/migrations/20260226200000_add_update_session_title_rpc.sql` (CRIAR)

#### 6.1.1 Contexto e Motivação

Anteriormente, todas as sessões de chat exibiam apenas um timestamp como título no histórico. Isso tornava impossível identificar rapidamente sobre o que cada conversa era, obrigando o usuário a abrir cada sessão para descobrir o contexto.

#### 6.1.2 Implementação

**RPC `update_chat_session_title`:**

```sql
CREATE OR REPLACE FUNCTION public.update_chat_session_title(
  p_session_id uuid,
  p_title      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain
AS $$
BEGIN
  UPDATE brain.chat_sessions
  SET   title = p_title
  WHERE id      = p_session_id
    AND user_id = auth.uid();
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_chat_session_title(uuid, text) TO authenticated;
```

- `SECURITY DEFINER` com validação de `user_id = auth.uid()`: apenas o dono da sessão pode renomear.
- Retorna `true` se a atualização ocorreu, `false` se a sessão não pertence ao usuário.

**Função no `lib/brain.ts`:**

```typescript
export async function updateChatSessionTitle(sessionId: string, title: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('update_chat_session_title', {
        p_session_id: sessionId,
        p_title: title,
    });
    if (error) throw error;
    return data as boolean;
}
```

**Comportamento no `BrainManager` e `TrafficAgentChat`:**

- Após a primeira resposta do assistente, o sistema extrai as primeiras palavras da resposta e usa como título da sessão.
- Chama `updateChatSessionTitle(sessionId, suggestedTitle)` automaticamente (silenciosamente, sem bloquear o chat).
- O título é exibido na lista de histórico de sessões substituindo o timestamp genérico.

---

### 6.2 Credenciais Criptografadas de Projetos

**Arquivos:**

- `supabase/migrations/20260226210000_add_project_credentials.sql` (CRIAR)
- `components/projects/ProjectCredentialsModal.tsx` (CRIAR)
- `pages/Projects.tsx` (MODIFICAR)
- `lib/brain.ts` (MODIFICAR)

#### 6.2.1 Contexto e Motivação

A equipe da C4 precisava de um local seguro para armazenar credenciais de acesso às contas dos clientes (Google Ads, Facebook Business, hospedagem, etc.). As credenciais precisavam ser:

- Acessíveis por toda a equipe staff autenticada.
- Criptografadas em repouso (nunca texto plano no banco).
- Editáveis e recuperáveis via interface simples.
- Ligadas ao projeto (acceptance_id) para rastreabilidade.

#### 6.2.2 Schema e Criptografia

**Tabela `public.project_credentials`:**

```sql
CREATE TABLE IF NOT EXISTS public.project_credentials (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  acceptance_id  bigint      REFERENCES public.acceptances(id) ON DELETE CASCADE UNIQUE NOT NULL,
  credentials_encrypted text,
  updated_by     uuid        REFERENCES auth.users(id),
  updated_at     timestamptz DEFAULT now()
);
```

**Mecanismo de criptografia:**

- Extensão `pgcrypto` (schema `extensions`) com `pgp_sym_encrypt` / `pgp_sym_decrypt`.
- Criptografia simétrica AES com chave configurável.
- Dados armazenados em base64 no campo `credentials_encrypted`.
- A chave nunca trafega no payload cliente — toda cifragem e decifragem ocorre server-side dentro de funções `SECURITY DEFINER`.

**RPCs:**

```sql
-- Salvar/atualizar credenciais (cifra antes de gravar)
CREATE OR REPLACE FUNCTION public.upsert_project_credentials(
  p_acceptance_id bigint,
  p_credentials   text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_key text := 'c4marketingkey2026';
BEGIN
  INSERT INTO public.project_credentials (acceptance_id, credentials_encrypted, updated_by, updated_at)
  VALUES (p_acceptance_id, encode(extensions.pgp_sym_encrypt(p_credentials, v_key), 'base64'), auth.uid(), now())
  ON CONFLICT (acceptance_id) DO UPDATE
    SET credentials_encrypted = EXCLUDED.credentials_encrypted,
        updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$func$;

-- Recuperar credenciais (decifra antes de retornar)
CREATE OR REPLACE FUNCTION public.get_project_credentials(p_acceptance_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_key text := 'c4marketingkey2026'; v_encrypted text;
BEGIN
  SELECT credentials_encrypted INTO v_encrypted FROM public.project_credentials WHERE acceptance_id = p_acceptance_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(decode(v_encrypted, 'base64'), v_key)::text;
END;
$func$;
```

- Acesso concedido a `authenticated` (toda a equipe staff).
- RLS habilitada com política `FOR ALL TO authenticated USING (true) WITH CHECK (true)`.

#### 6.2.3 Interface (ProjectCredentialsModal)

Componente `components/projects/ProjectCredentialsModal.tsx`:

- Abre ao clicar no ícone `KeyRound` na coluna AÇÕES dos Projetos Ativos.
- Carrega as credenciais existentes ao abrir (via `getProjectCredentials`).
- Textarea livre (monospace) para entrada de credenciais em formato livre.
- Badge de aviso amarelo: "Informações confidenciais — visível para toda a equipe autenticada."
- Botão Salvar: chama `upsertProjectCredentials`, exibe feedback de sucesso/erro inline.
- Design: dark/light, rounded-2xl, brand-coral, consistente com TaskModal/KanbanBoardModal.

#### 6.2.4 Integração em `pages/Projects.tsx`

Novo ícone `KeyRound` na coluna AÇÕES de cada projeto (antes do ícone de edição):

```tsx
<button
    onClick={() => setCredentialProject(project)}
    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-brand-coral transition-colors"
    title="Dados de Acesso"
>
    <KeyRound size={16} />
</button>
```

Modal renderizado ao final do JSX:

```tsx
{credentialProject && (
    <ProjectCredentialsModal
        isOpen={!!credentialProject}
        onClose={() => setCredentialProject(null)}
        projectId={credentialProject.id}
        companyName={credentialProject.company_name}
    />
)}
```

#### 6.2.5 Funções em `lib/brain.ts`

```typescript
export async function getProjectCredentials(acceptanceId: number): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_project_credentials', {
        p_acceptance_id: acceptanceId,
    });
    if (error) throw error;
    return data as string | null;
}

export async function upsertProjectCredentials(acceptanceId: number, credentials: string): Promise<void> {
    const { error } = await supabase.rpc('upsert_project_credentials', {
        p_acceptance_id: acceptanceId,
        p_credentials: credentials,
    });
    if (error) throw error;
}
```

---

### 6.3 Correção Arquitetural do Trigger de Rastreamento de Tarefas

**Arquivos:**

- `supabase/migrations/20260226215000_fix_task_tracking_trigger.sql` (CRIAR)

#### 6.3.1 Bug Identificado

A migration `20260226140000_task_tracking_system.sql` criou um **BEFORE INSERT trigger** (`trg_project_tasks_history`) que tentava imediatamente inserir em `task_history` com `task_id = NEW.id`.

**O problema:** Em um BEFORE trigger, a linha em `project_tasks` ainda não existe na tabela. A tabela `task_history` tem uma FK `task_id REFERENCES project_tasks(id)`. Ao tentar inserir um registro em `task_history` referenciando `NEW.id` de uma linha que ainda não foi inserida, o PostgreSQL lançava uma violação de FK, derrubando toda a operação de INSERT/UPDATE em `project_tasks`.

**Sintoma:** Qualquer tentativa de criar ou editar uma tarefa via modal resultava em erro genérico "Erro ao salvar tarefa".

**Root cause resumido:**
```
BEFORE trigger fires → inserts into task_history with task_id = NEW.id
                      → FK check: does project_tasks(id) = NEW.id exist? NO (not yet)
                      → FK violation → entire INSERT rollback
```

#### 6.3.2 Correção: Divisão em Dois Triggers

A solução divide a lógica em dois triggers com responsabilidades distintas:

**Trigger 1 — BEFORE (apenas modifica NEW, sem escrita em outras tabelas):**

```sql
CREATE OR REPLACE FUNCTION public.trg_task_timestamps_fn()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := now();
    END IF;
    IF OLD.status = 'done' AND NEW.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_project_tasks_timestamps
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_timestamps_fn();
```

**Trigger 2 — AFTER (insere em task_history após a linha existir):**

```sql
CREATE OR REPLACE FUNCTION public.trg_task_history_fn()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details)
    VALUES (gen_random_uuid(), NEW.id, NEW.project_id,
      'created', NULL, NEW.status, NEW.created_by, now(),
      jsonb_build_object('title', NEW.title, 'assignee', NEW.assignee,
        'due_date', NEW.due_date, 'priority', NEW.priority));
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_history(id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details)
    VALUES (gen_random_uuid(), NEW.id, NEW.project_id,
      'status_change', OLD.status, NEW.status, NEW.assignee, now(),
      jsonb_build_object('title', NEW.title, 'assignee', NEW.assignee,
        'due_date', NEW.due_date, 'was_overdue', (NEW.overdue_flagged_at IS NOT NULL)));
  END IF;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_project_tasks_history
  AFTER INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_history_fn();
```

**Por que funciona:**
- O BEFORE trigger modifica `NEW` (campos `completed_at`, `overdue_flagged_at`) sem tocar em outras tabelas.
- O AFTER trigger insere em `task_history` quando a linha pai já existe em `project_tasks`, satisfazendo a FK.

#### 6.3.3 Novos Campos em project_tasks

A migration também adiciona (idempotente):

```sql
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS overdue_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz;
```

| Campo | Comportamento |
|-------|--------------|
| `overdue_flagged_at` | Preenchido quando a tarefa se torna atrasada. Nunca limpo — registro permanente do evento de atraso. |
| `completed_at` | Preenchido quando `status → done`. Zerado se a tarefa for reaberta. |

---

### 6.4 Rastreamento Automático de Tarefas Atrasadas

**Arquivos:**

- `supabase/migrations/20260226215000_fix_task_tracking_trigger.sql` (incluído na mesma migration)

#### 6.4.1 `flag_overdue_tasks()`

Função que identifica e registra tarefas que ultrapassaram o prazo:

```sql
CREATE OR REPLACE FUNCTION public.flag_overdue_tasks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today   date    := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_flagged integer := 0;
BEGIN
  UPDATE public.project_tasks
  SET overdue_flagged_at = now()
  WHERE due_date IS NOT NULL
    AND due_date::date < v_today
    AND status != 'done'
    AND overdue_flagged_at IS NULL;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  IF v_flagged > 0 THEN
    INSERT INTO public.task_history(id, task_id, project_id, action,
      old_status, new_status, changed_by, changed_at, details)
    SELECT gen_random_uuid(), pt.id, pt.project_id,
      'overdue_flagged', pt.status, pt.status, 'system', now(),
      jsonb_build_object('title', pt.title, 'due_date', pt.due_date,
        'assignee', pt.assignee, 'days_overdue', (v_today - pt.due_date::date))
    FROM public.project_tasks pt
    WHERE pt.due_date IS NOT NULL
      AND pt.due_date::date < v_today
      AND pt.status != 'done'
      AND pt.overdue_flagged_at::date = now()::date;
  END IF;

  RETURN v_flagged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_overdue_tasks() TO service_role;
```

**Características:**
- `SECURITY DEFINER` para acesso com permissão de superusuário.
- Referência de data em fuso de Brasília (`America/Sao_Paulo`).
- Flag `overdue_flagged_at` é imutável — nunca limpa, mesmo que a tarefa seja concluída depois.
- Retorna contagem de tarefas recém-flagadas.

#### 6.4.2 Agendamento via pg_cron

```sql
SELECT cron.schedule(
  'flag-overdue-tasks-daily',
  '0 9 * * *',  -- 09:00 UTC = 06:00 Brasília
  $$SELECT public.flag_overdue_tasks()$$
);
```

Executa diariamente às 06:00 horário de Brasília, garantindo que o dashboard de telemetria exiba alertas de tarefas atrasadas atualizados.

---

### 6.5 Segurança de Assinatura de Contratos (Clientes Anônimos)

**Arquivos:**

- `supabase/migrations/20260226220000_submit_acceptance_rpc.sql` (CRIAR)
- `pages/ProposalView.tsx` (MODIFICAR)

#### 6.5.1 Bug Identificado

A página `ProposalView` é pública — qualquer cliente acessa via link compartilhado, sem autenticação prévia. Ao tentar finalizar a assinatura do contrato, o frontend fazia um INSERT direto na tabela `acceptances` usando o Supabase client com a chave `anon`.

**O problema:** RLS estava habilitada em `acceptances` com políticas que permitiam apenas usuários `authenticated` (staff com roles específicas). Clientes anônimos (`anon` role) não tinham permissão de INSERT, resultando em erro silencioso na UI: "Ocorreu um erro ao salvar. Tente novamente."

#### 6.5.2 Solução: RPC SECURITY DEFINER para Anônimos

Em vez de abrir a tabela `acceptances` ao acesso anônimo direto, criamos uma RPC `SECURITY DEFINER` que:

1. Valida que o `proposal_id` existe (proteção contra insertion de dados órfãos).
2. Insere na tabela `acceptances` como o dono do banco de dados (contornando RLS).
3. Retorna apenas o `id` do registro criado (sem expor outros dados sensíveis).
4. É concedida tanto ao role `anon` (clientes) quanto `authenticated` (staff).

```sql
CREATE OR REPLACE FUNCTION public.submit_proposal_acceptance(
  p_name              text,
  p_email             text,
  p_cpf               text,
  p_cnpj              text,
  p_company_name      text,
  p_proposal_id       bigint,
  p_contract_snapshot jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = p_proposal_id) THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  INSERT INTO public.acceptances (
    name, email, cpf, cnpj, company_name,
    proposal_id, contract_snapshot, status
  ) VALUES (
    p_name, p_email, p_cpf, p_cnpj, p_company_name,
    p_proposal_id, p_contract_snapshot, 'Ativo'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.submit_proposal_acceptance(text, text, text, text, text, bigint, jsonb)
  TO anon, authenticated;
```

#### 6.5.3 Alteração em `ProposalView.tsx`

Substituição do INSERT direto pelo RPC:

**Antes (falhava por RLS):**
```typescript
const { data: acceptanceData, error } = await supabase
    .from('acceptances')
    .insert([{ name, email, cpf, company_name, cnpj, proposal_id, contract_snapshot, status: 'Ativo' }])
    .select()
    .single();
```

**Depois (contorna RLS via SECURITY DEFINER):**
```typescript
const { data: acceptanceId, error } = await supabase.rpc('submit_proposal_acceptance', {
    p_name: formData.name,
    p_email: formData.email,
    p_cpf: formData.cpf,
    p_cnpj: formData.cnpj,
    p_company_name: formData.companyName,
    p_proposal_id: proposal.id,
    p_contract_snapshot: contractSnapshot,
});

if (error) throw error;
const acceptanceData = { id: acceptanceId as number };
```

O restante do fluxo (criação de `traffic_projects`, criação de usuário cliente via Edge Function) permanece inalterado.

---

### 6.6 Melhoria de Observabilidade no Modal de Tarefas

**Arquivo:** `components/projects/TaskModal.tsx`

#### 6.6.1 Contexto

O modal de tarefas capturava erros do Supabase mas exibia apenas uma mensagem genérica "Erro ao salvar tarefa", impossibilitando o diagnóstico remoto de falhas.

#### 6.6.2 Fix

```typescript
// Antes:
} catch (error) {
    console.error('Error saving task:', error);
    alert('Erro ao salvar tarefa');
}

// Depois:
} catch (error: any) {
    console.error('Error saving task:', error);
    const msg = error?.message || error?.details || JSON.stringify(error);
    alert('Erro ao salvar tarefa:\n' + msg);
}
```

Agora o alert exibe a mensagem real do PostgreSQL (violação de FK, política RLS, coluna inexistente, etc.), facilitando a identificação imediata da causa raiz.

---

### 6.7 Arquivo Completo de Arquivos Impactados no ciclo v9.0

| Arquivo | Tipo | Operação | Descrição |
|---------|------|----------|-----------|
| `supabase/migrations/20260226200000_add_update_session_title_rpc.sql` | SQL | CRIAR | RPC `update_chat_session_title` com validação de ownership |
| `supabase/migrations/20260226210000_add_project_credentials.sql` | SQL | CRIAR | Extensão pgcrypto, tabela `project_credentials`, RPCs `upsert_project_credentials` e `get_project_credentials` |
| `supabase/migrations/20260226215000_fix_task_tracking_trigger.sql` | SQL | CRIAR | Drop trigger quebrado, BEFORE trigger de timestamps, AFTER trigger de histórico, colunas `overdue_flagged_at` e `completed_at`, função `flag_overdue_tasks`, pg_cron job |
| `supabase/migrations/20260226220000_submit_acceptance_rpc.sql` | SQL | CRIAR | RPC `submit_proposal_acceptance` SECURITY DEFINER para clientes anônimos |
| `components/projects/ProjectCredentialsModal.tsx` | TSX | CRIAR | Modal de credenciais criptografadas com textarea livre, feedback inline, dark/light mode |
| `pages/Projects.tsx` | TSX | MODIFICAR | Ícone KeyRound na coluna AÇÕES, estado `credentialProject`, renderização do `ProjectCredentialsModal` |
| `lib/brain.ts` | TS | MODIFICAR | Funções `getProjectCredentials`, `upsertProjectCredentials`, `updateChatSessionTitle` |
| `pages/BrainManager.tsx` | TSX | MODIFICAR | Persistência automática de títulos de sessão após primeira resposta |
| `pages/TrafficAgentChat.tsx` | TSX | MODIFICAR | Persistência automática de títulos de sessão após primeira resposta |
| `pages/ProposalView.tsx` | TSX | MODIFICAR | Substituição de INSERT direto por RPC `submit_proposal_acceptance` |
| `components/projects/TaskModal.tsx` | TSX | MODIFICAR | Erro detalhado no alert (mensagem real do banco) |

---

### 6.8 Bugs Críticos Resolvidos no ciclo v9.0

| # | Bug | Causa Raiz | Solução |
|---|-----|-----------|---------|
| 1 | Criar/editar tarefa falha silenciosamente | BEFORE trigger tentava inserir FK em tabela pai não existente | Split em BEFORE (timestamps) + AFTER (task_history) |
| 2 | Cliente não consegue assinar contrato | RLS em `acceptances` bloqueava INSERT anon | RPC `submit_proposal_acceptance` SECURITY DEFINER |
| 3 | Erro de tarefa genérico sem diagnóstico | Alert exibia mensagem hardcoded sem detalhe do banco | Alert com `error.message` real |
| 4 | Sessões de chat sem títulos identificáveis | Nenhuma lógica de título implementada | `update_chat_session_title` RPC + auto-update após 1ª resposta |

---

### 6.9 Linha do Tempo Consolidada (v1 → v9.0)

| Versão | Nome | Capacidade Principal |
|--------|------|---------------------|
| v1 | Chat RAG | Busca vetorial + filtro anti-eco |
| v2 | Agentic RAG | Router heurístico, 6 agentes, ETL automático |
| v3 | Hybrid Intelligence | Tool use (RAG + SQL direto) |
| v4.1 | Cognitive Agent | Identidade + memória de sessão + cobertura total |
| v4.5 | Semantic Router | LLM Router (Function Calling) + gestão de propostas |
| v5.0 | Resilient Cognitive Router | JWT resiliente + Multi-RPC SQL + resposta composta |
| v6.0 | Cognitive Stabilization | Memória viva cognitiva + guardrails anti-alucinação |
| v6.5 | Normative Governance | NORMATIVE_FIRST + versionamento + canário automático |
| v7.0 | Corporate Canonical Layer | Guardrail corporativo absoluto + controle por cargo |
| v8.0 | Executor Proposal | Plano para agentes executores com auditoria |
| v8.5 | Agent Executor | Escrita operacional no Kanban via linguagem natural |
| v8.6 | Generative UI Engine | GenUI no chat + sanitização PII + anti-duplicação |
| v8.7 | Especialização de Domínio + Observabilidade | 8 agentes especializados, chat de tráfego, telemetria IA, RLS email-based |
| **v9.0** | **Governança de Dados + Segurança Operacional** | **Credenciais criptografadas, trigger fix FK, assinatura anônima via RPC, títulos de sessão, rastreamento de atrasos** |

---

### 6.10 Checklist de Aceite v9.0

**Títulos de Sessão:**
- [x] RPC `update_chat_session_title` criada com validação de ownership.
- [x] `BrainManager.tsx` persiste título após primeira resposta do assistente.
- [x] `TrafficAgentChat.tsx` persiste título após primeira resposta do assistente.
- [x] Função `updateChatSessionTitle` adicionada ao `lib/brain.ts`.

**Credenciais de Projetos:**
- [x] Extensão `pgcrypto` habilitada no schema `extensions`.
- [x] Tabela `project_credentials` criada com FK para `acceptances`.
- [x] RPC `upsert_project_credentials` com criptografia `pgp_sym_encrypt`.
- [x] RPC `get_project_credentials` com decifragem `pgp_sym_decrypt`.
- [x] Ambas as RPCs com `SECURITY DEFINER` e `SET search_path = public`.
- [x] `ProjectCredentialsModal.tsx` criado com design consistente.
- [x] Ícone `KeyRound` na coluna AÇÕES de `Projects.tsx`.
- [x] Funções no `lib/brain.ts` para getProjectCredentials e upsertProjectCredentials.

**Trigger de Rastreamento:**
- [x] Trigger BEFORE quebrado (`trg_project_tasks_history`) dropado.
- [x] BEFORE trigger `trg_project_tasks_timestamps` criado (apenas timestamps em NEW).
- [x] AFTER trigger `trg_project_tasks_history` criado (task_history com FK válida).
- [x] Colunas `overdue_flagged_at` e `completed_at` adicionadas idempotentemente.
- [x] Função `flag_overdue_tasks()` criada com timezone Brasília.
- [x] pg_cron job agendado para 06:00 Brasília diariamente.

**Assinatura de Contratos:**
- [x] RPC `submit_proposal_acceptance` criada com `SECURITY DEFINER`.
- [x] Validação de `proposal_id` existente antes do INSERT.
- [x] GRANT para `anon` e `authenticated`.
- [x] `ProposalView.tsx` usa RPC em vez de INSERT direto.

**Observabilidade de Tarefas:**
- [x] `TaskModal.tsx` exibe mensagem de erro real do banco no alert.

---

## 7. Próximos Passos Recomendados (v9.1+)

### 7.1 Notificações Push e Proativas

O sistema já tem `query_autonomy_suggestions()` retornando alertas de tarefas atrasadas e backlogs sem responsável. O próximo passo é transformar esses alertas em notificações proativas:

- **Canal push**: Supabase Realtime para notificações em tempo real no frontend.
- **Canal email**: Trigger no `pg_cron` chamando função de e-mail via Resend/SendGrid quando tarefa atrasar.
- **Canal chat**: Agent_Autonomy enviando mensagens proativas no início do dia com resumo de pendências.
- **Notificações no Sidebar**: Badge contador de alertas pendentes no ícone de Telemetria IA.

Referência de schema: `20260223000004_v9_0_notifications.sql` (já criada, pendente de ativação de canal).

### 7.2 Componentes GenUI Adicionais

| Componente | Descrição | Trigger no prompt |
|------------|-----------|------------------|
| `survey_list` | Lista visual de respostas de questionário com campos expandíveis | Perguntas sobre briefing/survey |
| `kanban_board` | Visualização completa do Kanban C4 via chat (5 colunas) | "mostre o quadro de projetos" |
| `timeline` | Linha do tempo de marcos e entregas de projeto | Perguntas sobre cronograma |
| `metric_grid` | Grid de métricas de campanha (CPC, CTR, ROAS, conversões) | Agent_MarketingTraffic com dados de performance |
| `contract_card` | Card visual de resumo de contrato com status e datas-chave | Agent_Contracts para detalhes de contrato |

### 7.3 Agent_Autonomy: Sugestões Contextuais Inteligentes

Evoluir o sistema para sugestões baseadas em padrões detectados:

- Após `execute_create_task`, sugerir responsável com base em histórico de assignees do projeto.
- Após listagem de projetos com muitas tarefas em `Aprovação`, sugerir revisão do backlog.
- Detectar padrão de perguntas repetidas e sugerir criar um relatório recorrente.
- Identificar agente mais consultado por semana e sugerir painel customizado.

### 7.4 Agent_MarketingTraffic: Integração com Dados de Performance

Hoje o `Agent_MarketingTraffic` trabalha apenas com dados de questionário/survey. A próxima evolução é integrar dados reais de performance de campanhas:

- Nova tabela `campaign_metrics` com CPC, CTR, ROAS, conversões por período.
- RPC `query_campaign_performance(p_project_id, p_date_range)`.
- Componente GenUI `metric_grid` para exibição visual dos resultados.
- Comparativo semana a semana / mês a mês com delta de performance.
- Guardrail: dados de performance visíveis apenas para `gestor` e `operacional`.

### 7.5 Chave de Criptografia Configurável por Ambiente

A chave de criptografia de credenciais está atualmente hardcoded na função SQL. Para produção robusta:

- Armazenar chave em `app.credentials_key` via `ALTER DATABASE postgres SET "app.credentials_key" = 'chave-forte';`.
- Atualizar RPCs para usar `current_setting('app.credentials_key', true)` com fallback.
- Processo de rotação de chave: re-encriptar todos os registros com nova chave antes de invalidar a antiga.

### 7.6 Chat Multi-Sessão com Contexto Compartilhado

Permitir que o gestor compartilhe uma sessão de chat com outro membro da equipe:

- Campo `shared_with` em `brain.chat_sessions` (array de user_ids).
- Políticas RLS atualizadas para permitir leitura por usuários com quem a sessão foi compartilhada.
- UI: botão "Compartilhar conversa" com seletor de usuários.

### 7.7 Telemetria Avançada: Métricas de Qualidade de Resposta

Adicionar feedback do usuário à telemetria:

- Botões de thumbs up/down em cada resposta do assistente.
- `brain.response_feedback` com `session_id`, `message_id`, `rating`, `comment`.
- Correlação de feedback com `agent_name` para identificar agentes com baixa satisfação.
- Dashboard de qualidade por agente (NPS IA).

### 7.8 Agendamento Recorrente: Ativação do Runner

A tabela `scheduled_tasks` e as RPCs `execute_schedule_task` / `run_scheduled_tasks` já estão criadas. O próximo passo é ativar o runner:

```sql
SELECT cron.schedule(
    'run-scheduled-tasks',
    '*/5 * * * *',  -- a cada 5 minutos
    $$SELECT public.run_scheduled_tasks()$$
);
```

### 7.9 Hardening de Segurança

- **Audit log imutável**: Tabela append-only `brain.audit_trail` para todas as ações de escrita do `Agent_Executor`.
- **Rate limiting por usuário**: Limite de N requisições por minuto por `user_id` na Edge Function `chat-brain`.
- **Sanitização de prompt injection**: Detectar e bloquear tentativas de injeção de instruções no prompt do usuário.
- **Revisão de LGPD**: Exportação de dados pessoais por usuário e processo de exclusão conforme LGPD Art. 18.

---

## Encerramento da v9.0

A v9.0 consolida o Segundo Cérebro como uma **plataforma de inteligência operacional madura**, resolvendo falhas estruturais de segurança e dados que impediam o uso em produção:

1. **Consultar** dados (RAG + SQL direto) — desde v3
2. **Executar** ações (criar/editar/deletar tarefas) — desde v8.5
3. **Visualizar** dados (cards, gráficos, listas visuais) — desde v8.6
4. **Proteger** dados sensíveis (sanitização PII, criptografia de credenciais) — **v8.6 + v9.0**
5. **Rastrear** operações (histórico de tarefas, atrasos, concluídas) — **v9.0**
6. **Assinar** contratos publicamente (clientes anônimos via RPC segura) — **v9.0**
7. **Lembrar** contexto entre sessões (títulos persistentes) — **v9.0**

O sistema está pronto para operar como backbone operacional da C4 Marketing, sustentando tanto o fluxo comercial (proposta → aceite → projeto) quanto o fluxo operacional (tarefas, acompanhamento, telemetria de IA) em uma única plataforma integrada.
