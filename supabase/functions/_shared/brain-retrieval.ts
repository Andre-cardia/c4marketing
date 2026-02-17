
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { BrainDocType, MatchFilters, RetrievedDoc, RetrievalPolicy } from "./brain-types.ts";

type SupabaseClient = ReturnType<typeof createClient>;

export interface MatchOptions {
    topK: number;
    minSimilarity?: number; // e.g. 0.72
    policy: RetrievalPolicy;
}

export async function matchBrainDocuments(params: {
    supabase: SupabaseClient;
    queryText: string;
    queryEmbedding?: number[]; // if already computed
    filters: MatchFilters;
    options: MatchOptions;
    embedder: (text: string) => Promise<number[]>;
}): Promise<RetrievedDoc[]> {
    const { supabase, queryText, filters, options, embedder } = params;

    const topK = clampInt(options.topK ?? 5, 1, 30);
    const minSim = options.minSimilarity ?? 0.0;

    // 1) Policy enforcement (hard rules)
    const normalizedFilters = applyPolicy(filters, options.policy);

    // 2) Compute embedding if needed
    const embedding = params.queryEmbedding ?? (await embedder(queryText));

    // 3) Call RPC
    const { data, error } = await supabase.rpc("match_brain_documents", {
        query_embedding: embedding,
        match_count: topK,
        filters: normalizedFilters,
    });

    if (error) {
        console.error("RPC match_brain_documents error:", error);
        throw new Error(`match_brain_documents failed: ${error.message}`);
    }

    const docs: RetrievedDoc[] = (data ?? [])
        .map((row: any) => ({
            id: row.id,
            content: row.content,
            similarity: Number(row.similarity ?? row.score ?? 0),
            metadata: row.metadata ?? {},
        }))
        .filter((d: RetrievedDoc) => d.similarity >= minSim)
        .sort((a: RetrievedDoc, b: RetrievedDoc) => b.similarity - a.similarity);

    return docs;
}

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * Apply hard safety rules depending on retrieval policy
 */
function applyPolicy(filters: MatchFilters, policy: RetrievalPolicy): MatchFilters {
    const f: MatchFilters = { ...filters };

    const allow = new Set<BrainDocType>(f.type_allowlist ?? []);
    const block = new Set<BrainDocType>(f.type_blocklist ?? []);

    const ensureAllow = (...types: BrainDocType[]) => types.forEach((t) => {
        allow.add(t);
        block.delete(t);
    });
    const ensureBlock = (...types: BrainDocType[]) => types.forEach((t) => {
        block.add(t);
        allow.delete(t);
    });

    switch (policy) {
        case "STRICT_DOCS_ONLY": {
            // official docs + summaries allowed; chat logs blocked
            ensureAllow("official_doc", "database_record", "session_summary");
            ensureBlock("chat_log");
            f.time_window_minutes = null; // not needed
            break;
        }

        case "DOCS_PLUS_RECENT_CHAT": {
            ensureAllow("official_doc", "database_record", "session_summary");
            // allow chat logs ONLY when time window is set
            if (f.time_window_minutes && f.time_window_minutes > 0) {
                ensureAllow("chat_log");
            } else {
                ensureBlock("chat_log");
            }
            break;
        }

        case "CHAT_ONLY": {
            // Only chat log + session summaries
            allow.clear();
            block.clear(); // clear previous to avoid conflict
            ensureAllow("chat_log", "session_summary");
            break;
        }

        case "OPS_ONLY": {
            allow.clear();
            block.clear();
            ensureAllow("system_note");
            f.artifact_kind = "ops";
            break;
        }
    }

    f.type_allowlist = Array.from(allow);
    f.type_blocklist = Array.from(block);

    return f;
}

export function makeOpenAIEmbedder(opts: {
    apiKey: string;
    model?: string; // "text-embedding-3-small"
}) {
    const model = opts.model ?? "text-embedding-3-small";

    return async (text: string): Promise<number[]> => {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: text,
            }),
        });

        if (!res.ok) {
            const msg = await res.text().catch(() => "");
            throw new Error(`Embeddings error: ${res.status} ${msg}`);
        }

        const json = await res.json();
        return json.data[0].embedding as number[];
    };
}
