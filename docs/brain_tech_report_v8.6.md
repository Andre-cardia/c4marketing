# Relatório Técnico v8.6: Consolidação Integral (v7.0 + v8.0 + v8.5 + GenUI Engine)

**Sistema "Segundo Cérebro" da C4 Marketing — 24 de Fevereiro de 2026**

Este documento consolida integralmente todo o histórico técnico do Segundo Cérebro, incluindo:

1. Inclusão integral do `brain_tech_report_v7.0.md` (que por sua vez contém v1 → v6.5 sem cortes).
2. Inclusão integral do `brain_tech_report_v8.0_proposal.md` (plano de evolução para agentes executores).
3. Inclusão integral do `brain_tech_report_v8.5_proposal.md` (implementação do Agent_Executor).
4. Inclusão detalhada do novo ciclo v8.6: **Generative UI Engine** — componentes visuais no chat, sanitização de PII, anti-duplicação e correções de roteamento.

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
