
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

        // 1. Get User Context
        const authHeader = req.headers.get('Authorization')
        let userRole = 'anon'
        let userId = 'anon_user'
        let userProfile: any = null

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

                // Buscar perfil completo do usuário
                const { data: profile } = await supabaseAdmin
                    .from('app_users')
                    .select('name, email, role, full_name')
                    .eq('id', userId)
                    .single()

                if (profile) {
                    userProfile = profile
                    userRole = profile.role || userRole
                }
            }
        }

        // 1b. Carregar histórico da sessão (memória cognitiva)
        let sessionMessages: Array<{ role: string; content: string }> = []

        if (session_id) {
            const { data: history } = await supabaseAdmin
                .rpc('get_session_history', { p_session_id: session_id, p_limit: 20 })

            if (history && history.length > 0) {
                // O RPC retorna em ordem DESC, precisamos inverter para cronológico
                sessionMessages = history
                    .reverse()
                    .map((m: any) => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content
                    }))
            }
        }

        // 2. Router Step
        const routerInput: RouterInput = {
            tenant_id: userId,
            session_id: session_id,
            user_role: userRole,
            user_message: query,
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
Você é o ROUTER do "Segundo Cérebro".
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

        // 3. Retrieval Step (Hybrid: RAG ou SQL direto)
        let contextText = ''
        let retrievedDocs: any[] = []

        if (decision.tool_hint === 'db_query' && decision.db_query_params) {
            // === SQL DIRETO (listagens, contagens, filtros exatos) ===
            console.log(`[Tool] db_query → ${decision.db_query_params.rpc_name}`)
            const { rpc_name, ...rpcParams } = decision.db_query_params
            const { data, error: rpcError } = await supabaseAdmin.rpc(rpc_name, rpcParams)

            if (rpcError) {
                console.error('RPC error:', rpcError)
                contextText = `Erro ao consultar banco de dados: ${rpcError.message}`
            } else if (!data || (Array.isArray(data) && data.length === 0)) {
                contextText = 'Nenhum registro encontrado no banco de dados.'
            } else {
                const records = Array.isArray(data) ? data : [data]
                contextText = `DADOS DO BANCO DE DADOS (${records.length} registros encontrados via ${rpc_name}):\n\n`
                contextText += JSON.stringify(records, null, 2)
            }
        } else {
            // === RAG (busca semântica) ===
            console.log(`[Tool] rag_search → top_k: ${decision.top_k}`)
            const embedder = makeOpenAIEmbedder({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

            retrievedDocs = await matchBrainDocuments({
                supabase: supabaseAdmin,
                queryText: query,
                filters: decision.filters,
                options: {
                    topK: decision.top_k,
                    policy: decision.retrieval_policy
                },
                embedder
            })

            contextText = retrievedDocs.map(d => {
                const meta = d.metadata || {};
                const source = meta.source_table || meta.title || 'Unknown Source';
                return `[ID: ${d.id} | Source: ${source} | Type: ${meta.type}]: ${d.content}`;
            }).join('\n\n')
        }

        // 4. Generation Step — com identidade do usuário e histórico
        const agentConfig = AGENTS[decision.agent] || AGENTS["Agent_Projects"]

        // Montar bloco de identidade
        const identityBlock = userProfile
            ? `\nIDENTIDADE DO USUÁRIO (quem está conversando com você):\n- Nome: ${userProfile.full_name || userProfile.name}\n- Email: ${userProfile.email}\n- Cargo: ${userProfile.role}\nVocê deve se dirigir ao usuário pelo nome e adaptar sua linguagem ao cargo dele.`
            : ''

        const systemPrompt = `
${agentConfig.getSystemPrompt()}
${identityBlock}

FONTE DOS DADOS: ${decision.tool_hint === 'db_query' ? 'Consulta SQL direta no banco de dados (dados completos e atualizados)' : 'Busca semântica no acervo vetorial'}

CONTEXTO RECUPERADO:
${contextText || "Nenhum documento relevante encontrado."}
        `.trim()

        // Montar mensagens multi-turn (system + histórico + pergunta atual)
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
        ]

        // Incluir histórico da sessão (memória de curto prazo)
        if (sessionMessages.length > 0) {
            for (const msg of sessionMessages) {
                messages.push({ role: msg.role, content: msg.content })
            }
        }

        // Mensagem atual do usuário
        messages.push({ role: 'user', content: query })

        const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages as any,
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
