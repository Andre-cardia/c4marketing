
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

                // Buscar perfil completo do usuário (por email, pois app_users.id ≠ auth.users.id)
                const userEmail = user.email
                if (userEmail) {
                    const { data: profile } = await supabaseAdmin
                        .from('app_users')
                        .select('name, email, role, full_name')
                        .eq('email', userEmail)
                        .single()

                    if (profile) {
                        userProfile = profile
                        userRole = profile.role || userRole
                    }
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

        // LLM Router com Function Calling — o LLM escolhe qual RPC usar
        const availableTools = [
            {
                type: "function" as const,
                function: {
                    name: "query_all_proposals",
                    description: "Consultar propostas comerciais. Use para listar, contar ou filtrar propostas criadas pela empresa.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_status_filter: {
                                type: "string",
                                enum: ["all", "open", "accepted"],
                                description: "Filtro: 'open' = propostas ainda não aceitas/em aberto/pendentes. 'accepted' = propostas que já receberam aceite. 'all' = todas."
                            }
                        },
                        required: ["p_status_filter"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_all_clients",
                    description: "Consultar clientes (acceptances). Use para listar, contar ou filtrar clientes que aceitaram propostas.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_status: {
                                type: "string",
                                enum: ["Ativo", "Inativo", "Suspenso", "Cancelado", "Finalizado"],
                                description: "Filtro por status do cliente. Omita para retornar todos."
                            }
                        }
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_all_projects",
                    description: "Consultar projetos de serviço (Gestão de Tráfego, Criação de Site, Landing Page). Use para listar projetos e seus status.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_service_type: {
                                type: "string",
                                enum: ["traffic", "website", "landing_page"],
                                description: "Filtro por tipo de serviço. Omita para retornar todos."
                            },
                            p_status_filter: {
                                type: "string",
                                enum: ["Ativo", "Inativo"],
                                description: "Filtro por status do cliente vinculado. Omita para retornar todos."
                            }
                        }
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_all_users",
                    description: "Consultar lista de usuários/colaboradores da equipe interna, com nome, email, cargo e último acesso.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_all_tasks",
                    description: "Consultar tarefas e pendências dos projetos/clientes. Use para: 'tem tarefa pendente?', 'quais as pendências?', 'tarefas em andamento', etc. Sempre use esta ferramenta quando o usuário perguntar sobre tarefas, pendências ou atividades.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_id: {
                                type: "number",
                                description: "ID do projeto para filtrar tarefas. Omita para retornar todos os projetos."
                            },
                            p_status: {
                                type: "string",
                                enum: ["todo", "in_progress", "done", "review"],
                                description: "Filtro por status da tarefa. Omita para retornar todas. 'todo' = pendentes, 'in_progress' = em andamento."
                            }
                        }
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_access_summary",
                    description: "Consultar logs de acesso ao sistema. Mostra quem acessou, quantas vezes, primeiro e último acesso.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "rag_search",
                    description: "Busca semântica no acervo de documentos (contratos, propostas, políticas, manuais). Use quando a pergunta é sobre conteúdo de documentos, cláusulas, análises ou informações que não estão em tabelas estruturadas.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_survey_responses",
                    description: "Consultar respostas de pesquisas/formulários preenchidos pelos clientes. Use para perguntas como 'o que o cliente achou?', 'respostas do onboarding', 'feedback do cliente', 'dados do formulário', etc.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_client_name: {
                                type: "string",
                                description: "Nome do cliente (partial match). Ex: 'Amplexo' para buscar 'Grupo Amplexo'."
                            },
                            p_project_type: {
                                type: "string",
                                enum: ["traffic", "website", "landing_page"],
                                description: "Tipo de projeto/pesquisa. Omita para buscar em todos."
                            }
                        }
                    }
                }
            }
        ]

        const callRouterLLM = async (input: RouterInput): Promise<RouteDecision> => {
            // Classificação por Function Calling com GPT-4o-mini (rápido e barato)
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0,
                tools: availableTools,
                tool_choice: "required",
                messages: [
                    {
                        role: 'system',
                        content: `Você é o ROUTER inteligente do "Segundo Cérebro" da C4 Marketing.
Sua função é entender a intenção do usuário e escolher a ferramenta correta para responder.
Analise o contexto semântico da pergunta — NÃO dependa de palavras-chave exatas.
Exemplos:
- "quais propostas estão em aberto?" → query_all_proposals(p_status_filter: "open")
- "quem são nossos clientes ativos?" → query_all_clients(p_status: "Ativo")
- "liste todos os projetos de tráfego" → query_all_projects(p_service_type: "traffic")
- "quem acessou o sistema hoje?" → query_access_summary()
- "o que diz o contrato com a empresa X?" → rag_search()
- "quais tarefas estão pendentes?" → query_all_tasks(p_status: "todo")
- "quantas propostas já foram aceitas?" → query_all_proposals(p_status_filter: "accepted")
- "quantas propostas já foram aceitas?" → query_all_proposals(p_status_filter: "accepted")
- "me fale sobre o cliente Amplexo" → rag_search() (busca semântica)
- "o que a Amplexo respondeu na pesquisa?" → query_survey_responses(p_client_name: "Amplexo")
- "mostre as respostas do formulário de tráfego" → query_survey_responses(p_project_type: "traffic")
Escolha UMA ferramenta e seus parâmetros.`
                    },
                    { role: 'user', content: input.user_message }
                ]
            })

            const toolCall = completion.choices[0].message.tool_calls?.[0]

            if (toolCall) {
                const funcName = toolCall.function.name
                const funcArgs = JSON.parse(toolCall.function.arguments || '{}')

                console.log(`[LLM Router] Chose: ${funcName}(${JSON.stringify(funcArgs)})`)

                // Mapear função para agente e configuração
                const funcToAgent: Record<string, { agent: string; artifact_kind: string }> = {
                    'query_all_proposals': { agent: 'Agent_Proposals', artifact_kind: 'proposal' },
                    'query_all_clients': { agent: 'Agent_Client360', artifact_kind: 'client' },
                    'query_all_projects': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'query_all_users': { agent: 'Agent_BrainOps', artifact_kind: 'ops' },
                    'query_all_tasks': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'query_access_summary': { agent: 'Agent_BrainOps', artifact_kind: 'ops' },
                    'query_survey_responses': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'rag_search': { agent: 'Agent_Projects', artifact_kind: 'unknown' },
                }

                const config = funcToAgent[funcName] || funcToAgent['rag_search']
                const isDbQuery = funcName !== 'rag_search'

                return {
                    artifact_kind: config.artifact_kind,
                    task_kind: 'factual_lookup',
                    risk_level: 'low',
                    agent: config.agent,
                    retrieval_policy: 'STRICT_DOCS_ONLY',
                    filters: {
                        tenant_id: input.tenant_id,
                        type_allowlist: ['official_doc', 'session_summary'],
                        type_blocklist: ['chat_log'],
                        artifact_kind: config.artifact_kind,
                        source_table: null,
                        client_id: null,
                        project_id: null,
                        source_id: null,
                        status: 'active',
                        time_window_minutes: null,
                    },
                    top_k: isDbQuery ? 0 : 10,
                    tools_allowed: ['rag_search', 'db_read'],
                    tool_hint: isDbQuery ? 'db_query' : 'rag_search',
                    db_query_params: isDbQuery ? { rpc_name: funcName, ...funcArgs } : undefined,
                    confidence: 0.95,
                    reason: `LLM Router: ${funcName}(${JSON.stringify(funcArgs)})`,
                } as RouteDecision
            }

            // Fallback se LLM não escolheu tool
            return {
                artifact_kind: 'unknown',
                task_kind: 'factual_lookup',
                risk_level: 'low',
                agent: 'Agent_Projects',
                retrieval_policy: 'STRICT_DOCS_ONLY',
                filters: {
                    tenant_id: input.tenant_id,
                    type_allowlist: ['official_doc', 'session_summary'],
                    type_blocklist: ['chat_log'],
                    artifact_kind: null,
                    source_table: null,
                    client_id: null,
                    project_id: null,
                    source_id: null,
                    status: 'active',
                    time_window_minutes: null,
                },
                top_k: 6,
                tools_allowed: ['rag_search'],
                tool_hint: 'rag_search',
                confidence: 0.5,
                reason: 'LLM Router: no tool selected, fallback to RAG',
            } as RouteDecision
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
            // Limpar valores null/undefined dos parâmetros (RPCs usam DEFAULT NULL)
            const cleanParams: Record<string, any> = {}
            for (const [k, v] of Object.entries(rpcParams)) {
                if (v !== null && v !== undefined && v !== 'null') cleanParams[k] = v
            }
            console.log(`[Tool] db_query params:`, JSON.stringify(cleanParams))
            const { data, error: rpcError } = await supabaseAdmin.rpc(rpc_name, cleanParams)

            if (rpcError) {
                console.error('RPC error:', rpcError)
                contextText = `Erro ao consultar banco de dados: ${rpcError.message}`
            } else if (!data || (Array.isArray(data) && data.length === 0) || data === '[]') {
                contextText = `CONSULTA REALIZADA COM SUCESSO via ${rpc_name}, mas NENHUM registro foi encontrado. Informe ao usuário que a consulta foi feita no banco de dados e não há registros correspondentes no momento.`
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
