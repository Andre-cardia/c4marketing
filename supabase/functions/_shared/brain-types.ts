
export type RetrievalPolicy =
  | "STRICT_DOCS_ONLY"
  | "NORMATIVE_FIRST"
  | "DOCS_PLUS_RECENT_CHAT"
  | "CHAT_ONLY"
  | "OPS_ONLY"
  | "CANONICAL_ALWAYS"; // Tier-1: documentos canônicos corporativos (tenant c4_corporate_identity)

export type BrainDocType =
  | "official_doc"
  | "database_record" // Legacy/Default type from ingestion
  | "chat_log"
  | "session_summary"
  | "system_note";

export type ArtifactKind =
  | "contract"
  | "proposal"
  | "project"
  | "client"
  | "policy"
  | "ops"
  | "unknown";

export type TaskKind =
  | "factual_lookup"
  | "summarization"
  | "drafting"
  | "analysis"
  | "operation";

export type RiskLevel = "low" | "medium" | "high";

export type AgentName =
  | "Agent_Contracts"
  | "Agent_Proposals"
  | "Agent_Projects"
  | "Agent_Client360"
  | "Agent_GovernanceSecurity"
  | "Agent_BrainOps"
  | "Agent_Executor";

export interface MatchFilters {
  tenant_id: string;

  // allow/block doc types
  type_allowlist?: BrainDocType[];
  type_blocklist?: BrainDocType[];

  // segmentation
  artifact_kind?: ArtifactKind | null;
  source_table?: string[] | string | null;

  // identity / scope
  client_id?: string | null;
  project_id?: string | null;
  source_id?: string | null;

  // lifecycle
  status?: "active" | "draft" | "superseded" | "archived" | string;

  // time window (only for chat/session scoped retrieval)
  time_window_minutes?: number | null;

  // optional: security tier and authority gating
  security_tier_allowlist?: string[];
  authority_allowlist?: string[];

  // normative governance (optional, rollout-safe)
  normative_mode?: boolean;
  require_current?: boolean;
  require_searchable?: boolean;
  authority_rank_min?: number | null;

  // canonical corporate layer (Tier 1)
  role_allowlist?: string[] | null;  // cargos com acesso ao documento canônico
  canonical_scope?: boolean;         // quando true, ignora tenant isolation e usa get_canonical_corporate_docs
}

export interface RetrievedDoc {
  id: string;
  content: string;
  similarity: number; // 0..1 (cosine similarity)
  metadata: Record<string, any>;
}

export interface RouteFilters extends MatchFilters { }

export interface RouteDecision {
  artifact_kind: ArtifactKind;
  task_kind: TaskKind;
  risk_level: RiskLevel;
  agent: AgentName;
  retrieval_policy: RetrievalPolicy;
  filters: RouteFilters;
  top_k: number;
  tools_allowed: Array<"rag_search" | "db_read" | "brain_sync">;
  tool_hint: "rag_search" | "db_query";  // qual ferramenta principal usar
  db_query_params?: Record<string, any>; // parâmetros para query SQL direta
  confidence: number; // 0..1
  reason: string; // audit/debug
}

export interface RouterInput {
  tenant_id: string;
  session_id: string;
  user_role: string; // "gestor" etc
  user_message: string;

  // optional hints resolved upstream (if you already extracted ids)
  client_id?: string | null;
  project_id?: string | null;
  source_id?: string | null;
}
