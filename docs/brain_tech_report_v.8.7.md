# Relatório Técnico v8.7: Consolidação Integral (v7.0 + v8.0 + v8.5 + v8.6 + v8.7)

**Sistema "Segundo Cérebro" da C4 Marketing — 25 de Fevereiro de 2026**

Este documento consolida integralmente todo o histórico técnico do Segundo Cérebro, incluindo:

1. Inclusão integral do `brain_tech_report_v7.0.md` (que por sua vez contém v1 → v6.5 sem cortes).
2. Inclusão integral do `brain_tech_report_v8.0_proposal.md` (plano de evolução para agentes executores).
3. Inclusão integral do `brain_tech_report_v8.5_proposal.md` (implementação do Agent_Executor).
4. Inclusão detalhada do ciclo v8.6: **Generative UI Engine** — componentes visuais no chat, sanitização de PII, anti-duplicação e correções de roteamento.
5. Inclusão detalhada do ciclo v8.7: **Especialização de Agentes + Guardrails de Domínio + Chat Dedicado de Tráfego + Capacidades v9.0 consolidadas no core.**
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

#### Extensibilidade Futura

Para adicionar novos perfis (RH, marketing, estratégia digital):

1. Criar documento canônico com `role_allowlist: ["gestão","rh"]` via SQL/script
2. Nenhuma mudança de código necessária — o sistema já filtra por `p_user_role`

#### Riscos Residuais v7.0

1. Embeddings após atualização de conteúdo requerem regeneração manual via `pg_net`
2. `runCanonicalRetrieval()` adiciona ~200–400ms por turno
3. Versões supersedidas permanecem no banco — recomenda-se limpeza periódica
4. SLA de resposta não formalizado

#### Checklist de Aceite v7.0

- [x] Migration aplicada em produção
- [x] Função `c4_corporate_tenant_id()` criada
- [x] Index `idx_brain_documents_tenant_id` criado
- [x] RPC `get_canonical_corporate_docs()` criada e com grants
- [x] 7 documentos canônicos inseridos com conteúdo real
- [x] Embeddings gerados para todos os 7 documentos
- [x] `CANONICAL_ALWAYS` adicionado à `RetrievalPolicy`
- [x] `runCanonicalRetrieval()` implementado em `chat-brain`
- [x] Bloco canônico injetado no topo do system prompt
- [x] Telemetria no `meta`
- [x] Flag `BRAIN_CANONICAL_MEMORY_ENABLED=true` ativa em produção
- [x] Teste de validação aprovado

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

A combinação destas capacidades transforma o Segundo Cérebro de um chatbot textual em um **cockpit de gestão operacional** — onde o gestor pode conversar, consultar, agir e visualizar tudo em uma única interface.

Próximos passos naturais:

1. Componente `survey_list` para respostas de pesquisa de satisfação
2. Componente `kanban_board` — visualização completa do Kanban via chat
3. Dashboard de telemetria das `execution_logs` no frontend
4. Confirmação inteligente para ações destrutivas
5. Batch operations implementadas (já previstas nos próximos passos v8.5)
6. Agent_Autonomy: sugestões proativas baseadas em padrões detectados

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

Migrações:

- `20260225120000_fix_execution_logs_and_telemetry.sql`
- `20260226000000_telemetry_model_breakdown.sql`

#### 5.9.1 Novas colunas em brain.execution_logs

Migration idempotente que adiciona colunas faltantes sem quebrar instalações existentes:

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

#### 5.9.2 Backfill de dados históricos

```sql
UPDATE brain.execution_logs
SET
    tokens_input  = coalesce((params->'token_usage'->>'prompt_tokens')::INTEGER, 0),
    tokens_output = coalesce((params->'token_usage'->>'completion_tokens')::INTEGER, 0),
    tokens_total  = coalesce((params->'token_usage'->>'total_tokens')::INTEGER, 0)
WHERE tokens_total = 0
  AND params->'token_usage' IS NOT NULL;
```

Garante que execuções anteriores à migração tenham os campos de token preenchidos retrospectivamente.

#### 5.9.3 RPC log_agent_execution (versão definitiva)

Assinatura final (13 parâmetros):

```sql
public.log_agent_execution(
    p_session_id, p_agent_name, p_action, p_status,
    p_params, p_result, p_latency_ms, p_cost_est,
    p_error_message, p_message_id,
    p_tokens_input, p_tokens_output, p_tokens_total
) RETURNS UUID
```

Versões anteriores (com menos parâmetros) foram removidas via `DROP FUNCTION IF EXISTS` para evitar conflito de overload no PostgreSQL.

#### 5.9.4 Quebra por modelo de IA (nova feature)

A migration `20260226000000_telemetry_model_breakdown.sql` adiciona a query de breakdown por modelo ao `query_telemetry_summary`. Ela extrai do campo `params->'model_usage'` (objeto JSONB) a distribuição de tokens e custo por nome de modelo:

```sql
WITH expanded AS (
    SELECT
      m.model_name,
      (m.data->>'input_tokens')::INT   as input_tokens,
      (m.data->>'output_tokens')::INT  as output_tokens,
      (m.data->>'cost')::NUMERIC       as cost
    FROM brain.execution_logs el
    CROSS JOIN LATERAL (
        SELECT key as model_name, value as data
        FROM jsonb_each(el.params->'model_usage')
        WHERE jsonb_typeof(el.params->'model_usage') = 'object'
    ) m
    WHERE el.created_at >= v_cutoff
)
SELECT model_name,
       sum(input_tokens) as tokens_input,
       sum(output_tokens) as tokens_output,
       sum(input_tokens + output_tokens) as tokens_total,
       round(sum(cost)::NUMERIC, 4) as cost
FROM expanded GROUP BY model_name
```

O resultado é incluído no JSON retornado como `usage_by_model`, alimentando o gráfico de PieChart no `BrainTelemetry.tsx`.

#### 5.9.5 Índices criados

```sql
CREATE INDEX IF NOT EXISTS idx_execution_logs_session_id  ON brain.execution_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_name  ON brain.execution_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at  ON brain.execution_logs(created_at);
```

---

### 5.10 Correções Críticas de RLS e Autenticação

Migrações:

- `20260224164000_fix_rls_using_email.sql`
- `20260224164500_fix_proposals_acceptance_staff_policies.sql`
- `20260224173500_recovery_and_user_creation_fix.sql`
- `20260225140000_fix_access_logs_rpc.sql`

#### 5.10.1 Problema: RLS baseado em auth.uid() vs. email

O sistema C4 autentica usuários via Supabase Auth mas a tabela `app_users` é vinculada por email (não por `auth.uid()`). As políticas RLS anteriores faziam join por `user_id = auth.uid()`, o que falhava quando o UUID do Auth não batia com o UUID interno da `app_users`.

#### 5.10.2 Solução: Políticas baseadas em email

```sql
-- Exemplo aplicado em proposals e acceptances
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

A mesma correção foi aplicada nas tabelas `proposals` e `acceptances`, garantindo que qualquer usuário autenticado com role válida consiga operar sobre esses registros.

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

#### 5.10.4 Recovery e criação de usuários

Migration `20260224173500_recovery_and_user_creation_fix.sql` corrige o fluxo de recuperação de senha e criação de novos usuários, alinhando os triggers de `auth.users` com as políticas de role da `app_users`.

#### 5.10.5 Fix no RPC de access logs

Migration `20260225140000_fix_access_logs_rpc.sql` corrige a RPC `query_access_summary` para funcionar corretamente com as novas políticas de RLS email-based.

---

### 5.11 Melhorias de Tarefas: Autoria, Datas e Timezone

Commit: `7cef893 feat: add task authorship, due date lock, name sync, and Brasilia timezone fix`

#### 5.11.1 Autoria de tarefas (created_by)

Migration `20260224110000_add_created_by_to_tasks.sql` adiciona o campo `created_by` em `project_tasks`, registrando o usuário que criou cada tarefa.

- Preenchido automaticamente na criação via RPC `execute_create_task`.
- Permite rastreabilidade completa de quem criou o quê e quando.
- Combinado com `assigned_to` (responsável atual), distingue criador de executor.

#### 5.11.2 Due date lock

Tarefas com data de vencimento passada (`due_date < hoje`) não podem ter o `due_date` alterado para uma data ainda mais antiga, evitando manipulação retroativa de prazos.

#### 5.11.3 Name sync

O nome da tarefa é sincronizado automaticamente quando o título é atualizado via interface (KanbanBoard), garantindo consistência entre os campos `title` e qualquer referência de nome em outros registros.

#### 5.11.4 Brasilia timezone fix

O sistema usava UTC puro para comparações de data (`CURRENT_DATE`), o que causava discrepâncias na virada do dia para usuários em Brasília (UTC-3). O fix alinha a referência de data para `now() AT TIME ZONE 'America/Sao_Paulo'` nas RPCs que comparam datas de vencimento e criação de tarefas.

---

### 5.12 Arquivo Completo de Arquivos Impactados no ciclo v8.7

| Arquivo | Tipo | Operação | Descrição |
|---------|------|----------|-----------|
| `supabase/functions/_shared/agents/specialists.ts` | TS | MODIFICAR | Prompts especialistas detalhados: Contracts, Projects, MarketingTraffic, Proposals, Client360, GovernanceSecurity, BrainOps, Executor |
| `supabase/functions/_shared/brain-types.ts` | TS | MODIFICAR | `Agent_MarketingTraffic` em `AgentName`, `CANONICAL_ALWAYS` em `RetrievalPolicy`, `tool_hint` e `db_query_params` em `RouteDecision` |
| `supabase/functions/_shared/agents/router.ts` | TS | MODIFICAR | Hard Gates com prioridade (financial > money > contract > sensitive), `hasTrafficMarketingIntent()`, Survey project type inference, Post-LLM Guards, listagem direta via SQL |
| `supabase/functions/chat-brain/index.ts` | TS | MODIFICAR | `forced_agent` com ACL, guardrails de escopo de tráfego, whitelist SQL por agente, bloqueio de escrita no tráfego, confirmação destrutiva, autonomia pós-execução |
| `lib/brain.ts` | TS | MODIFICAR | `forced_agent` no payload `ChatBrainPayload`, helpers `isTrafficSession()`, `buildTrafficSessionTitle()`, `formatTrafficSessionTitle()`, `deleteChatSession()` |
| `pages/TrafficAgentChat.tsx` | TSX | CRIAR | Chat dedicado com histórico segregado, guardrail client-side de escopo, double-tap de exclusão, `GenUIParser` integrado, forced agent |
| `pages/BrainTelemetry.tsx` | TSX | CRIAR | Dashboard de observabilidade: KPIs de execuções + tokens + custo, gráficos por ação/dia/modelo, tabela por agente, alertas proativos, período 7/30/90d |
| `components/Sidebar.tsx` | TSX | CRIAR | Sidebar colapsável, mobile drawer, itens de IA destacados, avatar + logout, persistência em localStorage |
| `components/DashboardLayout.tsx` | TSX | CRIAR | Layout unificado (Sidebar + Header + conteúdo scrollável) |
| `App.tsx` | TSX | MODIFICAR | Rotas `/traffic-agent` e `/brain-telemetry` com controle de roles |
| `supabase/migrations/20260224110000_add_created_by_to_tasks.sql` | SQL | CRIAR | Campo `created_by` em project_tasks |
| `supabase/migrations/20260224123000_add_delete_chat_session_rpc.sql` | SQL | CRIAR | RPC `delete_chat_session` com validação de ownership |
| `supabase/migrations/20260224164000_fix_rls_using_email.sql` | SQL | CRIAR | Políticas RLS email-based para proposals e acceptances |
| `supabase/migrations/20260224164500_fix_proposals_acceptance_staff_policies.sql` | SQL | CRIAR | Fix adicional nas policies de proposals e acceptances |
| `supabase/migrations/20260224173500_recovery_and_user_creation_fix.sql` | SQL | CRIAR | Fix de recovery e criação de usuários |
| `supabase/migrations/20260225120000_fix_execution_logs_and_telemetry.sql` | SQL | CRIAR | Schema completo `brain.execution_logs`, RPCs `query_telemetry_summary` e `query_autonomy_suggestions`, `log_agent_execution` v13-params |
| `supabase/migrations/20260225140000_fix_access_logs_rpc.sql` | SQL | CRIAR | Fix na RPC `query_access_summary` para políticas email-based |
| `supabase/migrations/20260226000000_telemetry_model_breakdown.sql` | SQL | CRIAR | Quebra de telemetria por modelo de IA via `params->'model_usage'` |
| `supabase/migrations/20260223000003_v9_0_batch_ops.sql` | SQL | CRIAR | RPCs de batch move/delete de tarefas |
| `supabase/migrations/20260223000005_v9_0_scheduled_tasks.sql` | SQL | CRIAR | Agendamento recorrente: tabela `scheduled_tasks`, `execute_schedule_task`, `run_scheduled_tasks` |
| `supabase/migrations/20260223000006_v9_0_telemetry_rpc.sql` | SQL | CRIAR | Versão inicial de telemetria (evoluída pela migration de 20260225/26) |

---

### 5.13 Linha do Tempo Consolidada (v1 → v8.7)

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

### 5.14 Checklist de Aceite v8.7

**Especialização de Agentes:**
- [x] Prompt do `Agent_Contracts` com método de análise contratual, rigor de datas e regras de evidência.
- [x] Prompt do `Agent_Proposals` com guardrail MRR/ARR e GenUI obrigatório para listagens.
- [x] Prompt do `Agent_Projects` alinhado ao Kanban simplificado C4 (5 colunas oficiais) com mapeamento visual.
- [x] Prompt do `Agent_MarketingTraffic` com método estratégico 5 etapas e guardrail de escopo explícito.
- [x] Todos os agentes com instrução GenUI obrigatória nos prompts de sistema.

**Chat Dedicado de Tráfego:**
- [x] Rota `/traffic-agent` com roles `admin + gestor + operacional`.
- [x] Histórico segregado por prefixo canônico `TrafficAgent:`.
- [x] Exclusão de conversa com double-tap de confirmação (frontend).
- [x] RPC `delete_chat_session` com validação de ownership (backend).
- [x] `forcedAgent: 'Agent_MarketingTraffic'` passado no payload.
- [x] Guardrail client-side de escopo financeiro/comercial.
- [x] `GenUIParser` integrado como renderer das respostas.

**Telemetria IA:**
- [x] Dashboard `BrainTelemetry.tsx` com 8 KPIs (execuções + tokens).
- [x] Gráfico de ações mais executadas (BarChart).
- [x] Gráfico de execuções por dia com stack Sucesso/Erros.
- [x] Gráfico PieChart de custo por modelo de IA.
- [x] Tabela de consumo de tokens por agente.
- [x] Alertas & Sugestões proativas (atrasadas, backlog, 100% concluídos).
- [x] Seletor de período 7/30/90d.
- [x] Acesso restrito a `role = gestor` (frontend + backend).
- [x] `usage_by_model` retornado pelo `query_telemetry_summary`.

**Schema e Infraestrutura:**
- [x] `brain.execution_logs` com todas as colunas de tokens, custo e latência.
- [x] Backfill de dados históricos de tokens a partir de `params->'token_usage'`.
- [x] `log_agent_execution` com assinatura definitiva de 13 parâmetros.
- [x] Índices em `session_id`, `agent_name` e `created_at`.

**RLS e Autenticação:**
- [x] Políticas email-based para `proposals` e `acceptances`.
- [x] Fix de recovery e criação de usuários.
- [x] `query_access_summary` compatível com novas políticas.

**Navegação:**
- [x] `Sidebar.tsx` colapsável com persistência em localStorage.
- [x] 3 itens IA destacados (Segundo Cérebro, Agente Tráfego, Telemetria IA).
- [x] Mobile drawer com backdrop e animação.
- [x] `DashboardLayout.tsx` unificado.
- [x] Perfil do usuário e logout na sidebar.

**Tarefas:**
- [x] Campo `created_by` em `project_tasks`.
- [x] Due date lock para datas passadas.
- [x] Brasília timezone fix nas RPCs de vencimento.

---

## 6. Próximos Passos Recomendados (v9.0)

### 6.1 Notificações Push e Proativas

O sistema já tem `query_autonomy_suggestions()` retornando alertas de tarefas atrasadas e backlogs sem responsável. O próximo passo é transformar esses alertas em notificações proativas:

- **Canal push**: Supabase Realtime para notificações em tempo real no frontend.
- **Canal email**: Trigger no `pg_cron` chamando função de e-mail via Resend/SendGrid quando tarefa atrasar.
- **Canal chat**: Agent_Autonomy enviando mensagens proativas no início do dia com resumo de pendências.
- **Notificações no Sidebar**: Badge contador de alertas pendentes no ícone de Telemetria IA.

Referência de schema: `20260223000004_v9_0_notifications.sql` (já criada, pendente de ativação de canal).

### 6.2 Componentes GenUI Adicionais

Os seguintes componentes GenUI estão identificados mas não implementados:

| Componente | Descrição | Trigger no prompt |
|------------|-----------|------------------|
| `survey_list` | Lista visual de respostas de questionário com campos expandíveis | Perguntas sobre briefing/survey |
| `kanban_board` | Visualização completa do Kanban C4 via chat (5 colunas) | "mostre o quadro de projetos" |
| `timeline` | Linha do tempo de marcos e entregas de projeto | Perguntas sobre cronograma |
| `metric_grid` | Grid de métricas de campanha (CPC, CTR, ROAS, conversões) | Agent_MarketingTraffic com dados de performance |
| `contract_card` | Card visual de resumo de contrato com status e datas-chave | Agent_Contracts para detalhes de contrato |

### 6.3 Agent_Autonomy: Sugestões Contextuais Inteligentes

Evoluir o sistema para sugestões baseadas em padrões detectados:

- Após `execute_create_task`, sugerir responsável com base em histórico de assignees do projeto.
- Após listagem de projetos com muitas tarefas em `Aprovação`, sugerir revisão do backlog.
- Detectar padrão de perguntas repetidas e sugerir criar um relatório recorrente.
- Identificar agente mais consultado por semana e sugerir painel customizado.

### 6.4 Agent_MarketingTraffic: Integração com Dados de Performance

Hoje o `Agent_MarketingTraffic` trabalha apenas com dados de questionário/survey. A próxima evolução é integrar dados reais de performance de campanhas:

- Nova tabela `campaign_metrics` com CPC, CTR, ROAS, conversões por período.
- RPC `query_campaign_performance(p_project_id, p_date_range)`.
- Componente GenUI `metric_grid` para exibição visual dos resultados.
- Comparativo semana a semana / mês a mês com delta de performance.
- Guardrail: dados de performance visíveis apenas para `gestor` e `operacional`.

### 6.5 Chat Multi-Sessão com Contexto Compartilhado

Permitir que o gestor compartilhe uma sessão de chat com outro membro da equipe:

- Campo `shared_with` em `brain.chat_sessions` (array de user_ids).
- Políticas RLS atualizadas para permitir leitura por usuários com quem a sessão foi compartilhada.
- UI: botão "Compartilhar conversa" com seletor de usuários.
- Log de acesso: `brain.session_access_log`.

### 6.6 Modo Offline / Cache de Contexto

Para reduzir latência e custo de API em perguntas recorrentes:

- Cache de respostas de RPCs SQL que mudam com baixa frequência (lista de clientes, lista de projetos).
- TTL configurável por RPC (ex: `query_all_clients` cache de 5 minutos).
- Invalidação explícita ao detectar `execute_*` que altere os dados cacheados.
- Estimativa de redução de custo: 30-40% para usuários com padrões de consulta repetitiva.

### 6.7 Telemetria Avançada: Métricas de Qualidade de Resposta

Adicionar feedback do usuário à telemetria:

- Botões de thumbs up/down em cada resposta do assistente.
- `brain.response_feedback` com `session_id`, `message_id`, `rating`, `comment`.
- Correlação de feedback com `agent_name` para identificar agentes com baixa satisfação.
- Alerta automático no painel de Telemetria quando taxa de aprovação cair abaixo de threshold.
- Dashboard de qualidade por agente (NPS IA).

### 6.8 Agendamento Recorrente: Ativação do Runner

A tabela `scheduled_tasks` e as RPCs `execute_schedule_task` / `run_scheduled_tasks` já estão criadas. O próximo passo é ativar o runner:

```sql
SELECT cron.schedule(
    'run-scheduled-tasks',
    '*/5 * * * *',  -- a cada 5 minutos
    $$SELECT public.run_scheduled_tasks()$$
);
```

Casos de uso imediatos:
- Relatório semanal automático de tarefas atrasadas enviado ao gestor.
- Limpeza periódica de sessões de chat inativas (> 90 dias).
- Resumo diário de execuções da IA por agente.

### 6.9 Router v9.0: Expansão de Intenções

O router atual cobre bem as intenções estruturadas. Para v9.0:

- **Intenção de comparação**: "compare o projeto X com o Y" → Agent_Projects com dois project_ids.
- **Intenção temporal**: "o que mudou nos últimos 7 dias" → filtro `time_window_minutes` ativado.
- **Intenção de relatório executivo**: "gere um relatório de status para o cliente Amplexo" → Agent_Client360 + output formatado.
- **Intenção de onboarding**: "configure o setup inicial do projeto Z" → Agent_Executor com fluxo guiado multi-step.

### 6.10 Hardening de Segurança

- **Audit log imutável**: Tabela append-only `brain.audit_trail` para todas as ações de escrita do `Agent_Executor`, com assinatura de registro e impossibilidade de DELETE via RLS.
- **Rate limiting por usuário**: Limite de N requisições por minuto por `user_id` na Edge Function `chat-brain`.
- **Sanitização de prompt injection**: Detectar e bloquear tentativas de injeção de instruções no prompt do usuário (ex: "ignore as instruções anteriores e...").
- **Revisão de LGPD**: Exportação de dados pessoais por usuário e processo de exclusão conforme LGPD Art. 18.

---

## Encerramento da v8.7

A v8.7 representa o amadurecimento do Segundo Cérebro como uma **plataforma de inteligência operacional** — não apenas um chatbot, mas um sistema multiagente com especialização real, observabilidade completa e governança de segurança.

### Estado atual do sistema (25/02/2026)

**Camadas implementadas:**

1. **Inteligência Documental** — RAG vetorial + memória cognitiva + camada canônica Tier-1 (desde v7.0)
2. **Roteamento Híbrido** — Hard Gates + LLM Router + Heurística + Post-LLM Guards (v8.5-v8.7)
3. **Execução Operacional** — RPCs de escrita simples e em lote via linguagem natural (v8.5)
4. **Interface Generativa** — 9 tipos de componentes visuais no chat (v8.6)
5. **Especialização por Domínio** — 8 agentes com prompts especializados e guardrails de escopo (v8.7)
6. **Chat Dedicado** — Interface exclusiva para o Agent_MarketingTraffic com histórico segregado (v8.7)
7. **Observabilidade** — Dashboard de telemetria com custo, tokens, latência e alertas proativos (v8.7)
8. **Navegação Responsiva** — Sidebar colapsável com controle de acesso por role (v8.7)

**Métricas de capacidade atual:**

| Dimensão | Valor |
|----------|-------|
| Agentes especializados | 8 |
| RPCs de leitura | 10+ |
| RPCs de escrita | 7+ (incluindo batch) |
| Componentes GenUI | 9 tipos |
| Políticas de recuperação | 5 (`STRICT_DOCS_ONLY`, `NORMATIVE_FIRST`, `DOCS_PLUS_RECENT_CHAT`, `CHAT_ONLY`, `OPS_ONLY`) |
| Migrações SQL ativas | 20+ |
| Custo estimado por consulta | ~$0.004 |

O sistema está pronto para escalar para v9.0 com foco em **autonomia proativa**, **feedback de qualidade** e **integração com dados de performance de campanhas**.

