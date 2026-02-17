
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

import { matchBrainDocuments, makeOpenAIEmbedder } from '../_shared/brain-retrieval.ts'
import { routeRequestHybrid } from '../_shared/agents/router.ts'
import { AGENTS } from '../_shared/agents/specialists.ts'
import { RouterInput, RouteDecision } from '../_shared/brain-types.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { query, session_id } = await req.json()

        if (!query) throw new Error('Query is required')

        // 0. Setup Clients
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        })

        // 1. Get User Context (Optional but recommended for strict tenant isolation)
        // For now, we use a placeholder tenant if not extracted from JWT
        const authHeader = req.headers.get('Authorization')
        let userRole = 'anon'
        let userId = 'anon_user'

        if (authHeader) {
            const client = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader } } }
            )
            const { data: { user } } = await client.auth.getUser()
            if (user) {
                userId = user.id
                userRole = user.role ?? 'authenticated'
            }
        }

        // 2. Router Step
        const routerInput: RouterInput = {
            tenant_id: userId, // Using UserID as TenantID alias for single-tenant logic, or literal tenant if multi-tenant
            session_id: session_id,
            user_role: userRole,
            user_message: query,
            // Optional hints could be extracted here if needed
        }

        const callRouterLLM = async (input: RouterInput): Promise<RouteDecision> => {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: 'system',
                        content: `
Você é o ROUTER do “Segundo Cérebro”.
Classifique a solicitação e retorne um JSON.
OUTPUT Schema:
{
  "artifact_kind": "contract|proposal|project|client|policy|ops|unknown",
  "task_kind": "factual_lookup|summarization|drafting|analysis|operation",
  "risk_level": "low|medium|high",
  "agent": "Agent_Contracts|Agent_Proposals|Agent_Projects|Agent_Client360|Agent_GovernanceSecurity|Agent_BrainOps",
  "retrieval_policy": "STRICT_DOCS_ONLY|DOCS_PLUS_RECENT_CHAT|CHAT_ONLY|OPS_ONLY",
  "filters": {
     "artifact_kind": string,
     "status": "active", 
     "type_blocklist": ["chat_log"]
  },
  "top_k": 5,
  "confidence": 0.8,
  "reason": "explanation"
}
                        `.trim()
                    },
                    { role: 'user', content: `Message: ${input.user_message}` }
                ]
            })
            const text = completion.choices[0].message.content ?? "{}"
            return JSON.parse(text) as RouteDecision
        }

        const decision = await routeRequestHybrid(routerInput, { callRouterLLM })

        console.log(`[Router] Decision: ${decision.agent} (Risk: ${decision.risk_level})`)

        // 3. Retrieval Step (Specialist)
        const embedder = makeOpenAIEmbedder({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

        const retrievedDocs = await matchBrainDocuments({
            supabase: supabaseAdmin,
            queryText: query,
            filters: decision.filters,
            options: {
                topK: decision.top_k,
                policy: decision.retrieval_policy
            },
            embedder
        })



        // 4. Generation Step
        const agentConfig = AGENTS[decision.agent] || AGENTS["Agent_Projects"] // default

        const contextText = retrievedDocs.map(d => {
            const meta = d.metadata || {};
            const source = meta.source_table || meta.title || 'Unknown Source';
            return `[ID: ${d.id} | Source: ${source} | Type: ${meta.type}]: ${d.content}`;
        }).join('\n\n')

        const systemPrompt = `
${agentConfig.getSystemPrompt()}

CONTEXTO RECUPERADO:
${contextText || "Nenhum documento relevante encontrado."}
        `.trim()

        const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            temperature: 0.1
        })

        const answer = chatResponse.choices[0].message.content

        // 5. Return
        return new Response(JSON.stringify({
            answer,
            documents: retrievedDocs,
            meta: {
                decision: decision,
                agent: agentConfig.name
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Error in chat-brain:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
