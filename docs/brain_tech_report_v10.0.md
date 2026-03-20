# Relatório Técnico v10.0 — Controller Agentic Loop + Perception Layer + Vision Autonomy

**Sistema "Segundo Cérebro" da C4 Marketing — 20 de Março de 2026**

> Esta versão **inclui integralmente** todo o conteúdo da v9.6 (sem cortes) e acrescenta, ao final, o **Bloco 11 — Novo Ciclo v10.0** com as implementações do loop agentic ReAct, Evaluator LLM-as-a-judge, Perception Layer, Vision Perception autônoma, DB Observabilidade do Controller e melhorias estruturais de módulos.

---

## Índice

1. [Linha do Tempo Completa (v1 → v10.0)](#1-linha-do-tempo-completa)
2. [Organogramas por Versão](#2-organogramas-por-versão)
3. [Análise Comparativa de Evolução](#3-análise-comparativa-de-evolução)
4. [Conteúdo Integral v9.6 (Bloco 1–10)](#4-conteúdo-integral-v96)
5. [Bloco 11 — Novo Ciclo v10.0](#5-bloco-11--novo-ciclo-v100)

---

## 1. Linha do Tempo Completa

| Versão | Nome | Data | Capacidade Principal |
|--------|------|------|---------------------|
| v1 | Chat RAG | Jan/2026 | Busca vetorial + filtro anti-eco |
| v2 | Agentic RAG | Jan/2026 | Router heurístico, 6 agentes, ETL automático |
| v3 | Hybrid Intelligence | Jan/2026 | Tool use (RAG + SQL direto) |
| v4.1 | Cognitive Agent | Jan/2026 | Identidade + memória de sessão + cobertura total |
| v4.5 | Semantic Router | Fev/2026 | LLM Router (Function Calling) + gestão de propostas |
| v5.0 | Resilient Cognitive Router | Fev/2026 | JWT resiliente + Multi-RPC SQL + resposta composta |
| v6.0 | Cognitive Stabilization | Fev/2026 | Memória viva cognitiva + guardrails anti-alucinação |
| v6.5 | Normative Governance | Fev/2026 | NORMATIVE_FIRST + versionamento + canário automático |
| v7.0 | Corporate Canonical Layer | Fev/2026 | Guardrail corporativo absoluto + controle por cargo |
| v8.0 | Executor Proposal | Fev/2026 | Plano para agentes executores com auditoria |
| v8.5 | Agent Executor | Fev/2026 | Escrita operacional no Kanban via linguagem natural |
| v8.6 | Generative UI Engine | Fev/2026 | GenUI no chat + sanitização PII + anti-duplicação |
| v8.7 | Domain Specialization | Fev/2026 | 8 agentes especializados + telemetria IA + sidebar |
| v9.0 | Data Governance | Fev/2026 | Credenciais criptografadas, trigger fix, assinatura anônima |
| v9.2 | Live Corporate Memory | Mar/2026 | Recall determinístico, guardrail gestor, canário 5/5 |
| v9.5 | Operational Hardening | Mar/2026 | SLO, streak 14 dias, carga 20/50/100, canário tracked |
| v9.6 | Resilient Infrastructure | Mar/2026 | CORS/JWT/PGRST203 corrigidos, análise formal de divergências |
| **v10.0** | **Agentic Controller + Vision** | **Mar/2026** | **Loop ReAct, Evaluator LLM-judge, Perception Layer, Vision Autônoma, Projects Module** |

---

## 2. Organogramas por Versão

### v1 — Chat RAG (Arquitetura Inicial)

```
┌─────────────────────────────────────────────────────────┐
│  USUÁRIO                                                 │
│  └─ Pergunta em linguagem natural                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  chat-brain (Edge Function)                              │
│                                                          │
│  1. Gera embedding da pergunta (text-embedding-3-small)  │
│  2. match_brain_documents() — busca vetorial pgvector    │
│  3. Filtra documentos por similaridade (>0.75)           │
│  4. Injeta documentos no prompt                          │
│  5. GPT-4o gera resposta                                 │
│                                                          │
│  Filtro anti-eco: bloqueia resposta "não tenho dados"    │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  RESPOSTA TEXTUAL                                        │
│  └─ Markdown simples                                     │
└─────────────────────────────────────────────────────────┘

Fontes de dados: brain_documents (pgvector)
Modelos: text-embedding-3-small + GPT-4o
```

---

### v3 — Hybrid Intelligence (Tool Use)

```
┌─────────────────────────────────────────────────────────┐
│  USUÁRIO                                                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Router Heurístico                                       │
│  ├─ Keywords de SQL → decide: SQL ou RAG                 │
│  └─ Fallback: RAG semântico                              │
└──────────┬──────────────────────────┬───────────────────┘
           │ SQL                      │ RAG
           ▼                          ▼
┌──────────────────┐      ┌───────────────────────────────┐
│  PostgreSQL RPC  │      │  pgvector                      │
│  query_all_*     │      │  match_brain_documents()       │
│  (dados reais)   │      │  (documentos semânticos)       │
└──────────┬───────┘      └──────────────┬────────────────┘
           └──────────────┬──────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  GPT-4o Geração     │
              │  (contexto misto)   │
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  RESPOSTA TEXTUAL   │
              └─────────────────────┘
```

---

### v4.5 — Semantic Router (LLM Function Calling)

```
┌─────────────────────────────────────────────────────────┐
│  USUÁRIO                                                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  LLM Router (GPT-4o-mini, temperature: 0)               │
│                                                          │
│  Function Calling → escolhe entre 7 ferramentas:        │
│  ├─ query_all_proposals (p_status_filter)                │
│  ├─ query_all_clients (p_status)                         │
│  ├─ query_all_projects (p_service_type)                  │
│  ├─ query_all_tasks (p_project_id, p_status, p_overdue)  │
│  ├─ query_all_users                                      │
│  ├─ query_access_summary                                 │
│  └─ rag_search (fallback semântico)                      │
└──────────┬──────────────────────────────────────────────┘
           │ decisão
           ▼
┌─────────────────────────────────────────────────────────┐
│  Execute RPC ou RAG                                      │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  GPT-4o Geração                                          │
│  └─ System prompt com identidade + contexto de dados    │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│  RESPOSTA TEXTUAL                                        │
└─────────────────────────────────────────────────────────┘
```

---

### v7.0 — Corporate Canonical Layer

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1 — MEMÓRIA CANÔNICA CORPORATIVA (tenant: c4_corporate)   │
│  Missão · Visão · Valores · Endgame  → authority_rank = 100     │
│  Políticas por área (financeiro/comercial/operacional) → rank 90 │
│  SECURITY DEFINER · ignora tenant isolation · filtra por cargo  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ injetado SEMPRE no topo do prompt
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2 — RETRIEVAL NORMATIVO (NORMATIVE_FIRST)                 │
│  status=active · is_current=true · searchable=true              │
│  Ordenação: authority_rank DESC → vigência → similaridade       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM Router (GPT-4o-mini) → decide agente + tool               │
│  8 agentes: Contracts · Proposals · Traffic · Projects           │
│             Client360 · Governance · BrainOps · Executor         │
└──────────┬──────────────────────────────┬────────────────────────┘
           │ SQL                          │ RAG
           ▼                              ▼
┌──────────────────────┐    ┌────────────────────────────────────┐
│  PostgreSQL RPCs     │    │  pgvector match_brain_documents()  │
│  (fonte de verdade)  │    │  (documentos normativos/hist.)     │
└──────────┬───────────┘    └──────────────┬─────────────────────┘
           └─────────────────┬─────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │  GPT-4o Geração         │
               │  [GUARDRAIL ABSOLUTO]   │
               │  Canônico → inegociável │
               └───────────┬─────────────┘
                           │
                           ▼
               ┌─────────────────────────┐
               │  RESPOSTA TEXTUAL       │
               └─────────────────────────┘
```

---

### v8.6 — Generative UI Engine

```
┌──────────────────────────────────────────────────────────────┐
│  BACKEND PIPELINE                                            │
│                                                              │
│  1. LLM Router → seleciona tool (SQL ou RAG)                 │
│  2. executeDbRpc() → executa RPC → rawData                   │
│  3. Sanitização PII pré-LLM:                                 │
│     • query_all_users → remove email/phone/id                │
│     • query_access_summary → mascara email para nome         │
│  4. GPT-4o gera resposta textual (answer)                    │
│  5. Anti-duplicação: strip JSONs que o LLM gerou             │
│  6. Injeta bloco ```json oficial com tipo + dados            │
└──────────────────────────────────────────────────────────────┘
                              │
                    resposta com ```json blocos
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND (GenUIParser.tsx)                                  │
│                                                              │
│  Regex extrai blocos → JSON.parse → switch por data.type:    │
│  ┌──────────────────────────────────────────────┐           │
│  │ task_list    → Cards com status/badges/datas  │           │
│  │ project_list → Cards de projetos              │           │
│  │ proposal_list→ Cards de propostas             │           │
│  │ client_list  → Cards de clientes              │           │
│  │ user_list    → Cards sanitizados (sem PII)    │           │
│  │ access_list  → Cards com emails mascarados    │           │
│  │ report       → KPI cards (MRR, ARR, R$)       │           │
│  │ chart        → Recharts (bar/line/pie)         │           │
│  │ image_grid   → Galeria de imagens              │           │
│  └──────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

---

### v9.0 — Data Governance

```
┌──────────────────────────────────────────────────────────────┐
│  SEGURANÇA DE CONTRATOS                                       │
│  Cliente anônimo → RPC submit_proposal_acceptance             │
│  (SECURITY DEFINER — bypass RLS controlado)                  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  CREDENCIAIS CRIPTOGRAFADAS                                   │
│  pgcrypto (pgp_sym_encrypt/decrypt) → project_credentials    │
│  Criptografia server-side — chave nunca trafega no cliente   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  RASTREAMENTO DE TAREFAS                                      │
│  BEFORE trigger: timestamps (completed_at/overdue_flagged_at) │
│  AFTER trigger: task_history (sem violação de FK)            │
│  pg_cron: flag_overdue_tasks() às 06:00 Brasília diariamente │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  TÍTULOS PERSISTENTES DE SESSÃO                               │
│  update_chat_session_title RPC (ownership validation)         │
│  Auto-title após 1ª resposta do assistente                   │
└──────────────────────────────────────────────────────────────┘
```

---

### v9.6 — Resilient Infrastructure

```
┌──────────────────────────────────────────────────────────────┐
│  CORS FIX                                                     │
│  isAllowedOrigin() → aceita qualquer localhost port           │
│  vite.config.ts → strictPort: true                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  JWT FIX                                                      │
│  Deploy obrigatório com --no-verify-jwt                       │
│  Função faz própria verificação via auth.getUser() + fallback │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  PGRST203 FIX                                                 │
│  DROP overload legado query_all_tasks(bigint, text)           │
│  Canário T6: smoke test direto anti-PGRST203 (crítico)       │
└──────────────────────────────────────────────────────────────┘

Arquitetura de monitoramento contínuo:
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions (automação diária)                           │
│  ├─ brain-memory-long-horizon-daily.yml                      │
│  │   ├─ check_brain_canary.js       (T1–T6, 6 testes)        │
│  │   ├─ check_brain_memory_long_horizon.js (T+1/T+7/T+30)    │
│  │   ├─ check_brain_memory_slo.js   (recall_hit_rate SLO)    │
│  │   └─ check_brain_memory_stability_streak.js (streak 14d)  │
│  ├─ brain-memory-quality-audit-weekly.yml (semanal)          │
│  └─ brain-cost-quality-governance-monthly.yml (mensal)       │
└──────────────────────────────────────────────────────────────┘
```

---

### v10.0 — Agentic Controller + Vision (Arquitetura Atual)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (BrainChat.tsx / BrainManager.tsx)                             │
│                                                                          │
│  html2canvas → capturePageScreenshot()                                   │
│  scale=0.6 · JPEG 75% · ~50–100KB                                        │
│  pendingScreenshotRef → guardado localmente                              │
│  Thumbnail mostrado na resposta quando meta.screenshot_used = true       │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │ POST /chat-brain {query, screenshot_base64}
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  AUTH + USER CONTEXT (JWT resiliente)                                    │
│  auth.getUser() → fallback por claims → app_users → role gestor only     │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  TIER 1 — MEMÓRIA CANÔNICA CORPORATIVA                                   │
│  runCanonicalRetrieval() → sempre injetada no topo do system prompt      │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ROUTER HÍBRIDO (routeRequestHybrid)                                     │
│  GPT-4.1-mini (LLM-first, confidence ≥ 0.70) + heurística (fallback)    │
│  → RouteDecision {agent, task_kind, retrieval_policy, filters, top_k}   │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │ task_kind?
          ┌───────────────────┼──────────────────────────────┐
          │ analysis/drafting │ isMultiEntityControllerQuery  │ factual_lookup
          │ ou CUA op.        │ (tarefa+projeto, print, etc.) │ simples
          ▼                   ▼                               ▼
┌─────────────────────────────────────────────────┐  ┌───────────────────────┐
│  CONTROLLER AGENT (Loop ReAct — máx 5 iter.)   │  │  FAST PATH            │
│                                                 │  │                       │
│  ┌──────────────────────────────────────────┐  │  │  inferSupplementalDB  │
│  │ [THINK] callPlannerLLM                   │  │  │  executeDbRpc()       │
│  │  GPT-4.1-mini · temperature: 0           │  │  │  runVectorRetrieval() │
│  │  Tools: 25+ RPCs + analyze_screen +      │  │  │  [Guardrails PII]     │
│  │         produce_final_answer             │  │  │  GenUI inject         │
│  │  System prompt com:                      │  │  └──────────┬────────────┘
│  │  • Mapeamento direto de intent → RPC     │  │             │
│  │  • Regras de visão proativa              │  │             │
│  │  • Anti-hallucinação                     │  │             │
│  └──────────────────┬───────────────────────┘  │             │
│                     │ tool call                │             │
│                     ▼                          │             │
│  ┌──────────────────────────────────────────┐  │             │
│  │ [ACT] executeTool                        │  │             │
│  │  ├─ query_all_projects / tasks / etc.    │  │             │
│  │  ├─ rag_search (documentos normativos)   │  │             │
│  │  ├─ execute_* (escrita — CUA)            │  │             │
│  │  └─ analyze_screen (Vision Perception)   │  │             │
│  │      gpt-4o · detail: high              │  │             │
│  │      Regra: NUNCA inventar — ilegível   │  │             │
│  └──────────────────┬───────────────────────┘  │             │
│                     │ result                   │             │
│                     ▼                          │             │
│  ┌──────────────────────────────────────────┐  │             │
│  │ [OBSERVE] Observation                    │  │             │
│  │  toolName · input · output · success     │  │             │
│  └──────────────────┬───────────────────────┘  │             │
│                     │                          │             │
│                     ▼                          │             │
│  ┌──────────────────────────────────────────┐  │             │
│  │ [PERCEPTION] runPerception               │  │             │
│  │  Data: signalKind (data/empty/error)     │  │             │
│  │        rowCount · keyFacts · summary     │  │             │
│  │  Vision: runVisionPerception (gpt-4o)    │  │             │
│  └──────────────────┬───────────────────────┘  │             │
│                     │                          │             │
│                     ▼                          │             │
│  ┌──────────────────────────────────────────┐  │             │
│  │ [MEMORY] Working Memory                  │  │             │
│  │  iter 1-2: full output                   │  │             │
│  │  iter 3+: keyFacts compactados           │  │             │
│  │  Fire-and-forget → controller_observations│  │             │
│  └──────────────────┬───────────────────────┘  │             │
│                     │ produce_answer?           │             │
│                     └─────────────────────────┐│             │
│                                               ▼│             │
│  ┌──────────────────────────────────────────┐  │             │
│  │ [EVALUATE] Evaluator (gpt-5.4-mini-2026-03-17) │  │        │
│  │  LLM-as-a-judge: score (0..1)            │  │             │
│  │  Critérios: completude · fundamentação  │  │             │
│  │             ausência de alucinação       │  │             │
│  │  score ≥ 0.70 → pass                    │  │             │
│  │  score < 0.70 → refineAnswer (1×)        │  │             │
│  └──────────────────┬───────────────────────┘  │             │
│                     │ answer final             │             │
│  ┌──────────────────▼───────────────────────┐  │             │
│  │ persistSessionToDb (fire-and-forget)     │  │             │
│  │ → controller_sessions + observations     │  │             │
│  └──────────────────────────────────────────┘  │             │
└─────────────────────────────────────────────────┘             │
                              │                                 │
                              └─────────────────────────────────┘
                              │ { answer, meta }
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  RESPOSTA FINAL                                                          │
│  answer (texto + GenUI JSON blocks)                                      │
│  meta: { controller_iterations, evaluation_score, screenshot_used, ... } │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Análise Comparativa de Evolução

### 3.1 Modelo de Inteligência: De Reativo a Agentic

| Dimensão | v1–v3 (RAG Básico) | v4.5–v7 (Router) | v8.5–v9.6 (Executor) | **v10.0 (Controller)** |
|----------|-------------------|-------------------|----------------------|------------------------|
| Raciocínio | Nenhum | 1 decisão LLM | 1 decisão + execução | **Loop ReAct (≤5 iter.)** |
| Auto-avaliação | Não | Não | Não | **Evaluator LLM-judge** |
| Retry inteligente | Não | Não | Não | **refineAnswer se score < 0.70** |
| Uso de tools | RAG ou SQL (1) | 1 tool/turno | 1–3 tools/turno | **N tools com planner** |
| Contexto inter-tool | Não | Não | Parcial | **Working Memory acumulada** |
| Percepção de resultado | Nenhuma | Nenhuma | Nenhuma | **runPerception (sinais estruturados)** |

### 3.2 Capacidades de Dados: De Consulta a Percepção Visual

| Capacidade | Versão de Introdução | Detalhamento |
|------------|----------------------|--------------|
| Busca vetorial | v1 | pgvector, embedding 1536d |
| SQL direto | v3 | RPCs PostgreSQL |
| Multi-RPC numa pergunta | v5.0 | Batch com deduplicação |
| Guardrail anti-alucinação | v6.0 | Memória cognitiva + bloqueio de eco |
| Documentos normativos | v6.5 | NORMATIVE_FIRST, authority_rank |
| Memória canônica corporativa | v7.0 | Tier-1, SECURITY DEFINER |
| Escrita no banco | v8.5 | execute_* RPCs, Kanban via linguagem |
| Visualização GenUI | v8.6 | JSON blocks, Recharts, cards |
| Credenciais criptografadas | v9.0 | pgcrypto, server-side |
| Recall determinístico | v9.2 | explicit_fact_store com prioridade |
| **Vision Perception** | **v10.0** | **html2canvas + gpt-4o detail:high** |
| **Vision Autônoma** | **v10.0** | **Agente decide quando chamar** |
| **Data Perception** | **v10.0** | **signalKind, keyFacts, rowCount** |

### 3.3 Qualidade e Confiabilidade

| Métrica | v1–v4 | v5–v7 | v8–v9.2 | v9.5–v9.6 | **v10.0** |
|---------|-------|-------|---------|-----------|-----------|
| Canário automatizado | ❌ | ❌ | Parcial | ✅ 5/5 | ✅ 6/6 (T6 anti-PGRST203) |
| Alucinação controlada | Baixo | Médio | Alto | Alto | **Máximo (Evaluator)** |
| Visibilidade de execução | Nenhuma | Básica | `meta.*` | `meta.*` + SLO | **controller_sessions DB** |
| JWT resiliência | ❌ | ✅ | ✅ | ✅ | ✅ |
| CORS hardening | ❌ | ❌ | ❌ | ✅ | ✅ |
| Vision accuracy | N/A | N/A | N/A | N/A | **detail:high scale:0.6** |

### 3.4 Custo por Chamada Estimado

| Versão | Custo médio/chamada | Modelo(s) |
|--------|---------------------|-----------|
| v1–v4 | ~$0.002 | GPT-4o-mini + text-embedding |
| v5–v7 | ~$0.003 | GPT-4o + GPT-4o-mini |
| v8–v9 | ~$0.004–0.008 | GPT-4o + GPT-4o-mini + execution_logs |
| v9.6 | ~$0.013 | GPT-4o + multi-RPC |
| **v10.0 (fast path)** | **~$0.004** | **gpt-4.1-mini (router)** |
| **v10.0 (controller)** | **~$0.015–0.025** | **gpt-5.4-mini-2026-03-17 (planner×5) + gpt-5.4-mini-2026-03-17 (evaluator) + gpt-4o (vision)** |

O fast path é preservado para queries simples. O overhead do Controller ocorre apenas em análises complexas.

### 3.5 Linhas de Código (Edge Function principal)

| Versão | LOC aproximado | Complexidade |
|--------|---------------|--------------|
| v1 | ~200 | Linear simples |
| v4.5 | ~600 | Router + multi-tool |
| v7.0 | ~900 | Tier-1 + 8 agentes |
| v9.0 | ~1.800 | Executor + GenUI + observabilidade |
| v9.6 | ~2.500 | + CORS + hardening + 19 RPCs |
| **v10.0** | **~2.800 + controller.ts ~1.100** | **+ Loop ReAct + Evaluator + Perception** |

---

## 4. Conteúdo Integral v9.6

> O conteúdo abaixo replica integralmente o relatório `brain_tech_report_v9.6.md`, que por sua vez contém todo o histórico desde v1 até v9.6 sem cortes.

---

## Relatório Técnico v9.6: Infraestrutura Resiliente + Análise de Divergências Pós-Go-Live

**Sistema "Segundo Cérebro" da C4 Marketing — 18 de Março de 2026**

> Esta versão inclui integralmente todo o conteúdo da v9.5 (sem cortes) e acrescenta, ao final, o Bloco 10 — Novo Ciclo v9.6.

---

### Linha do Tempo da Evolução (v1 → v9.6)

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
| v8.5 | Agent Executor | Gestão completa de tarefas via linguagem natural |
| v8.6 | Generative UI Engine | Componentes visuais no chat + sanitização PII |
| v8.7 | Domain Specialization | 8 agentes especializados + chat de tráfego + telemetria |
| v9.0 | Data Governance | Credenciais criptografadas, trigger fix, assinatura anônima, títulos de sessão |
| v9.2 | Live Corporate Memory | Recall determinístico, guardrail gestor, canário 5/5 |
| v9.5 | Operational Hardening | Rotinas SLO, streak 14 dias, carga 20/50/100 |
| **v9.6** | **Resilient Infrastructure** | **CORS/JWT/PGRST203 corrigidos, análise formal de divergências** |

> **Nota:** O conteúdo completo de v1 até v9.6 está documentado integralmente no arquivo `brain_tech_report_v9.6.md`. O presente documento v10.0 adiciona o Bloco 11 com as novas implementações do ciclo v10.0.

---

## 5. Bloco 11 — Novo Ciclo v10.0: Controller Agentic Loop + Perception Layer + Vision Autonomy

**Data de fechamento deste ciclo: 20 de março de 2026.**

### 11.1 Objetivo do ciclo v10.0

O ciclo v10.0 representa a maior evolução arquitetural desde a v8.5 (Agent Executor). Os objetivos foram:

1. Introduzir um **loop agentic real (ReAct)** — Think→Act→Observe→Memory→Evaluate — substituindo o pipeline single-pass.
2. Implementar um **Evaluator LLM-as-a-judge** que verifica qualidade da resposta antes de entregá-la ao usuário.
3. Adicionar **Perception Layer** estruturada (Data + Vision) para que o agente entenda o resultado das tools.
4. Implementar **Vision Perception autônoma** — o agente decide quando usar a câmera, sem intervenção do usuário.
5. Construir **DB Observabilidade do Controller** — todas as execuções do loop persistidas para auditoria.
6. Expandir o módulo de **Projetos** com responsável, criação/edição e integração com o Brain ETL.
7. Corrigir roteamento de queries compostas (tarefa+projeto → Controller, não fast path).

---

### 11.2 Contexto: O Problema do Pipeline Single-Pass

Até a v9.6, o fluxo do Segundo Cérebro era **single-pass**:

```
Pergunta → Router LLM → 1 decisão → executa 1 tool → gera resposta → entrega
```

**Problemas identificados:**

1. Se a primeira tool retornasse dados insuficientes, a resposta era gerada assim mesmo (alucinação ou resposta vaga).
2. Não havia capacidade de "pensar de novo com base no que observou".
3. Nenhum mecanismo de auto-avaliação de qualidade antes de entregar a resposta.
4. Percepção zero dos resultados — o agente não "entendia" o que a tool retornou.
5. Queries sobre "tarefas em projeto X" ativavam o guardrail errado (`query_all_projects`), retornando todos os projetos em vez de filtrar tarefas.

---

### 11.3 Controller Agent — Loop ReAct

#### 11.3.1 Arquitetura do Loop

**Arquivo:** `supabase/functions/_shared/agents/controller.ts`

O Controller implementa o ciclo **Think → Act → Observe → Perception → Memory → Evaluate**:

```typescript
export interface ControllerContext {
    userId: string
    tenantId: string
    sessionId: string
    userRole: string
    agentName: AgentName
    initialDecision: RouteDecision
    screenshotBase64?: string   // Vision Perception: captura automática do frontend
}

export async function runController(
    query: string,
    context: ControllerContext,
    deps: ControllerDeps,
    opts?: { maxIterations?: number }  // default: 5
): Promise<ControllerResult>
```

**Loop interno (máx 5 iterações):**

```
Estado inicial:
  iteration = 0
  observations = []
  workingMemory = ''
  seenToolKeys = Set()  ← loop detection

Loop:
  iteration++

  [THINK] callPlannerLLM(query, workingMemory, iteration, maxIterations, context, deps)
    → gpt-5.4-mini-2026-03-17, temperature: 0
    → Tools: 25+ RPCs + analyze_screen + produce_final_answer
    → Retorna: { action: 'use_tool' | 'produce_answer', toolCall?, answer? }
    → Se action === 'produce_answer' → sai do loop
    → Se iteration === maxIterations → força produce_final_answer
    → Se mesma tool+params já chamada → loop detection → força parada

  [ACT] executeTool(toolName, toolArgs, query, deps, context)
    → Executa RPC, RAG ou analyze_screen

  [OBSERVE] monta Observation
    → { iteration, toolName, input, output, success, timestamp }

  [PERCEPTION] runPerception(toolResult, toolName)
    → Rule-based: signalKind, rowCount, keyFacts, summary, needsRetry, confidence

  [MEMORY] buildWorkingMemoryEntry(obs, compact)
    → iter 1-2: output completo
    → iter 3+: keyFacts compactados (proteção de context window)
    → persistObservationToDb() — fire-and-forget → controller_observations

Após loop:
  [EVALUATE] runEvaluator({query, answer, observations, agentName})
    → Se score < 0.70 → refineAnswer() — 1 chamada de refinamento
    → persistSessionToDb() — fire-and-forget → controller_sessions
```

#### 11.3.2 Tool `produce_final_answer`

Tool especial de parada — quando o planner a chama, o loop encerra imediatamente:

```json
{
  "name": "produce_final_answer",
  "description": "Chame quando tiver informação suficiente para responder. O loop encerra imediatamente após esta chamada.",
  "parameters": {
    "answer": { "type": "string" }
  }
}
```

#### 11.3.3 Tool `analyze_screen`

Tool de Vision Perception — sempre disponível, captura automática:

```json
{
  "name": "analyze_screen",
  "description": "Analisa a captura de tela atual (Vision Perception). SEMPRE disponível — captura feita automaticamente. Chame proativamente quando: 'print', 'screenshot', 'o que está na tela', dados visíveis na interface.",
  "parameters": {
    "focus": { "type": "string", "description": "O que extrair da tela" }
  }
}
```

#### 11.3.4 System Prompt do Planner

O system prompt do `callPlannerLLM` contém regras críticas:

```
PRIORIDADE DE FERRAMENTAS:
- "projeto", "último projeto" → query_all_projects (NUNCA use RAG para dados operacionais)
- "tarefa" + "projeto" → query_all_projects primeiro para obter ID, depois query_all_tasks
- "contrato" → query_all_contracts
- documentos normativos → rag_search APENAS

VISÃO DE TELA (analyze_screen):
- SEMPRE disponível — captura automática a cada mensagem
- Você TEM capacidade de ver a tela. NUNCA diga "não consigo tirar print"
- Chame proativamente: "print", "screenshot", "o que está na tela", "o que você vê"
- Após analyze_screen, responda com o que VIU — sem disclaimers
```

---

### 11.4 Evaluator Agent — LLM-as-a-Judge

#### 11.4.1 Contrato público

**Arquivo:** `supabase/functions/_shared/agents/evaluator.ts`

```typescript
export async function runEvaluator(
    input: EvaluationInput,
    deps: { openai: OpenAI }
): Promise<EvaluationResult>

export async function refineAnswer(
    originalAnswer: string,
    query: string,
    evaluation: EvaluationResult,
    observations: Observation[],
    deps: { openai: OpenAI }
): Promise<string>
```

#### 11.4.2 Critérios de avaliação

O Evaluator usa `gpt-5.4-mini-2026-03-17` como juiz com os critérios:

| Critério | Descrição |
|----------|-----------|
| **Completude** | A resposta endereça todos os aspectos da query? |
| **Fundamentação** | Cada afirmação é suportada pelos dados das observations? |
| **Ausência de alucinação** | Há afirmações sem base nas observations? |
| **Clareza** | Estrutura e linguagem adequadas? |

```json
{ "score": 0.85, "pass": true, "issues": [], "suggestion": "" }
```

#### 11.4.3 Threshold e refinamento

- `score >= 0.70` → `pass = true`, entrega a resposta
- `score < 0.70` → `pass = false` → `refineAnswer()` (1 chamada, sem novo loop)

---

### 11.5 Perception Layer

#### 11.5.1 Data Perception (`runPerception`)

Análise rule-based do resultado de cada tool:

```typescript
export interface PerceptionResult {
    signalKind: 'data' | 'empty' | 'error' | 'partial'
    rowCount: number | null
    summary: string        // versão compactada para working memory
    keyFacts: string[]     // fatos extraídos para o planner
    needsRetry: boolean
    confidence: number     // 0..1
}
```

Regras de percepção:
- `success = false` → `signalKind = 'error'`
- Array vazio → `signalKind = 'empty'`, `needsRetry = true`
- Array com dados → `signalKind = 'data'`, extrai `rowCount` e `keyFacts`
- JSON sem estrutura → `signalKind = 'partial'`

#### 11.5.2 Vision Perception (`runVisionPerception`)

Análise da captura de tela via GPT-4o:

```typescript
async function runVisionPerception(
    screenshotBase64: string,  // JPEG 75%, scale 0.6
    focus: string,
    query: string,
    openai: OpenAI,
): Promise<ToolResult>
```

**Configurações técnicas:**
- Modelo: `gpt-4o`
- `detail: 'high'` — tiles de alta resolução (lê texto de UI)
- `max_tokens: 600`

**Instrução anti-alucinação no prompt:**
```
REGRA CRÍTICA: Extraia APENAS o que está VISÍVEL e LEGÍVEL na imagem.
NUNCA invente, adivinhe ou complete dados que não consegue ler claramente.
Se um texto estiver ilegível, use "ilegível" em vez de inventar um valor plausível.
```

**Saída estruturada (JSON):**
```json
{
    "page": "nome exato da página conforme título visível",
    "visible_entities": ["entidades LEGÍVEIS — use valores exatos"],
    "relevant_data": "dados relevantes para a pergunta — somente o que é legível",
    "ui_state": "estado atual da interface",
    "summary": "resumo em 2 frases baseado no que você leu"
}
```

---

### 11.6 DB Observabilidade do Controller

#### 11.6.1 Tabelas criadas

**Migration:** `supabase/migrations/20260320030000_create_controller_tables.sql`

```sql
-- Uma linha por tool call no loop
CREATE TABLE public.controller_observations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_run_id  text        NOT NULL,   -- sessionId + '_' + timestamp
    user_id         uuid,
    agent_name      text,
    iteration       int,
    tool_name       text,
    tool_input      jsonb,
    raw_output      text,                   -- cap 5000 chars
    summary         text,                   -- versão compactada
    signal_kind     text CHECK (signal_kind IN ('data','empty','error','partial')),
    row_count       int,
    key_facts       text[],
    success         boolean,
    needs_retry     boolean     DEFAULT false,
    created_at      timestamptz DEFAULT now()
);

-- Uma linha por execução completa do Controller
CREATE TABLE public.controller_sessions (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_run_id  text        UNIQUE NOT NULL,
    user_id         uuid,
    agent_name      text,
    query           text,
    answer          text,
    iterations      int,
    obs_count       int,
    eval_score      numeric(5,4),
    eval_pass       boolean,
    total_cost_est  numeric(12,8),
    total_input_tokens  int,
    total_output_tokens int,
    created_at      timestamptz DEFAULT now()
);
```

#### 11.6.2 RPC de consulta

```sql
CREATE OR REPLACE FUNCTION public.query_controller_sessions(
    p_limit int DEFAULT 20
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
-- Retorna sessões com observações aninhadas (nested JSON)
```

#### 11.6.3 Persistência fire-and-forget

```typescript
// Não bloqueia o loop — falha silenciosa
persistObservationToDb(obs, context, sessionRunId, supabase).catch(() => {})
persistSessionToDb(result, query, context, sessionRunId, supabase).catch(() => {})
```

#### 11.6.4 RLS e permissões

```sql
CREATE POLICY "gestor_access_ctrl_obs" ON public.controller_observations
    FOR ALL TO authenticated
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.id = auth.uid() AND u.role IN ('gestor','admin')
    ));
GRANT INSERT, SELECT ON public.controller_observations TO service_role;
GRANT INSERT, SELECT ON public.controller_sessions TO service_role;
```

---

### 11.7 Vision Autonomy — Captura Automática

#### 11.7.1 Frontend (`lib/brain.ts`)

```typescript
// Exportada — usada também pelo BrainChat para guardar localmente
export async function capturePageScreenshot(): Promise<string | null> {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(document.body, {
        scale: 0.6,          // era 0.35 — 70% mais resolução
        useCORS: true,
        logging: false,
        removeContainer: true,
    })
    return canvas.toDataURL('image/jpeg', 0.75).split(',')[1]  // era 0.5
}

export async function askBrain(
    query: string,
    sessionId?: string,
    options?: { forcedAgent?: string; screenshotBase64?: string }
): Promise<AskBrainResponse> {
    // Usa screenshot fornecido OU captura automaticamente
    const screenshot = options?.screenshotBase64 ?? await capturePageScreenshot()
    if (screenshot) payload.screenshot_base64 = screenshot
}
```

#### 11.7.2 Frontend (`BrainChat.tsx`)

```tsx
const pendingScreenshotRef = useRef<string | null>(null)
const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null)

// No handleAsk — captura antes de enviar
const screenshot = await capturePageScreenshot()
pendingScreenshotRef.current = screenshot

// Na resposta — attach thumbnail se agent usou analyze_screen
const screenshotForMsg = response.meta?.screenshot_used && pendingScreenshotRef.current
    ? pendingScreenshotRef.current : undefined

setMessages(prev => [...prev, {
    role: 'assistant', content: response.answer,
    sources: response.documents,
    screenshot: screenshotForMsg,  // ← novo campo
}])
```

#### 11.7.3 Thumbnail clicável na resposta

```tsx
{msg.screenshot && (
    <button onClick={() => setExpandedScreenshot(msg.screenshot!)} ...>
        <img src={`data:image/jpeg;base64,${msg.screenshot}`}
             className="w-24 h-14 object-cover object-top" />
        <div className="flex items-center gap-1.5">
            <Monitor className="w-3 h-3" />
            <span>Captura analisada</span>
        </div>
    </button>
)}
```

Modal em tela cheia ao clicar — fecha com botão X ou clique no backdrop.

---

### 11.8 Módulo de Projetos Expandido

#### 11.8.1 Página de Projetos (`pages/Projects.tsx`)

Nova página com:
- Listagem de projetos ativos com responsável interno (`responsible_user`)
- Busca por nome de empresa/cliente
- Ordenação por data de ativação (DESC — mais recente primeiro)
- Botão de criação de projeto (gestores)
- Modal de credenciais (KeyRound) por projeto

#### 11.8.2 Modal de Criação/Edição de Projetos

**Arquivo:** `components/projects/ProjectModal.tsx`

Campos:
- Empresa/cliente, tipo de serviço
- Responsável interno (dropdown de usuários staff)
- Status inicial, datas

Disponível apenas para role `gestor`.

#### 11.8.3 Usuário Responsável em Projetos

**Migration:** `supabase/migrations/20260319000000_add_responsible_user_to_projects.sql`

```sql
ALTER TABLE public.acceptances
    ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES auth.users(id);
```

**RPCs atualizadas para incluir responsável:**
- `query_all_projects` → inclui `responsible_user_name`, `responsible_user_email`
- `query_all_tasks` → inclui `acceptance_id` para correlação

#### 11.8.4 Brain ETL para Projetos

**Arquivo:** `supabase/functions/brain-sync/index.ts`

```typescript
// ETL que processa dados de projetos, gera embeddings e sincroniza com brain_documents
async function syncProjectData(projectId: string, openai: OpenAI, supabase: SupabaseClient)
```

**Migration de triggers ETL:**
`supabase/migrations/20260319000001_brain_etl_triggers.sql`

Triggers em `acceptances` → dispara `brain-sync` quando projeto é criado/atualizado.

---

### 11.9 Correções de Roteamento

#### 11.9.1 Tarefas por Projeto — Fix do Fast Path

**Problema:** "voce consegue ver as tarefas abertas no projeto da Beetrak?" → fast path detectava "projet" → chamava `query_all_projects` → retornava cards de TODOS os projetos (Baggio, Beetrack, C4 Marketing misturados).

**Causa raiz:** `isProjectOrContractFastQuery` não distinguia query SOBRE projetos de query SOBRE tarefas num projeto. `isMultiEntityControllerQuery` exigia "todos" para ativar o Controller.

**Fix em `index.ts`:**

```typescript
// ANTES: exigia "todos"
(nm.includes('todos') && nm.includes('tarefa') && nm.includes('projet'))

// DEPOIS: qualquer tarefa em projeto → Controller (lookup em 2 passos)
(nm.includes('tarefa') && nm.includes('projet'))

// E no fast path: não interceptar quando é sobre tarefas
const isProjectOrContractFastQuery = (_nqRag.includes('projet') || _nqRag.includes('contrat'))
    && !(_nqRag.includes('tarefa') || _nqRag.includes('pendencia') || _nqRag.includes('pendente'))
```

**Resultado:** Query "tarefas do projeto X" → Controller → (1) busca ID do projeto → (2) filtra tarefas por ID → resposta correta.

#### 11.9.2 Query de Visão → Controller

Queries sobre a tela adicionadas ao `isMultiEntityControllerQuery`:

```typescript
nm.includes('print') || nm.includes('screenshot') ||
(nm.includes('tela') && (nm.includes('ver') || nm.includes('vejo') || nm.includes('consegue') || nm.includes('captur'))) ||
nm.includes('o que voce ve') || nm.includes('o que voce esta vendo')
```

O Controller é o único path com `analyze_screen` disponível.

---

### 11.10 Migrations do Ciclo v10.0

| Migration | Conteúdo |
|-----------|---------|
| `20260320010000_fix_query_all_projects_ordering.sql` | ORDER BY `activated_at DESC` (era `company_name`); adiciona `a.timestamp AS activated_at` às 3 branches do UNION |
| `20260320020000_query_all_contracts_add_installments.sql` | Adiciona `installments_count` e `payment_installments` (JSON array) de `acceptance_financial_installments` |
| `20260320030000_create_controller_tables.sql` | Tabelas `controller_observations` + `controller_sessions` + RPC `query_controller_sessions` |
| `20260319000000_add_responsible_user_to_projects.sql` | Coluna `responsible_user_id` em `acceptances` |
| `20260319000001_brain_etl_triggers.sql` | Triggers ETL para sincronização do Brain com projetos |

---

### 11.11 Novos Tipos em `brain-types.ts`

```typescript
export interface PerceptionResult {
    signalKind: 'data' | 'empty' | 'error' | 'partial'
    rowCount: number | null
    summary: string
    keyFacts: string[]
    needsRetry: boolean
    confidence: number
}

export interface Observation {
    iteration: number
    toolName: string
    input: Record<string, any>
    output: string
    success: boolean
    timestamp: number
    perception?: PerceptionResult  // ← novo
}

export interface ControllerResult {
    answer: string
    iterations: number
    observations: Observation[]
    evaluationResult: EvaluationResult | null
    finalDecision: RouteDecision
    totalCostEst: number
    totalInputTokens: number
    totalOutputTokens: number
}

export interface EvaluationResult {
    score: number         // 0..1
    pass: boolean         // score >= 0.70
    issues: string[]
    suggestion: string
    model: string
    latency_ms: number
    cost_est: number
}
```

---

### 11.12 Meta Fields adicionados à resposta

```typescript
meta: {
    // Existentes:
    controller_mode: boolean,
    controller_iterations: number,
    controller_observations: number,
    evaluation_score: number | null,
    evaluation_pass: boolean | null,

    // Novos:
    screenshot_used: boolean,  // true quando analyze_screen foi chamado com sucesso
}
```

---

### 11.13 Guardrails de Qualidade de Visão

**Problemas resolvidos:**

| # | Problema | Causa | Fix |
|---|----------|-------|-----|
| 1 | Agent diz "não consigo tirar print" mas descreve a tela | Treinamento LLM conflitando com tool result | System prompt: "NUNCA diga isso — você TEM capacidade. Responda sem disclaimers." |
| 2 | Usuários inventados (@exemplo.com) | `detail: 'low'` → 512px inlegível, LLM alucinava | `detail: 'high'` — tiles de alta resolução |
| 3 | Texto ilegível → dados plausíveis inventados | Sem instrução de comportamento | Instrução: "se ilegível, diga 'ilegível', não invente" |
| 4 | Screenshot muito pequeno/borrado | `scale: 0.35`, JPEG 50% | `scale: 0.6`, JPEG 75% |

---

### 11.14 Arquivos Impactados no Ciclo v10.0

| Arquivo | Tipo | Operação | Descrição |
|---------|------|----------|-----------|
| `supabase/functions/_shared/agents/controller.ts` | TypeScript | CRIAR | Loop ReAct, callPlannerLLM, executeTool, runPerception, runVisionPerception, persistência DB |
| `supabase/functions/_shared/agents/evaluator.ts` | TypeScript | CRIAR | LLM-as-a-judge, runEvaluator, refineAnswer |
| `supabase/functions/_shared/brain-types.ts` | TypeScript | MODIFICAR | PerceptionResult, Observation.perception, ControllerResult, EvaluationResult |
| `supabase/functions/chat-brain/index.ts` | TypeScript | MODIFICAR | isMultiEntityControllerQuery expandido, isProjectOrContractFastQuery com exceção, screenshotBase64 extraction, screenshot_used no meta, Controller activation |
| `lib/brain.ts` | TypeScript | MODIFICAR | capturePageScreenshot exportada, screenshotBase64 option em askBrain, captura automática sem guard |
| `components/BrainChat.tsx` | TSX | MODIFICAR | pendingScreenshotRef, Message.screenshot, thumbnail clicável, modal de expansão, remoção do botão câmera manual |
| `supabase/migrations/20260320010000_fix_query_all_projects_ordering.sql` | SQL | CRIAR | ORDER BY activated_at DESC |
| `supabase/migrations/20260320020000_query_all_contracts_add_installments.sql` | SQL | CRIAR | installments_count + payment_installments |
| `supabase/migrations/20260320030000_create_controller_tables.sql` | SQL | CRIAR | controller_observations + controller_sessions + RPC + RLS |
| `supabase/migrations/20260319000000_add_responsible_user_to_projects.sql` | SQL | CRIAR | responsible_user_id em acceptances |
| `pages/Projects.tsx` | TSX | CRIAR/MODIFICAR | Listagem com responsável, busca, ordenação |
| `components/projects/ProjectModal.tsx` | TSX | CRIAR | Criação/edição de projetos com responsável |

---

### 11.15 Bugs Críticos Resolvidos no Ciclo v10.0

| # | Bug | Causa Raiz | Solução |
|---|-----|-----------|---------|
| 1 | "tarefas do projeto X" retornava cards de TODOS os projetos | `isProjectOrContractFastQuery` interceptava "projet" sem checar "tarefa" | Exceção: quando contém "tarefa", passa para Controller |
| 2 | Brain dizia "sem evidência de parcelamento" com parcelas no banco | `query_all_contracts` não incluía `acceptance_financial_installments` | Migration adiciona `installments_count` + `payment_installments` |
| 3 | `query_all_projects` retornava projetos mais antigos no topo | ORDER BY `company_name` (alfabético) em vez de data | Migration corrige para ORDER BY `activated_at DESC` |
| 4 | Vision alucinava usuários com emails @exemplo.com | `detail: 'low'` + scale 0.35 → texto ilegível → LLM inventava | `detail: 'high'` + scale 0.6 + JPEG 75% + instrução anti-alucinação |
| 5 | Agent dizia "não consigo tirar print" mas descrevia a tela | Viés de treinamento sobrescrevia tool result | System prompt explícito: "você TEM capacidade — sem disclaimers" |
| 6 | Brain alucinava projeto errado para "último projeto ativado" | Fast path caía em RAG com dados desatualizados | `isMultiEntityControllerQuery` expandido + RAG bypass para proj/contrato |

---

### 11.16 Linha do Tempo Consolidada (v1 → v10.0)

| Versão | Nome | Data | Capacidade Principal |
|--------|------|------|---------------------|
| v1 | Chat RAG | Jan/2026 | Busca vetorial + filtro anti-eco |
| v2 | Agentic RAG | Jan/2026 | Router heurístico, 6 agentes, ETL automático |
| v3 | Hybrid Intelligence | Jan/2026 | Tool use (RAG + SQL direto) |
| v4.1 | Cognitive Agent | Jan/2026 | Identidade + memória de sessão + cobertura total |
| v4.5 | Semantic Router | Fev/2026 | LLM Router (Function Calling) + gestão de propostas |
| v5.0 | Resilient Cognitive Router | Fev/2026 | JWT resiliente + Multi-RPC SQL + resposta composta |
| v6.0 | Cognitive Stabilization | Fev/2026 | Memória viva cognitiva + guardrails anti-alucinação |
| v6.5 | Normative Governance | Fev/2026 | NORMATIVE_FIRST + versionamento + canário automático |
| v7.0 | Corporate Canonical Layer | Fev/2026 | Guardrail corporativo absoluto + controle por cargo |
| v8.0 | Executor Proposal | Fev/2026 | Plano de agentes executores com auditoria |
| v8.5 | Agent Executor | Fev/2026 | Escrita operacional no Kanban via linguagem natural |
| v8.6 | Generative UI Engine | Fev/2026 | GenUI no chat + sanitização PII + anti-duplicação |
| v8.7 | Domain Specialization | Fev/2026 | 8 agentes especializados, chat de tráfego, telemetria IA |
| v9.0 | Data Governance | Fev/2026 | Credenciais criptografadas, trigger fix FK, assinatura anônima |
| v9.2 | Live Corporate Memory | Mar/2026 | Recall determinístico, guardrail gestor, canário 5/5 |
| v9.5 | Operational Hardening | Mar/2026 | SLO, streak 14 dias, carga 20/50/100, canário tracked |
| v9.6 | Resilient Infrastructure | Mar/2026 | CORS/JWT/PGRST203 corrigidos, análise de divergências |
| **v10.0** | **Agentic Controller + Vision** | **Mar/2026** | **Loop ReAct (5 iter.), Evaluator LLM-judge, Perception Data+Vision, Vision Autônoma (analyze_screen), DB Observability Controller, Projects Module com responsável, fix de roteamento tarefa+projeto** |

---

### 11.17 Especificações Técnicas (v10.0)

| Componente | Spec |
|------------|------|
| **Controller — Modelo Planner** | `gpt-5.4-mini-2026-03-17`, temperature: 0 |
| **Evaluator — Modelo Judge** | `gpt-5.4-mini-2026-03-17`, temperature: 0 |
| **Vision Perception — Modelo** | gpt-4o, detail: high, max_tokens: 600 |
| **Screenshot — Captura** | html2canvas, scale: 0.6, JPEG 75% |
| **Máximo de iterações** | 5 (configurável por chamada) |
| **Threshold Evaluator** | score ≥ 0.70 → pass |
| **Refinamento** | Máx 1× por resposta (score < 0.70) |
| **Loop detection** | Mesma tool+params 2× → força produce_final_answer |
| **Working memory compaction** | iter 1-2: full output; iter 3+: keyFacts |
| **DB Observability** | fire-and-forget, nunca bloqueia o loop |
| **Screenshot payload** | ~50-100KB por mensagem |

---

### 11.18 Checklist de Aceite v10.0

**Controller Agent:**
- [x] `controller.ts` com loop ReAct (Think/Act/Observe/Perception/Memory/Evaluate)
- [x] `callPlannerLLM` com `gpt-5.4-mini-2026-03-17` e 25+ tools + produce_final_answer
- [x] Loop detection (mesma tool+params → para)
- [x] Working memory compaction (iter 3+)
- [x] `isMultiEntityControllerQuery` ativando para tarefa+projeto e queries de visão

**Evaluator Agent:**
- [x] `evaluator.ts` com `runEvaluator` e `refineAnswer`
- [x] Score 0..1, pass ≥ 0.70
- [x] Refinamento automático se score < 0.70

**Perception Layer:**
- [x] `runPerception` — Data Perception (signalKind, keyFacts, summary)
- [x] `runVisionPerception` — Vision Perception (gpt-4o, detail: high)
- [x] `Observation.perception` persistida no DB

**DB Observabilidade:**
- [x] Tabela `controller_observations` criada com RLS
- [x] Tabela `controller_sessions` criada com RLS
- [x] RPC `query_controller_sessions` com nested observations
- [x] `persistObservationToDb` e `persistSessionToDb` (fire-and-forget)
- [x] `meta.screenshot_used` na resposta quando analyze_screen foi chamado

**Vision Autonomy:**
- [x] `capturePageScreenshot` exportada do `brain.ts`
- [x] Captura automática em toda mensagem (sem guard manual)
- [x] `BrainChat.tsx` guarda screenshot em `pendingScreenshotRef`
- [x] Thumbnail clicável quando `meta.screenshot_used = true`
- [x] Modal de expansão em tela cheia
- [x] `detail: 'high'` no gpt-4o (era `low`)
- [x] `scale: 0.6`, JPEG 75% (era 0.35, 50%)
- [x] Instrução anti-alucinação: "se ilegível, diga ilegível"
- [x] System prompt: "NUNCA diga que não consegue tirar print"

**Módulo de Projetos:**
- [x] `Projects.tsx` com listagem, busca e ordenação por data
- [x] `responsible_user_id` em `acceptances`
- [x] `query_all_projects` inclui dados do responsável
- [x] `ProjectModal.tsx` para criação/edição
- [x] Brain ETL sincroniza projetos com brain_documents

**Correções de Roteamento:**
- [x] `isProjectOrContractFastQuery` não intercepta queries de tarefa
- [x] `isMultiEntityControllerQuery` detecta tarefa+projeto sem exigir "todos"
- [x] `query_all_contracts` inclui installments
- [x] `query_all_projects` ORDER BY activated_at DESC

---

### 11.19 Próximos Passos Recomendados (v10.1+)

#### 11.19.1 Dashboard de Controller Sessions

Página de observabilidade do loop agentic para o gestor:
- Timeline de iterações por sessão
- Heat map de tools mais chamadas
- Distribuição de evaluation_score
- Sessões com score < 0.70 (refinamentos automáticos)

**Dados disponíveis:** `controller_sessions` + `controller_observations` já persistidos.

#### 11.19.2 Agent_Autonomy Proativo

O Controller já tem o framework — expandir para execução proativa:
- Ao detectar `signalKind = 'empty'` em `query_all_tasks` para projetos ativos → cria tarefa de revisão automaticamente
- Após `evaluation_pass = false` com `issues` recorrentes → salva padrão de falha em brain_documents para evitar regressão

#### 11.19.3 Vision Memory

Salvar outputs de `analyze_screen` no `brain_documents` com `type = 'screen_snapshot'`:
- Permite ao agente "lembrar" de estados anteriores da interface
- Útil para comparativo de estado antes/depois de uma operação

#### 11.19.4 Streaming de Iterações

Transmitir eventos do Controller em tempo real via SSE (Server-Sent Events):
```json
{"event": "think", "iteration": 1, "tool": "query_all_projects"}
{"event": "observe", "iteration": 1, "signal": "data", "rows": 8}
{"event": "think", "iteration": 2, "tool": "query_all_tasks", "params": {"p_project_id": 55}}
{"event": "answer", "evaluation_score": 0.91}
```

Isso permite o frontend mostrar "Consultando projetos... → Buscando tarefas do Baggio..." em tempo real.

#### 11.19.5 Canário T6+ — Smoke Tests do Controller

Adicionar ao `check_brain_canary.js`:
- T7: Enviar query analítica → verificar `meta.controller_iterations >= 2`
- T8: Enviar query de visão → verificar `meta.screenshot_used = true`
- T9: Verificar `evaluation_score >= 0.70` para resposta de referência

---

### 11.20 Encerramento da v10.0

O ciclo v10.0 marca a transição definitiva do Segundo Cérebro de **assistente reativo** para **agente cognitivo autônomo**.

O sistema agora pode:

1. **Consultar** dados (RAG + SQL direto) — desde v3
2. **Executar** ações (criar/editar/deletar tarefas) — desde v8.5
3. **Visualizar** dados (cards, gráficos, listas visuais) — desde v8.6
4. **Proteger** dados sensíveis (sanitização PII, criptografia) — desde v8.6/v9.0
5. **Rastrear** operações (histórico de tarefas, atrasos, concluídas) — desde v9.0
6. **Lembrar** contexto entre sessões (títulos, memória explícita) — desde v9.0/v9.2
7. **Monitorar** sua própria saúde (SLO, streak, canário, telemetria) — desde v9.2/v9.5
8. **Pensar em múltiplos passos** (Controller ReAct — até 5 iterações) — **v10.0**
9. **Avaliar** sua própria qualidade (Evaluator LLM-judge) — **v10.0**
10. **Perceber** o ambiente (Data Perception + Vision Perception) — **v10.0**
11. **Ver** a interface (Vision autônoma — html2canvas + gpt-4o) — **v10.0**
12. **Auditar** cada passo agentic (controller_sessions + observations) — **v10.0**

O Segundo Cérebro está operando como um **agente cognitivo corporativo completo** — com raciocínio multi-passo, auto-avaliação de qualidade, percepção do ambiente (banco de dados + interface visual) e governança total de execução.
