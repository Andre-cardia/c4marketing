
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
  | "Agent_MarketingTraffic"
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

// --- Controller Agent ---

export interface Observation {
  iteration: number;
  toolName: string;
  input: Record<string, any>;
  output: string;       // texto retornado pela tool (para compor workingMemory)
  success: boolean;
  timestamp: number;
}

export interface ControllerResult {
  answer: string;
  iterations: number;
  observations: Observation[];
  evaluationResult: EvaluationResult | null;
  finalDecision: RouteDecision;
  totalCostEst: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// --- CUA (Computer-Use Agent) ---

export type CUAActionType =
  | "create_proposal"
  | "update_proposal"
  | "update_proposal_status"
  | "add_proposal_service"
  | "create_task"
  | "assign_task"
  | "move_task"
  | "invite_user"
  | "update_user_role"
  | "deactivate_user"
  | "update_document"
  | "generate_contract"
  | "mark_clause_reviewed"
  | "save_report"
  | "schedule_report"
  | "deliver_report";

export type CUASessionType = "one_shot" | "monitoring" | "scheduled";
export type CUASessionStatus = "active" | "paused" | "stopped" | "completed";
export type CUASeverity = "info" | "warning" | "critical";
export type CUAActionStatus = "pending" | "executed" | "failed" | "rolled_back";

export interface CUASession {
  id: string;
  session_type: CUASessionType;
  objective: string;
  status: CUASessionStatus;
  created_by: string;        // email do gestor
  interval_minutes: number;
  max_hours: number;
  iteration_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export interface CUAAction {
  id: string;
  session_id: string | null;
  action_type: CUAActionType;
  severity: CUASeverity;
  params: Record<string, any>;
  result: Record<string, any>;
  status: CUAActionStatus;
  can_rollback: boolean;
  rollback_deadline: string | null;
  executed_at: string | null;
  rolled_back_at: string | null;
  executed_by: string | null;
  created_at: string;
}

// --- Evaluator Agent ---

export interface EvaluationInput {
  query: string;
  answer: string;
  observations: Observation[];
  agentName: AgentName;
}

export interface EvaluationResult {
  score: number;        // 0..1
  pass: boolean;        // score >= 0.70
  issues: string[];     // problemas identificados
  suggestion: string;   // sugestão de melhoria (usado em refineAnswer)
  model: string;
  latency_ms: number;
  cost_est: number;
}
