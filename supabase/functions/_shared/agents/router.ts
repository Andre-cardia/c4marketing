
import { OpenAI } from "https://esm.sh/openai@4";

import {
    AgentName,
    ArtifactKind,
    BrainDocType,
    RetrievalPolicy,
    RiskLevel,
    RouteDecision,
    RouteFilters,
    RouterInput,
    TaskKind,
} from "../brain-types.ts";

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalize(s: string) {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function hasAny(msg: string, terms: string[]) {
    const normMsg = normalize(msg);
    return terms.some((t) => normMsg.includes(normalize(t)));
}

function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

// ---------------------------------------------------------------------------
// Filter + Policy helpers (mantidos idênticos para compatibilidade downstream)
// ---------------------------------------------------------------------------

function applyPolicyToFilters(filters: RouteFilters, policy: RetrievalPolicy): RouteFilters {
    const f: RouteFilters = { ...filters };

    const allow = new Set<BrainDocType>(f.type_allowlist ?? []);
    const block = new Set<BrainDocType>(f.type_blocklist ?? []);

    const allowOnly = (...types: BrainDocType[]) => {
        allow.clear();
        block.clear();
        types.forEach((t) => allow.add(t));
    };

    switch (policy) {
        case "STRICT_DOCS_ONLY":
            allow.add("official_doc");
            allow.add("session_summary");
            block.add("chat_log");
            f.time_window_minutes = null;
            break;

        case "NORMATIVE_FIRST":
            allow.add("official_doc");
            allow.add("session_summary");
            block.add("chat_log");
            f.time_window_minutes = null;
            f.status = "active";
            f.normative_mode = true;
            f.require_current = true;
            f.require_searchable = true;
            f.authority_rank_min = f.authority_rank_min ?? 50;
            break;

        case "DOCS_PLUS_RECENT_CHAT":
            allow.add("official_doc");
            allow.add("session_summary");
            if (f.time_window_minutes && f.time_window_minutes > 0) {
                allow.add("chat_log");
                block.delete("chat_log");
            } else {
                block.add("chat_log");
            }
            break;

        case "CHAT_ONLY":
            allowOnly("chat_log", "session_summary");
            break;

        case "OPS_ONLY":
            allowOnly("system_note");
            block.delete("chat_log");
            break;
    }

    f.type_allowlist = Array.from(allow);
    f.type_blocklist = Array.from(block);
    return f;
}

function makeDecision(
    input: RouterInput,
    d: {
        artifact_kind: ArtifactKind;
        task_kind: TaskKind;
        risk_level: RiskLevel;
        agent: AgentName;
        retrieval_policy: RetrievalPolicy;
        top_k: number;
        tools_allowed: Array<"rag_search" | "db_read" | "brain_sync">;
        tool_hint?: "rag_search" | "db_query";
        db_query_params?: Record<string, any>;
        confidence: number;
        reason: string;
        filtersPatch: Partial<RouteFilters>;
    }
): RouteDecision {
    const base: RouteFilters = {
        tenant_id: input.tenant_id,
        type_allowlist: ["official_doc", "session_summary"],
        type_blocklist: ["chat_log"],
        artifact_kind: null,
        source_table: null,
        client_id: input.client_id ?? null,
        project_id: input.project_id ?? null,
        source_id: input.source_id ?? null,
        status: "active",
        time_window_minutes: null,
    };

    const patched = { ...base, ...d.filtersPatch };
    const finalFilters = applyPolicyToFilters(patched, d.retrieval_policy);

    return {
        artifact_kind: d.artifact_kind,
        task_kind: d.task_kind,
        risk_level: d.risk_level,
        agent: d.agent,
        retrieval_policy: d.retrieval_policy,
        filters: finalFilters,
        top_k: clampInt(d.top_k, 1, 50),
        tools_allowed: d.tools_allowed,
        tool_hint: d.tool_hint ?? "rag_search",
        db_query_params: d.db_query_params,
        confidence: clamp01(d.confidence),
        reason: d.reason,
    };
}

function normalizeDecision(dec: RouteDecision, input: RouterInput): RouteDecision {
    const f = dec.filters ?? {};
    const merged: RouteFilters = {
        tenant_id: input.tenant_id,
        type_allowlist: f.type_allowlist ?? ["official_doc", "session_summary"],
        type_blocklist: f.type_blocklist ?? ["chat_log"],
        artifact_kind: f.artifact_kind ?? null,
        source_table: f.source_table ?? null,
        client_id: f.client_id ?? input.client_id ?? null,
        project_id: f.project_id ?? input.project_id ?? null,
        source_id: f.source_id ?? input.source_id ?? null,
        status: f.status ?? "active",
        time_window_minutes: f.time_window_minutes ?? null,
    };

    const applied = applyPolicyToFilters(merged, dec.retrieval_policy);

    return {
        ...dec,
        filters: applied,
        top_k: clampInt(dec.top_k ?? 5, 1, 50),
        tool_hint: dec.tool_hint ?? "rag_search",
        confidence: clamp01(dec.confidence ?? 0.6),
    };
}

// ---------------------------------------------------------------------------
// Fallback de emergência (usado APENAS se o LLM falhar completamente)
// ---------------------------------------------------------------------------

function emergencyFallback(input: RouterInput): RouteDecision {
    return makeDecision(input, {
        artifact_kind: "unknown",
        task_kind: "factual_lookup",
        risk_level: "low",
        agent: "Agent_Projects",
        retrieval_policy: "STRICT_DOCS_ONLY",
        top_k: 6,
        tools_allowed: ["rag_search"],
        tool_hint: "rag_search",
        db_query_params: undefined,
        confidence: 0.3,
        reason: "Emergency fallback: LLM router indisponível",
        filtersPatch: {},
    });
}

// ---------------------------------------------------------------------------
// Tool schema do router LLM (function calling)
// ---------------------------------------------------------------------------

const ROUTER_TOOL = {
    type: "function" as const,
    function: {
        name: "route_decision",
        description: "Classifica a mensagem do usuário e retorna o roteamento correto para o sistema de IA.",
        parameters: {
            type: "object",
            properties: {
                artifact_kind: {
                    type: "string",
                    enum: ["proposal", "contract", "project", "client", "policy", "ops", "report", "unknown"],
                    description: "Tipo de artefato predominante na intenção do usuário.",
                },
                task_kind: {
                    type: "string",
                    enum: ["factual_lookup", "analysis", "summarization", "drafting", "operation"],
                    description: "Natureza da tarefa: busca de fatos, análise, sumarização, redigir texto ou executar operação no sistema.",
                },
                risk_level: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Nível de risco: high para dados financeiros, contratos, PII; medium para projetos e clientes; low para consultas gerais.",
                },
                agent: {
                    type: "string",
                    enum: [
                        "Agent_Proposals",
                        "Agent_Contracts",
                        "Agent_Projects",
                        "Agent_Client360",
                        "Agent_MarketingTraffic",
                        "Agent_BrainOps",
                        "Agent_GovernanceSecurity",
                        "Agent_Executor",
                    ],
                    description: "Agente especialista mais adequado para a tarefa.",
                },
                retrieval_policy: {
                    type: "string",
                    enum: ["STRICT_DOCS_ONLY", "NORMATIVE_FIRST", "DOCS_PLUS_RECENT_CHAT", "CHAT_ONLY", "OPS_ONLY"],
                    description: "Política de recuperação RAG. Use STRICT_DOCS_ONLY para fatos e dados estruturados; NORMATIVE_FIRST para contratos/políticas; OPS_ONLY para operações de sistema.",
                },
                top_k: {
                    type: "number",
                    description: "Documentos RAG a recuperar. Use 0 quando a resposta virá exclusivamente de SQL (db_query). Máximo 30.",
                },
                tool_hint: {
                    type: "string",
                    enum: ["rag_search", "db_query"],
                    description: "Indicação da ferramenta primária. Use db_query quando a pergunta pede dados estruturados (contagem, valores, listagem). Use rag_search para análise semântica.",
                },
                db_query_params: {
                    type: "object",
                    description: "Parâmetros para query SQL — preencher APENAS quando tool_hint=db_query.",
                    properties: {
                        rpc_name: {
                            type: "string",
                            enum: [
                                "query_all_proposals",
                                "query_all_clients",
                                "query_all_projects",
                                "query_financial_summary",
                                "query_all_users",
                                "query_all_tasks",
                                "query_access_summary",
                                "query_survey_responses",
                            ],
                            description: "Função RPC do banco de dados a chamar.",
                        },
                        p_status_filter: {
                            type: "string",
                            enum: ["open", "accepted", "all", "Ativo", "Inativo", "Suspenso", "Cancelado", "Finalizado"],
                            description: "Filtro de status.",
                        },
                        p_service_type: {
                            type: "string",
                            enum: ["traffic", "website", "landing_page"],
                            description: "Tipo de serviço para query_all_projects.",
                        },
                        p_project_type: {
                            type: "string",
                            enum: ["traffic", "website", "landing_page"],
                            description: "Tipo de projeto para query_survey_responses.",
                        },
                        p_limit: {
                            type: "number",
                            description: "Limite de registros retornados.",
                        },
                        p_overdue: {
                            type: "boolean",
                            description: "true para filtrar apenas tarefas atrasadas.",
                        },
                    },
                    required: ["rpc_name"],
                },
                confidence: {
                    type: "number",
                    description: "Confiança na decisão (0.0 a 1.0). Use ≥0.85 para intenções explícitas, ≤0.65 para ambíguas.",
                },
                reason: {
                    type: "string",
                    description: "Justificativa curta (máx. 120 chars) para a decisão tomada.",
                },
                source_tables: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tabelas do banco mais relevantes para filtrar no RAG.",
                },
                is_capability_query: {
                    type: "boolean",
                    description: "true se o usuário está perguntando sobre capacidades do sistema ('você consegue criar X?'), NÃO sobre dados reais.",
                },
            },
            required: ["artifact_kind", "task_kind", "risk_level", "agent", "retrieval_policy", "top_k", "tool_hint", "confidence", "reason"],
        },
    },
};

// ---------------------------------------------------------------------------
// System prompt do roteador
// ---------------------------------------------------------------------------

function buildRouterSystemPrompt(): string {
    return `Você é o ROTEADOR do "Segundo Cérebro" da C4 Marketing.
Sua única função é classificar a mensagem do usuário e chamar route_decision com os parâmetros corretos.

AGENTES DISPONÍVEIS E DOMÍNIOS:
- Agent_Proposals     → propostas comerciais, orçamentos, precificação, serviços oferecidos
- Agent_Contracts     → contratos, cláusulas, vigência, rescisão, aditivos, termos legais
- Agent_Client360     → clientes, histórico de cliente, visão 360, relacionamento
- Agent_Projects      → projetos ativos, tarefas, status de entrega, pendências, milestones
- Agent_MarketingTraffic → tráfego pago, campanhas, anúncios, Google Ads, Meta Ads, ROAS/CPC/CTR, criativos
- Agent_BrainOps      → usuários do sistema, acessos, logs, sincronização, ETL, indexação
- Agent_GovernanceSecurity → LGPD, RLS, segurança, conformidade, políticas, auditoria
- Agent_Executor      → criação/atualização de registros (tarefas, propostas, usuários)

REGRAS DE ROTEAMENTO (em ordem de prioridade):

1. DADOS FINANCEIROS (MRR, ARR, faturamento, receita, run rate, mensalidade)
   → agent=Agent_Proposals, tool_hint=db_query, rpc_name=query_financial_summary, risk=high

2. CONTRATOS / LEGAIS (contrato, cláusula, vigência, rescisão, aditivo, multa)
   → agent=Agent_Contracts, retrieval_policy=NORMATIVE_FIRST, risk=high, top_k=5

3. DADOS SENSÍVEIS (CPF, CNPJ, senha, API key, LGPD, sigilo)
   → agent=Agent_GovernanceSecurity, retrieval_policy=STRICT_DOCS_ONLY, risk=high

4. PROPOSTAS — listagem/contagem
   → agent=Agent_Proposals, tool_hint=db_query, rpc_name=query_all_proposals

5. CLIENTES — listagem/contagem
   → agent=Agent_Client360, tool_hint=db_query, rpc_name=query_all_clients

6. PROJETOS — listagem/contagem
   → agent=Agent_Projects, tool_hint=db_query, rpc_name=query_all_projects

7. TAREFAS — listagem/consulta
   → agent=Agent_Projects, tool_hint=db_query, rpc_name=query_all_tasks

8. TAREFAS — criação explícita ("criar tarefa", "nova tarefa")
   → agent=Agent_Executor, task_kind=operation, tool_hint=rag_search

9. USUÁRIOS / EQUIPE / ACESSOS
   → agent=Agent_BrainOps, tool_hint=db_query, rpc_name=query_all_users OU query_access_summary

10. TRÁFEGO PAGO / MARKETING / CAMPANHAS
    → agent=Agent_MarketingTraffic, tool_hint=rag_search OU db_query (survey se survey/briefing)

11. SURVEYS / BRIEFINGS / FORMULÁRIOS
    → tool_hint=db_query, rpc_name=query_survey_responses

12. OPERAÇÕES DO SISTEMA (sincronizar, reindexar, ETL)
    → agent=Agent_BrainOps, retrieval_policy=OPS_ONLY, task_kind=operation

13. CAPABILITY QUERY — PRIORIDADE MÁXIMA (aplique ESTA regra ANTES das regras 4 a 12)
    Triggers: frases interrogativas com "você consegue", "você pode", "é possível", "dá pra", "dá para", "tem como", "consegue fazer", "é capaz", "você faz", "posso fazer", "o que você sabe fazer" + qualquer verbo ou objeto.
    Exemplos:
      - "você consegue criar uma tarefa?" → capability query
      - "consegue listar clientes?" → capability query
      - "é possível ver propostas aqui?" → capability query
      - "dá pra criar tarefa?" → capability query
      - "você pode ver meus projetos?" → capability query
      - "o que você consegue fazer?" → capability query
      - "tem como criar tarefa por aqui?" → capability query
      - "posso criar tarefa aqui?" → capability query
    ATENÇÃO: NÃO confunda com pedidos diretos ("crie uma tarefa", "liste os clientes"). Pedidos diretos usam imperativo ou futuro sem "você consegue/pode/dá/é possível".
    → is_capability_query=true, top_k=0, tool_hint=rag_search, agent=Agent_BrainOps, risk=low

REGRA DE OURO: tool_hint=db_query requer db_query_params.rpc_name. Se não souber qual RPC usar, prefira tool_hint=rag_search.
top_k=0 APENAS quando a resposta vem 100% de SQL.`;
}

// ---------------------------------------------------------------------------
// callRouterLLM — ponto de entrada público para o function handler
// ---------------------------------------------------------------------------

export async function callRouterLLM(
    input: RouterInput
): Promise<RouteDecision> {
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const systemPrompt = buildRouterSystemPrompt();

    const userContent = `Mensagem do usuário: "${input.user_message}"

Contexto adicional:
- Role do usuário: ${input.user_role ?? "desconhecido"}
- Tenant ID: ${input.tenant_id ?? "N/A"}
${input.client_id ? `- Client ID: ${input.client_id}` : ""}
${input.project_id ? `- Project ID: ${input.project_id}` : ""}`;

    const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        tools: [ROUTER_TOOL],
        tool_choice: { type: "function", function: { name: "route_decision" } },
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
        ],
    });

    const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
        throw new Error("Router LLM: nenhuma tool call retornada");
    }

    let d: Record<string, any> = {};
    try {
        d = JSON.parse(toolCall.function.arguments ?? "{}");
    } catch {
        throw new Error("Router LLM: JSON inválido nos argumentos da tool call");
    }

    // Capacidade especial: is_capability_query
    if (d.is_capability_query === true) {
        return makeDecision(input, {
            artifact_kind: "unknown",
            task_kind: "factual_lookup",
            risk_level: "low",
            agent: "Agent_Projects",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 1,
            tools_allowed: [],
            tool_hint: "rag_search",
            db_query_params: undefined,
            confidence: 0.97,
            reason: "LLM: capability query — resposta conversacional sobre capacidades do sistema",
            filtersPatch: {},
        });
    }

    // Mapear source_tables para filtersPatch
    const sourceTables: string[] | null = Array.isArray(d.source_tables) && d.source_tables.length > 0
        ? d.source_tables
        : null;

    // Construir db_query_params apenas se tool_hint=db_query e rpc_name presente
    let dbQueryParams: Record<string, any> | undefined = undefined;
    if (d.tool_hint === "db_query" && d.db_query_params?.rpc_name) {
        dbQueryParams = { ...d.db_query_params };
    }

    return makeDecision(input, {
        artifact_kind: (d.artifact_kind as ArtifactKind) ?? "unknown",
        task_kind: (d.task_kind as TaskKind) ?? "factual_lookup",
        risk_level: (d.risk_level as RiskLevel) ?? "medium",
        agent: (d.agent as AgentName) ?? "Agent_Projects",
        retrieval_policy: (d.retrieval_policy as RetrievalPolicy) ?? "STRICT_DOCS_ONLY",
        top_k: typeof d.top_k === "number" ? d.top_k : 6,
        tools_allowed: ["rag_search", "db_read"],
        tool_hint: d.tool_hint === "db_query" ? "db_query" : "rag_search",
        db_query_params: dbQueryParams,
        confidence: typeof d.confidence === "number" ? d.confidence : 0.7,
        reason: typeof d.reason === "string" ? d.reason.slice(0, 180) : "LLM router",
        filtersPatch: sourceTables ? { source_table: sourceTables } : {},
    });
}

// ---------------------------------------------------------------------------
// routeRequestHybrid — API pública, chamada pelo function handler
// ---------------------------------------------------------------------------

export async function routeRequestHybrid(
    input: RouterInput,
    // deps mantido para compatibilidade retroativa — ignorado internamente
    _deps?: { callRouterLLM?: (input: RouterInput) => Promise<RouteDecision> }
): Promise<RouteDecision> {
    try {
        const decision = await callRouterLLM(input);
        return normalizeDecision(decision, input);
    } catch (err) {
        console.error("[Router] LLM falhou, usando fallback de emergência:", err);
        return emergencyFallback(input);
    }
}

// ---------------------------------------------------------------------------
// Exports de compatibilidade (usado por testes existentes)
// ---------------------------------------------------------------------------

/** @deprecated — usar routeRequestHybrid com callRouterLLM injetado */
export function capabilityQueryGate(msg: string, input: RouterInput): RouteDecision | null {
    const normalized = normalize(msg);
    const capWords = ["voce consegue", "voce pode", "voce sabe", "e possivel", "tem como", "da para", "consegue fazer", "pode fazer", "o que voce", "quais funcionalidades", "o sistema consegue", "o brain consegue"];
    const found = capWords.some((w) => normalized.includes(w));
    if (!found) return null;
    return makeDecision(input, {
        artifact_kind: "unknown",
        task_kind: "factual_lookup",
        risk_level: "low",
        agent: "Agent_Projects",
        retrieval_policy: "STRICT_DOCS_ONLY",
        top_k: 1,
        tools_allowed: [],
        tool_hint: "rag_search",
        db_query_params: undefined,
        confidence: 0.97,
        reason: "Capability gate: meta-question about system capabilities",
        filtersPatch: {},
    });
}

/** @deprecated — usar routeRequestHybrid com callRouterLLM injetado */
export function hardGatePolicy(_msg: string, _input: RouterInput): RouteDecision | null {
    return null; // lógica migrada para o LLM
}

/** @deprecated — usar routeRequestHybrid com callRouterLLM injetado */
export function routeHeuristic(msg: string, input: RouterInput): RouteDecision {
    return emergencyFallback(input);
}
