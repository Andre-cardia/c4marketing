
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

// --- Normalization & Helpers ---

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

function inferTaskKind(msg: string): TaskKind {
    if (hasAny(msg, ["resuma", "resumir", "sumarize", "summary"])) return "summarization";
    if (hasAny(msg, ["escreva", "redija", "crie", "draft", "gerar texto"])) return "drafting";
    if (hasAny(msg, ["analise", "análise", "comparar", "crítica", "critica"])) return "analysis";
    if (hasAny(msg, ["sincronizar", "reindexar", "etl", "upsert", "dedupe"])) return "operation";
    return "factual_lookup";
}

// --- Filter Logic ---

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

        case "DOCS_PLUS_RECENT_CHAT":
            allow.add("official_doc");
            allow.add("session_summary");
            // chat only if time window exists
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

    // 1. Merge patch
    const patched = { ...base, ...d.filtersPatch };

    // 2. Apply policy
    const finalFilters = applyPolicyToFilters(patched, d.retrieval_policy);

    return {
        artifact_kind: d.artifact_kind,
        task_kind: d.task_kind,
        risk_level: d.risk_level,
        agent: d.agent,
        retrieval_policy: d.retrieval_policy,
        filters: finalFilters,
        top_k: clampInt(d.top_k, 1, 30),
        tools_allowed: d.tools_allowed,
        confidence: clamp01(d.confidence),
        reason: d.reason,
    };
}

function normalizeDecision(dec: RouteDecision, input: RouterInput): RouteDecision {
    // Ensure defaults
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
        top_k: clampInt(dec.top_k ?? 5, 1, 30),
        confidence: clamp01(dec.confidence ?? 0.6),
    };
}

// --- 1. Hard Gates ---

export function hardGatePolicy(msg: string, input: RouterInput): RouteDecision | null {
    const hasContractIntent = hasAny(msg, [
        "contrato", "cláusula", "clausula", "vigência", "vigencia", "validade",
        "assinatura", "aditivo", "rescisão", "rescisao", "multa", "foro", "prazo",
    ]);

    const hasMoneyIntent = hasAny(msg, [
        "valor", "preço", "preco", "orçamento", "orcamento", "budget",
        "mensalidade", "pagamento", "cobrança", "cobranca", "faturamento",
    ]);

    const hasSensitiveIntent = hasAny(msg, [
        "cpf", "cnpj", "dados pessoais", "lgpd", "sigilo", "confidencial",
        "senha", "token", "chave", "api key",
    ]);

    if (hasContractIntent) {
        return makeDecision(input, {
            artifact_kind: "contract",
            task_kind: "factual_lookup",
            risk_level: "high",
            agent: "Agent_Contracts",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 5,
            tools_allowed: ["rag_search", "db_read"],
            confidence: 0.95,
            reason: "Hard gate: contract/legal intent detected",
            filtersPatch: {
                artifact_kind: "contract",
                source_table: ["acceptances", "contracts", "addenda"],
            },
        });
    }

    if (hasMoneyIntent) {
        return makeDecision(input, {
            artifact_kind: "proposal",
            task_kind: "factual_lookup",
            risk_level: "high",
            agent: "Agent_Proposals",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 6,
            tools_allowed: ["rag_search", "db_read"],
            confidence: 0.9,
            reason: "Hard gate: monetary intent detected",
            filtersPatch: {
                artifact_kind: "proposal",
                source_table: ["proposals", "budgets", "proposal_versions", "pricing_tables"],
            },
        });
    }

    if (hasSensitiveIntent) {
        return makeDecision(input, {
            artifact_kind: "policy",
            task_kind: "analysis",
            risk_level: "high",
            agent: "Agent_GovernanceSecurity",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 5,
            tools_allowed: ["rag_search"],
            confidence: 0.88,
            reason: "Hard gate: sensitive/security intent detected",
            filtersPatch: {
                artifact_kind: "policy",
                source_table: ["policies", "security_docs", "governance"],
            },
        });
    }

    return null;
}

// --- 2. Heuristic ---

export function routeHeuristic(msg: string, input: RouterInput): RouteDecision {
    // Ops
    if (hasAny(msg, ["sincronizar", "reindexar", "indexar", "etl", "upsert", "dedupe", "duplicidade", "cérebro", "cerebro", "brain"])) {
        return makeDecision(input, {
            artifact_kind: "ops",
            task_kind: "operation",
            risk_level: "medium",
            agent: "Agent_BrainOps",
            retrieval_policy: "OPS_ONLY",
            top_k: 8,
            tools_allowed: ["rag_search", "db_read", "brain_sync"],
            confidence: 0.9,
            reason: "Heuristic: ops/etl intent detected",
            filtersPatch: {
                artifact_kind: "ops",
                source_table: ["brain_documents", "access_logs", "etl_jobs", "system_notes"],
            },
        });
    }

    // Proposals (weaker intent than hard gate)
    if (hasAny(msg, ["proposta", "orçamento", "orcamento", "escopo", "pricing", "preço", "preco"])) {
        return makeDecision(input, {
            artifact_kind: "proposal",
            task_kind: inferTaskKind(msg),
            risk_level: "medium",
            agent: "Agent_Proposals",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 6,
            tools_allowed: ["rag_search", "db_read"],
            confidence: 0.84,
            reason: "Heuristic: proposal intent detected",
            filtersPatch: {
                artifact_kind: "proposal",
                source_table: ["proposals", "budgets", "proposal_versions"],
            },
        });
    }

    // Projects
    if (hasAny(msg, ["projeto", "status", "entrega", "timeline", "cronograma", "tarefa", "pendência", "pendencia", "milestone"])) {
        const task = inferTaskKind(msg);
        const policy: RetrievalPolicy = task === "factual_lookup" ? "STRICT_DOCS_ONLY" : "DOCS_PLUS_RECENT_CHAT";

        return makeDecision(input, {
            artifact_kind: "project",
            task_kind: task,
            risk_level: "medium",
            agent: "Agent_Projects",
            retrieval_policy: policy,
            top_k: 8,
            tools_allowed: ["rag_search", "db_read"],
            confidence: 0.82,
            reason: "Heuristic: project intent detected",
            filtersPatch: {
                artifact_kind: "project",
                source_table: ["projects", "tasks", "milestones", "activity_logs"],
                // allow chat only if policy allows
                time_window_minutes: policy === "DOCS_PLUS_RECENT_CHAT" ? 15 : null,
            },
        });
    }

    // Client 360
    if (hasAny(msg, ["cliente", "histórico", "historico", "visão 360", "panorama", "resumo do cliente"])) {
        return makeDecision(input, {
            artifact_kind: "client",
            task_kind: "summarization",
            risk_level: "medium",
            agent: "Agent_Client360",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 10,
            tools_allowed: ["rag_search", "db_read"],
            confidence: 0.78,
            reason: "Heuristic: client360 intent detected",
            filtersPatch: {
                artifact_kind: "client",
                source_table: ["clients", "acceptances", "contracts", "proposals", "projects"],
            },
        });
    }

    // Governance
    if (hasAny(msg, ["rls", "row level security", "auditoria", "log", "permissão", "permissao", "segurança", "seguranca", "compliance"])) {
        return makeDecision(input, {
            artifact_kind: "policy",
            task_kind: "analysis",
            risk_level: "medium",
            agent: "Agent_GovernanceSecurity",
            retrieval_policy: "STRICT_DOCS_ONLY",
            top_k: 6,
            tools_allowed: ["rag_search"],
            confidence: 0.8,
            reason: "Heuristic: governance/security intent detected",
            filtersPatch: {
                artifact_kind: "policy",
                source_table: ["policies", "security_docs", "access_logs"],
            },
        });
    }

    // Unknown / Low Confidence
    return makeDecision(input, {
        artifact_kind: "unknown",
        task_kind: inferTaskKind(msg),
        risk_level: "low",
        agent: "Agent_Projects", // fallback default
        retrieval_policy: "STRICT_DOCS_ONLY",
        top_k: 6,
        tools_allowed: ["rag_search"],
        confidence: 0.45,
        reason: "Heuristic: no strong match -> fallback",
        filtersPatch: {},
    });
}

// --- 3. Post-LLM Guards ---

function enforcePostLLMGuards(llm: RouteDecision, msg: string, input: RouterInput): RouteDecision {
    const normalized = normalizeDecision(llm, input);

    // If contract intent, force override even if LLM missed it
    if (hasAny(msg, ["contrato", "cláusula", "clausula", "vigência", "vigencia", "validade", "aditivo", "rescisão", "rescisao"])) {
        return makeDecision(input, {
            ...normalized,
            artifact_kind: "contract",
            task_kind: "factual_lookup",
            risk_level: "high",
            agent: "Agent_Contracts",
            retrieval_policy: "STRICT_DOCS_ONLY",
            confidence: Math.max(normalized.confidence, 0.95),
            reason: `Post-LLM guard: contract intent override. LLM said: ${normalized.agent}`,
            filtersPatch: {
                artifact_kind: "contract",
                source_table: ["acceptances", "contracts", "addenda"],
            }
        });
    }

    return normalized;
}

// --- 4. Main Hybrid Router ---

export async function routeRequestHybrid(
    input: RouterInput,
    deps: { callRouterLLM: (input: RouterInput) => Promise<RouteDecision> }
): Promise<RouteDecision> {
    const msg = input.user_message;

    // 1) Hard Gates
    const hard = hardGatePolicy(msg, input);
    if (hard) return hard;

    // 2) Heuristic
    const heuristic = routeHeuristic(msg, input);
    if (heuristic.confidence >= 0.78) {
        return heuristic;
    }

    // 3) Fallback LLM
    try {
        const llm = await deps.callRouterLLM(input);
        return enforcePostLLMGuards(llm, msg, input);
    } catch (err) {
        console.error("Router LLM failed, using heuristic fallback", err);
        return heuristic;
    }
}
