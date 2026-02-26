
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

import { matchBrainDocuments, makeOpenAIEmbedder } from '../_shared/brain-retrieval.ts'
import { routeRequestHybrid } from '../_shared/agents/router.ts'
import { AGENTS } from '../_shared/agents/specialists.ts'
import { RouterInput, RouteDecision, RetrievalPolicy } from '../_shared/brain-types.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const startTime = performance.now()
        const requestBody = await req.json()
        const query = typeof requestBody?.query === 'string' ? requestBody.query : ''
        const session_id = typeof requestBody?.session_id === 'string' ? requestBody.session_id : null
        const forcedAgentRaw = typeof requestBody?.forced_agent === 'string'
            ? requestBody.forced_agent.trim()
            : null

        // Idempotency: Se recebido do frontend, evita duplicação de execução pesada em retentativa.
        const idempotencyKey = req.headers.get('x-idempotency-key') || null
        const rawClientToday = typeof requestBody?.client_today === 'string' ? requestBody.client_today.trim() : null
        const clientTimezone = typeof requestBody?.client_tz === 'string' ? requestBody.client_tz.trim() : 'America/Sao_Paulo'
        const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
        const clientToday = rawClientToday && isIsoDate(rawClientToday) ? rawClientToday : null
        const runtimeToday = (() => {
            // Sempre calcular a data atual no fuso de Brasília (America/Sao_Paulo)
            const now = new Date()
            const brasiliaDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(now) // Retorna YYYY-MM-DD no locale en-CA
            return brasiliaDate
        })()

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
        const forcedAgent = forcedAgentRaw && Object.prototype.hasOwnProperty.call(AGENTS, forcedAgentRaw)
            ? forcedAgentRaw
            : null
        const forcedAgentAllowedRoles: Record<string, string[]> = {
            Agent_MarketingTraffic: ['gestor', 'operacional', 'admin'],
        }

        const getProjectRefFromSupabaseUrl = () => {
            try {
                const url = Deno.env.get('SUPABASE_URL') ?? ''
                const host = new URL(url).hostname
                return host.split('.')[0] || null
            } catch {
                return null
            }
        }

        const decodeJwtPayload = (token: string): Record<string, any> | null => {
            try {
                const parts = token.split('.')
                if (parts.length !== 3) return null
                const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
                const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
                const json = atob(padded)
                return JSON.parse(json)
            } catch {
                return null
            }
        }

        const getProjectRefFromPayload = (payload: Record<string, any> | null): string | null => {
            if (!payload) return null
            if (typeof payload.ref === 'string' && payload.ref) return payload.ref
            const iss = typeof payload.iss === 'string' ? payload.iss : ''
            const match = iss.match(/https:\/\/([a-z0-9]+)\.supabase\.co\/auth\/v1/i)
            return match?.[1] ?? null
        }

        const applyProfileByEmail = async (email: string | null) => {
            if (!email) return
            const { data: profile } = await supabaseAdmin
                .from('app_users')
                .select('name, email, role, full_name')
                .ilike('email', email)
                .limit(1)
                .maybeSingle()

            if (profile) {
                userProfile = profile
                userRole = profile.role || userRole
            } else if (userProfile && !userProfile.email) {
                userProfile.email = email
            }
        }

        if (authHeader) {
            const authToken = authHeader.replace(/^Bearer\s+/i, '').trim()
            const client = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader } } }
            )
            const { data: { user }, error: userAuthError } = await client.auth.getUser(authToken)
            if (userAuthError) {
                console.error('chat-brain auth.getUser error:', userAuthError.message)
            }
            if (user) {
                userId = user.id
                userRole = user.role ?? 'authenticated'
                const fallbackName =
                    user.user_metadata?.full_name
                    || user.user_metadata?.name
                    || (user.email ? user.email.split('@')[0] : 'Usuário')
                userProfile = {
                    name: fallbackName,
                    full_name: user.user_metadata?.full_name || fallbackName,
                    email: user.email || null,
                    role: userRole,
                }
                await applyProfileByEmail(user.email || null)
            } else {
                // Fallback resiliente: JWT pode estar inválido para verificação, mas ainda conter claims úteis.
                // Usado para evitar bloqueio completo do chat quando a sessão local está inconsistente.
                const payload = decodeJwtPayload(authToken)
                const expectedRef = getProjectRefFromSupabaseUrl()
                const tokenRef = getProjectRefFromPayload(payload)
                const tokenSub = typeof payload?.sub === 'string' ? payload.sub : null
                const tokenRole = typeof payload?.role === 'string' ? payload.role : 'authenticated'
                const refMatches = !expectedRef || !tokenRef || tokenRef === expectedRef

                if (tokenSub && refMatches) {
                    userId = tokenSub
                    userRole = tokenRole || 'authenticated'

                    let fallbackEmail = typeof payload?.email === 'string' ? payload.email : null
                    let fallbackName =
                        payload?.user_metadata?.full_name
                        || payload?.user_metadata?.name
                        || (fallbackEmail ? fallbackEmail.split('@')[0] : 'Usuário')

                    const { data: adminUserData, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(tokenSub)
                    if (!adminUserError && adminUserData?.user) {
                        const adminUser = adminUserData.user
                        fallbackEmail = fallbackEmail || adminUser.email || null
                        fallbackName =
                            adminUser.user_metadata?.full_name
                            || adminUser.user_metadata?.name
                            || fallbackName
                    } else if (adminUserError) {
                        console.error('chat-brain auth.admin.getUserById fallback error:', adminUserError.message)
                    }

                    userProfile = {
                        name: fallbackName,
                        full_name: fallbackName,
                        email: fallbackEmail,
                        role: userRole,
                    }
                    await applyProfileByEmail(fallbackEmail)
                    console.warn(`chat-brain auth fallback engaged for user ${userId}`)
                } else {
                    console.error('chat-brain auth fallback failed (claims missing or ref mismatch)', {
                        expectedRef,
                        tokenRef,
                        hasSub: !!tokenSub,
                    })
                }
            }
        }

        // 1.1 Helper de Log Final unificado (v8.6)
        const logFinalAgentExecution = async (params: {
            agentName: string,
            action: string,
            status: string,
            answer: string,
            result?: any,
            latencyMs?: number,
            error?: string
        }): Promise<string | null> => {
            try {
                const finalLatency = params.latencyMs || Math.round(performance.now() - startTime);
                const { data } = await supabaseAdmin.rpc('log_agent_execution', {
                    p_session_id: session_id,
                    p_agent_name: params.agentName,
                    p_action: params.action,
                    p_status: params.status,
                    p_params: {
                        decision: effectiveDecision,
                        idempotency_key: idempotencyKey,
                        model_usage: modelUsage
                    },
                    p_result: params.result || {},
                    p_latency_ms: finalLatency,
                    p_cost_est: totalCostEst,
                    p_error_message: params.error,
                    p_tokens_input: totalInputTokens,
                    p_tokens_output: totalOutputTokens,
                    p_tokens_total: (totalInputTokens + totalOutputTokens)
                });
                return data as string;
            } catch (logError) {
                console.error('[v8.6] Centralized log failed:', logError);
                return null;
            }
        };

        // O chat do /brain deve operar autenticado para preservar identidade/memória por usuário.
        if (userId === 'anon_user') {
            return new Response(JSON.stringify({
                error: 'Sessão inválida ou expirada. Faça login novamente.',
                meta: { auth: 'missing_or_invalid' }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401
            })
        }

        if (forcedAgentRaw && !forcedAgent) {
            return new Response(JSON.stringify({
                answer: `Agente forçado inválido: "${forcedAgentRaw}".`,
                documents: [],
                meta: { forced_agent_error: 'invalid_agent' }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        if (forcedAgent) {
            const allowedRoles = forcedAgentAllowedRoles[forcedAgent] || ['admin']
            const normalizedRole = (userRole || '').toLowerCase()
            if (!allowedRoles.includes(normalizedRole)) {
                return new Response(JSON.stringify({
                    answer: `Acesso negado ao ${forcedAgent} para o perfil atual (${userRole}).`,
                    documents: [],
                    meta: { forced_agent_error: 'forbidden_role', forced_agent: forcedAgent, user_role: userRole }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }
        }

        const normalizeText = (value: string) =>
            (value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

        const hasAny = (text: string, terms: string[]) => {
            const normalized = normalizeText(text)
            return terms.some((term) => normalized.includes(normalizeText(term)))
        }

        const toIsoDate = (year: number, month: number, day: number): string | null => {
            if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
            const dt = new Date(Date.UTC(year, month - 1, day))
            if (
                dt.getUTCFullYear() !== year ||
                dt.getUTCMonth() + 1 !== month ||
                dt.getUTCDate() !== day
            ) {
                return null
            }
            return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }

        const getEndOfMonthDay = (year: number, month: number) =>
            new Date(Date.UTC(year, month, 0)).getUTCDate()

        const monthNameToNumber: Record<string, number> = {
            janeiro: 1,
            jan: 1,
            fevereiro: 2,
            fev: 2,
            marco: 3,
            mar: 3,
            abril: 4,
            abr: 4,
            maio: 5,
            mai: 5,
            junho: 6,
            jun: 6,
            julho: 7,
            jul: 7,
            agosto: 8,
            ago: 8,
            setembro: 9,
            set: 9,
            outubro: 10,
            out: 10,
            novembro: 11,
            nov: 11,
            dezembro: 12,
            dez: 12,
        }

        const extractReferenceDateFromText = (text: string): string | null => {
            const raw = String(text || '').trim()
            if (!raw) return null

            const isoMatch = raw.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/)
            if (isoMatch) {
                const parsed = toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
                if (parsed) return parsed
            }

            const brDateMatch = raw.match(/\b([0-2]?\d|3[01])\/(0?\d|1[0-2])\/(20\d{2})\b/)
            if (brDateMatch) {
                const parsed = toIsoDate(Number(brDateMatch[3]), Number(brDateMatch[2]), Number(brDateMatch[1]))
                if (parsed) return parsed
            }

            const normalized = normalizeText(raw)
            if (/\bhoje\b/.test(normalized)) {
                return clientToday || runtimeToday
            }

            const currentYear = Number((clientToday || runtimeToday).slice(0, 4))
            const monthYearMatch = normalized.match(/\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/)
            if (monthYearMatch) {
                const month = Number(monthYearMatch[1])
                const year = Number(monthYearMatch[2])
                return toIsoDate(year, month, getEndOfMonthDay(year, month))
            }

            const monthTokenMatch = normalized.match(/\b(janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)\b(?:\s*(?:de|\/|-)?\s*(20\d{2}))?/)
            if (monthTokenMatch) {
                const token = monthTokenMatch[1]
                const month = monthNameToNumber[token]
                if (month) {
                    const year = monthTokenMatch[2] ? Number(monthTokenMatch[2]) : currentYear
                    return toIsoDate(year, month, getEndOfMonthDay(year, month))
                }
            }

            return null
        }

        const inferredReferenceDate = extractReferenceDateFromText(query)

        const isTruthyFlag = (value: string | null | undefined) =>
            ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase().trim())

        // Rollout-safe: enabled only when explicitly configured in Supabase secrets.
        const normativeGovernanceEnabled = isTruthyFlag(
            Deno.env.get('BRAIN_NORMATIVE_GOVERNANCE_ENABLED')
        )

        // Camada canônica corporativa (Tier 1) — injetada no topo do system prompt.
        const canonicalMemoryEnabled = isTruthyFlag(
            Deno.env.get('BRAIN_CANONICAL_MEMORY_ENABLED')
        )

        // Baseline imutável do Tier-1: sempre presente no system prompt, mesmo sem retrieval canônico.
        const canonicalTier1Baseline = `
[TIER-1: MISSÃO]
Acelerar o crescimento de empresas brasileiras com marketing de performance e IA, unindo dados, criatividade e tecnologia para gerar resultados mensuráveis e sustentáveis.

[TIER-1: VISÃO]
Ser a agência de performance mais recomendada do Brasil até 2029, com expansão para a América Latina mantendo excelência operacional.

[TIER-1: VALORES]
Foco no cliente, resultados mensuráveis, transparência e ética, inovação contínua, resiliência, colaboração e desenvolvimento humano.

[TIER-1: END GAME]
Liderar no Brasil em marketing de performance com IA, ajudando clientes a multiplicar resultados com execução disciplinada e previsível.
        `.trim()

        const trafficAllowedReadRpcs = new Set([
            'query_survey_responses',
            'query_all_clients',
            'query_all_tasks',
        ])

        const isTrafficOutOfScopeIntent = (text: string) => hasAny(text, [
            'mrr', 'arr', 'faturamento', 'receita', 'run rate', 'recorrente',
            'mensalidade', 'ticket medio', 'ticket médio', 'financeiro', 'financeira',
            'proposta', 'propostas', 'orcamento', 'orçamento', 'setup fee', 'media limit',
            'comercial', 'pipeline comercial', 'funil comercial', 'taxa de fechamento', 'close rate',
        ])

        const isOpenTasksIntent = (text: string) =>
            hasAny(text, ['tarefa', 'tarefas', 'pendencia', 'pendência', 'pendente', 'pendentes'])
            && hasAny(text, ['em aberto', 'aberto', 'abertas', 'abertos'])

        const isOpenTaskStatus = (status: unknown) => {
            const normalized = String(status || '').toLowerCase().trim()
            return normalized !== 'done'
                && normalized !== 'canceled'
                && normalized !== 'cancelled'
                && normalized !== 'cancelado'
                && normalized !== 'concluido'
                && normalized !== 'concluído'
                && normalized !== 'finalizado'
        }

        const stripBareTypedJsonObjects = (value: string): string => {
            if (!value) return value
            let output = ''
            let cursor = 0

            while (cursor < value.length) {
                const remaining = value.slice(cursor)
                const match = remaining.match(/\{\s*"type"\s*:/)
                if (!match || typeof match.index !== 'number') {
                    output += remaining
                    break
                }

                const start = cursor + match.index
                output += value.slice(cursor, start)

                let depth = 0
                let inString = false
                let escaped = false
                let end = -1

                for (let i = start; i < value.length; i++) {
                    const ch = value[i]

                    if (inString) {
                        if (escaped) {
                            escaped = false
                        } else if (ch === '\\') {
                            escaped = true
                        } else if (ch === '"') {
                            inString = false
                        }
                        continue
                    }

                    if (ch === '"') {
                        inString = true
                        continue
                    }
                    if (ch === '{') {
                        depth += 1
                        continue
                    }
                    if (ch === '}') {
                        depth -= 1
                        if (depth === 0) {
                            end = i + 1
                            break
                        }
                    }
                }

                if (end === -1) {
                    output += value.slice(start)
                    break
                }

                cursor = end
                while (cursor < value.length && /\s/.test(value[cursor])) {
                    cursor += 1
                }
            }

            return output
        }

        type DbQueryCall = {
            rpc_name: string
            params: Record<string, any>
        }

        const dbRpcNames = new Set([
            'query_all_projects', 'query_all_clients', 'query_all_proposals',
            'query_all_users', 'query_all_tasks', 'query_access_summary',
            'query_financial_summary',
            'query_task_distribution_chart',
            'query_survey_responses',
            'execute_create_traffic_task',
            'execute_delete_task',
            'execute_move_task',
            'execute_update_project_status',
            'execute_update_task',
            'execute_batch_move_tasks',
            'execute_batch_delete_tasks',
            'execute_schedule_task',
        ])

        const cleanRpcParams = (params: Record<string, any>) => {
            const cleaned: Record<string, any> = {}
            for (const [k, v] of Object.entries(params || {})) {
                if (v !== null && v !== undefined && v !== 'null') cleaned[k] = v
            }
            return cleaned
        }

        const callKey = (call: DbQueryCall) => {
            const clean = cleanRpcParams(call.params)
            const sorted = Object.fromEntries(
                Object.entries(clean).sort(([a], [b]) => a.localeCompare(b))
            )
            return `${call.rpc_name}:${JSON.stringify(sorted)}`
        }

        const dedupeDbCalls = (calls: DbQueryCall[]) => {
            const seen = new Set<string>()
            const unique: DbQueryCall[] = []
            for (const call of calls) {
                const key = callKey(call)
                if (seen.has(key)) continue
                seen.add(key)
                unique.push({ rpc_name: call.rpc_name, params: cleanRpcParams(call.params) })
            }
            return unique
        }

        const inferSupplementalDbCalls = (text: string): DbQueryCall[] => {
            const calls: DbQueryCall[] = []

            // Evita falso-positivo: "data de criação" isolado não implica consulta de tarefas.
            // O contexto de tarefas deve ser explícito (tarefa/pendência/atraso).
            const mentionsTasks = hasAny(text, [
                'tarefa', 'tarefas',
                'pendencia', 'pendência', 'pendente', 'pendentes',
                'atrasad', 'vencid', 'fora do prazo', 'prazo estourado', 'deadline'
            ])
            const mentionsUsers = hasAny(text, [
                'usuario', 'usuário', 'usuarios', 'usuários',
                'colaborador', 'colaboradores', 'equipe', 'time',
                'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio',
                'cargo', 'funcao', 'função', 'papel',
                'presidente', 'fundador', 'dono', 'diretor executivo'
            ])
            const mentionsAccess = hasAny(text, ['acesso', 'acessos', 'acessou', 'logou', 'login', 'entrou'])
            const mentionsProjects = hasAny(text, ['projeto', 'projetos'])
            const mentionsClients = hasAny(text, ['cliente', 'clientes'])
            const mentionsProposals = hasAny(text, ['proposta', 'propostas', 'orcamento', 'orçamento'])
            const mentionsFinance = hasAny(text, [
                'mrr', 'arr', 'faturamento', 'receita', 'run rate',
                'recorrente', 'recorrencia', 'recorrência', 'ticket medio', 'ticket médio'
            ])

            if (mentionsTasks) {
                const wantsOverdueTasks = hasAny(text, [
                    'atrasad', 'vencid', 'fora do prazo', 'prazo estourado', 'deadline'
                ])
                const wantsOpenTasks = isOpenTasksIntent(text)
                // Detect "criadas hoje/ontem/nesta semana" intent
                const wantsCreatedOnDate = hasAny(text, ['criada', 'criadas', 'criado', 'criados', 'criação', 'criacao', 'data de criação', 'data de criacao', 'nova', 'novas', 'novo', 'novos', 'adicionada', 'adicionadas'])
                let p_status: string | null = null
                if (wantsOpenTasks) p_status = null
                else if (hasAny(text, ['pendente', 'pendentes', 'a fazer'])) p_status = 'backlog'
                else if (hasAny(text, ['em andamento', 'andamento'])) p_status = 'in_progress'
                else if (hasAny(text, ['aprovacao', 'aprovação', 'aguardando aprovacao', 'aguardando aprovação'])) p_status = 'approval'
                else if (hasAny(text, ['pausada', 'pausadas', 'pausado', 'pausados'])) p_status = 'paused'
                else if (hasAny(text, ['concluida', 'concluído', 'concluido', 'finalizada', 'finalizado'])) p_status = 'done'
                const taskParams: Record<string, any> = {}
                if (p_status) taskParams.p_status = p_status
                if (wantsOverdueTasks) {
                    taskParams.p_overdue = true
                    taskParams.p_reference_date = clientToday || runtimeToday
                    if (clientTimezone) taskParams.p_reference_tz = clientTimezone
                }
                // Pass created_date filter when user asks about tasks created on a specific date
                if (wantsCreatedOnDate && inferredReferenceDate) {
                    taskParams.p_created_date = inferredReferenceDate
                } else if (wantsCreatedOnDate && hasAny(text, ['hoje', 'today'])) {
                    taskParams.p_created_date = clientToday || runtimeToday
                }
                calls.push({ rpc_name: 'query_all_tasks', params: taskParams })
            }

            if (mentionsUsers && mentionsAccess) {
                calls.push({ rpc_name: 'query_access_summary', params: {} })
            } else if (mentionsUsers) {
                calls.push({ rpc_name: 'query_all_users', params: {} })
            } else if (mentionsAccess) {
                calls.push({ rpc_name: 'query_access_summary', params: {} })
            }

            if (mentionsProjects) {
                const params: Record<string, any> = {}
                if (hasAny(text, ['trafego', 'tráfego', 'traffic', 'gestao de trafego', 'gestão de tráfego'])) {
                    params.p_service_type = 'traffic'
                } else if (hasAny(text, ['site', 'website'])) {
                    params.p_service_type = 'website'
                } else if (hasAny(text, ['landing', 'lp', 'pagina de captura', 'página de captura'])) {
                    params.p_service_type = 'landing_page'
                }

                if (hasAny(text, ['ativo', 'ativos', 'ativa', 'ativas'])) {
                    params.p_status_filter = 'Ativo'
                } else if (hasAny(text, ['inativo', 'inativos', 'inativa', 'inativas'])) {
                    params.p_status_filter = 'Inativo'
                }

                calls.push({ rpc_name: 'query_all_projects', params })
            }

            if (mentionsClients) {
                const params: Record<string, any> = {}
                if (hasAny(text, ['ativo', 'ativos', 'ativa', 'ativas'])) {
                    params.p_status = 'Ativo'
                } else if (hasAny(text, ['inativo', 'inativos', 'inativa', 'inativas'])) {
                    params.p_status = 'Inativo'
                }
                calls.push({ rpc_name: 'query_all_clients', params })
            }

            if (mentionsProposals) {
                let p_status_filter: 'all' | 'open' | 'accepted' = 'all'
                if (hasAny(text, ['aberta', 'aberto', 'em aberto', 'pendente', 'pendentes', 'nao aceita', 'não aceita', 'sem aceite'])) {
                    p_status_filter = 'open'
                } else if (hasAny(text, ['aceita', 'aceitas', 'aprovada', 'aprovadas', 'fechada', 'fechadas', 'aceite'])) {
                    p_status_filter = 'accepted'
                }
                calls.push({ rpc_name: 'query_all_proposals', params: { p_status_filter } })
            }

            if (mentionsFinance) {
                const params: Record<string, any> = { p_reference_date: inferredReferenceDate || clientToday || runtimeToday }
                if (clientTimezone) params.p_reference_tz = clientTimezone
                if (hasAny(text, ['inativo', 'inativos', 'inativa', 'inativas'])) params.p_status = 'Inativo'
                else params.p_status = 'Ativo'
                calls.push({ rpc_name: 'query_financial_summary', params })
            }

            return dedupeDbCalls(calls).slice(0, 5)
        }

        const mergeDbCalls = (primary: DbQueryCall[], supplemental: DbQueryCall[]) =>
            dedupeDbCalls([...(primary || []), ...(supplemental || [])]).slice(0, 5)

        const enrichDbCalls = (calls: DbQueryCall[]): DbQueryCall[] =>
            calls.map((call) => {
                const params = cleanRpcParams(call.params)

                if (call.rpc_name === 'query_all_tasks') {
                    const overdueFlag = params.p_overdue === true || params.p_overdue === 'true'
                    if (!overdueFlag) {
                        return { rpc_name: call.rpc_name, params }
                    }

                    const enrichedTaskParams: Record<string, any> = { ...params }
                    if (!enrichedTaskParams.p_reference_date) enrichedTaskParams.p_reference_date = clientToday || runtimeToday
                    if (!enrichedTaskParams.p_reference_tz && clientTimezone) enrichedTaskParams.p_reference_tz = clientTimezone
                    return { rpc_name: call.rpc_name, params: cleanRpcParams(enrichedTaskParams) }
                }

                if (call.rpc_name === 'query_financial_summary') {
                    const enrichedFinancialParams: Record<string, any> = { ...params }
                    if (!enrichedFinancialParams.p_reference_date) enrichedFinancialParams.p_reference_date = inferredReferenceDate || clientToday || runtimeToday
                    if (!enrichedFinancialParams.p_status) enrichedFinancialParams.p_status = 'Ativo'
                    if (!enrichedFinancialParams.p_reference_tz && clientTimezone) enrichedFinancialParams.p_reference_tz = clientTimezone
                    return { rpc_name: call.rpc_name, params: cleanRpcParams(enrichedFinancialParams) }
                }

                return { rpc_name: call.rpc_name, params }
            })

        const isExplicitMemorySaveIntent = (text: string) => hasAny(text, [
            'guarde isso', 'guarde esta informacao', 'guarde essa informacao',
            'grave isso', 'grave essa informacao', 'grave esta informacao',
            'salve isso', 'salve essa informacao', 'salve esta informacao',
            'registre isso', 'registre essa informacao', 'registre esta informacao',
            'lembre disso', 'lembre que', 'para o futuro', 'memorize',
            'anote isso', 'fixe isso', 'salvar no cerebro', 'salvar no cérebro',
            'guardar no cerebro', 'guardar no cérebro'
        ])

        const extractMemoryFactText = (text: string) => {
            let raw = (text || '').replace(/\s+/g, ' ').trim()
            if (!raw) return ''
            const original = raw

            // Caso exista ":" após comando de memória, tudo após ":" é o fato.
            const colonIdx = raw.indexOf(':')
            if (colonIdx >= 0) {
                const beforeColon = normalizeText(raw.slice(0, colonIdx))
                const hasMemoryCommand = /(guarde|grave|salve|registre|memorize|anote|fixe|lembre|futuro|informacao)/i.test(beforeColon)
                if (hasMemoryCommand) {
                    const afterColon = raw.slice(colonIdx + 1).trim()
                    if (afterColon.length >= 8) raw = afterColon
                }
            }

            const cleanupPatterns = [
                /^(?:por favor[, ]*)?(?:guarde|grave|salve|registre|memorize|anote|fixe)\s*/i,
                /^(?:lembre(?:-me)?(?:\s+que)?|lembre\s+disso)\s*/i,
                /^(?:isso|isto)\s*/i,
                /^(?:essa|esta)\s+informa(?:c|ç)[aã]o\s*/i,
                /^(?:para\s+o\s+futuro)\s*/i,
                /^[:\-–—]\s*/,
                /^(?:que)\s*/i,
            ]

            let prev = ''
            while (raw !== prev) {
                prev = raw
                for (const pattern of cleanupPatterns) {
                    raw = raw.replace(pattern, '').trim()
                }
            }

            raw = raw.replace(/^["'“”]+|["'“”]+$/g, '').trim()
            return raw.length >= 8 ? raw : (original.length >= 8 ? original : '')
        }

        const persistExplicitMemoryFact = async (factText: string) => {
            const memoryContent = `FATO EXPLÍCITO INFORMADO PELO USUÁRIO (${new Date().toISOString()}): ${factText}`
            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: memoryContent,
            })

            const embedding = embeddingResponse.data[0].embedding
            const memoryMetadata = {
                type: 'session_summary',
                status: 'active',
                artifact_kind: 'unknown',
                source_table: 'user_facts',
                source: 'explicit_user_memory',
                tenant_id: userId,
                user_id: userId,
                session_id: session_id ?? null,
                fact_kind: 'user_asserted',
                authority_type: 'memo',
                authority_rank: 60,
                is_current: true,
                searchable: true,
                created_by: 'chat-brain',
                saved_at: new Date().toISOString(),
            }

            const { data: savedId, error: saveError } = await supabaseAdmin.rpc('insert_brain_document', {
                content: memoryContent,
                metadata: memoryMetadata,
                embedding,
            })

            if (saveError) {
                throw new Error(`Falha ao salvar memória explícita: ${saveError.message}`)
            }

            return savedId
        }

        const memoryWriteEvents: Array<{ stage: string; status: 'ok' | 'error'; id?: string; detail?: string }> = []

        const persistCognitiveChatMemory = async (
            role: 'user' | 'assistant',
            content: string,
            stage: string
        ) => {
            const normalizedContent = (content || '').replace(/\s+/g, ' ').trim()
            if (!normalizedContent) return null

            const memoryContent = `MEMÓRIA COGNITIVA (${new Date().toISOString()}) [${role.toUpperCase()}]: ${normalizedContent}`
            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: memoryContent,
            })
            const embedding = embeddingResponse.data[0].embedding

            const metadata = {
                type: 'chat_log',
                status: 'active',
                artifact_kind: 'unknown',
                source_table: 'chat_messages',
                source: 'cognitive_live_memory',
                tenant_id: userId,
                user_id: userId,
                session_id: session_id ?? null,
                role,
                authority_type: 'conversation',
                authority_rank: 20,
                searchable: true,
                created_by: 'chat-brain',
                saved_at: new Date().toISOString(),
            }

            const { data: savedId, error: saveError } = await supabaseAdmin.rpc('insert_brain_document', {
                content: memoryContent,
                metadata,
                embedding,
            })

            if (saveError) {
                memoryWriteEvents.push({ stage, status: 'error', detail: saveError.message })
                throw new Error(`Falha ao salvar memória cognitiva (${stage}): ${saveError.message}`)
            }

            memoryWriteEvents.push({ stage, status: 'ok', id: String(savedId || '') })
            return savedId
        }

        const persistCognitiveMemorySafe = async (
            role: 'user' | 'assistant',
            content: string,
            stage: string
        ) => {
            try {
                return await persistCognitiveChatMemory(role, content, stage)
            } catch (memoryError: any) {
                console.error(`cognitive memory write failed (${stage}):`, memoryError?.message || memoryError)
                return null
            }
        }

        // Memoria viva: toda mensagem do usuario deve ser registrada.
        await persistCognitiveMemorySafe('user', query, 'user_message_inbound')

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

        // 1c. Carregar memória recente do usuário em outras sessões
        // Útil para perguntas como "você lembra o que conversamos nos últimos dias?"
        let crossSessionMessages: Array<{
            role: 'user' | 'assistant';
            content: string;
            created_at: string;
            session_id: string;
        }> = []

        if (userId !== 'anon_user') {
            const { data: recentHistory, error: recentHistoryError } = await supabaseAdmin
                .rpc('get_user_recent_history', {
                    p_user_id: userId,
                    p_limit: 16,
                    p_exclude_session_id: session_id ?? null,
                })

            if (recentHistoryError) {
                console.error('get_user_recent_history error:', recentHistoryError)
            } else if (recentHistory && recentHistory.length > 0) {
                crossSessionMessages = recentHistory
                    .reverse()
                    .map((m: any) => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content as string,
                        created_at: m.created_at as string,
                        session_id: m.session_id as string,
                    }))
            }
        }

        const isPastConversationIntent = hasAny(query, [
            'lembra',
            'lembrar',
            'lembranca',
            'conversamos',
            'falamos',
            'historico',
            'histórico',
            'ultimos dias',
            'últimos dias',
            'conversas passadas',
            'conversa anterior',
        ])

        const shouldInjectCrossSessionMemory =
            isPastConversationIntent || sessionMessages.length === 0

        // Resposta determinística para pergunta de memória sem histórico disponível.
        // Evita o modelo responder que "não tem acesso" ao histórico.
        if (isPastConversationIntent && sessionMessages.length === 0 && crossSessionMessages.length === 0) {
            const noHistoryAnswer = 'Não encontrei registros recentes de conversas anteriores para recuperar agora. Se quiser, posso continuar deste ponto e manter o contexto nas próximas mensagens.'
            await persistCognitiveMemorySafe('assistant', noHistoryAnswer, 'assistant_memory_lookup_empty')
            return new Response(JSON.stringify({
                answer: noHistoryAnswer,
                documents: [],
                meta: {
                    memory_lookup: 'empty',
                    memory_write_events: memoryWriteEvents,
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Regra de memória explícita: quando o usuário pedir para salvar uma informação para o futuro,
        // persistimos no banco vetorial com metadados estruturados.
        if (isExplicitMemorySaveIntent(query)) {
            const factText = extractMemoryFactText(query)
            if (factText && factText.length >= 8) {
                try {
                    const memoryId = await persistExplicitMemoryFact(factText)
                    const explicitSaveAnswer = `Memória registrada com sucesso no Segundo Cérebro. Vou considerar essa informação em consultas futuras.\n\nResumo salvo: "${factText}"`
                    await persistCognitiveMemorySafe('assistant', explicitSaveAnswer, 'assistant_explicit_memory_ack')
                    return new Response(JSON.stringify({
                        answer: explicitSaveAnswer,
                        documents: [],
                        meta: {
                            memory_saved: true,
                            memory_id: memoryId,
                            memory_scope: 'vector_db',
                            memory_write_events: memoryWriteEvents,
                        }
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    })
                } catch (memorySaveError: any) {
                    console.error('explicit memory save failed:', memorySaveError)
                    const explicitSaveErrorAnswer = `Entendi o pedido para salvar essa informação, mas houve falha ao gravar no cérebro agora. Detalhes: ${memorySaveError?.message || memorySaveError}.`
                    await persistCognitiveMemorySafe('assistant', explicitSaveErrorAnswer, 'assistant_explicit_memory_error')
                    return new Response(JSON.stringify({
                        answer: explicitSaveErrorAnswer,
                        documents: [],
                        meta: {
                            memory_saved: false,
                            error: memorySaveError?.message || String(memorySaveError),
                            memory_write_events: memoryWriteEvents,
                        }
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    })
                }
            }
        }

        // 2. Router Step
        const routerInput: RouterInput = {
            tenant_id: userId,
            session_id: session_id ?? '',
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
                    name: "query_financial_summary",
                    description: "Consultar resumo financeiro determinístico para faturamento recorrente. Use para perguntas de MRR, ARR, faturamento, receita recorrente e contratos ativos.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_reference_date: {
                                type: "string",
                                description: "Data de referência no formato YYYY-MM-DD para cálculo de contratos ativos e MRR. Quando a pergunta for por mês/ano, use o último dia desse mês."
                            },
                            p_status: {
                                type: "string",
                                enum: ["Ativo", "Inativo", "Suspenso", "Cancelado", "Finalizado"],
                                description: "Filtro por status do cliente/contrato na tabela acceptances. Padrão recomendado para MRR/ARR: Ativo."
                            },
                            p_company_name: {
                                type: "string",
                                description: "Filtro opcional por nome da empresa (partial match)."
                            },
                            p_reference_tz: {
                                type: "string",
                                description: "Timezone IANA opcional (ex: America/Sao_Paulo) para rastreabilidade."
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
                    description: "Consultar tarefas e pendências dos projetos/clientes. Use para: 'tem tarefa pendente?', 'quais as pendências?', 'tarefas em andamento', 'tarefas criadas hoje', etc. Sempre use esta ferramenta quando o usuário perguntar sobre tarefas, pendências ou atividades.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_id: {
                                type: "number",
                                description: "ID do projeto para filtrar tarefas. Omita para retornar todos os projetos."
                            },
                            p_status: {
                                type: "string",
                                enum: ["backlog", "in_progress", "approval", "done", "paused", "todo", "review"],
                                description: "Filtro por status da tarefa. Status canônicos: backlog, in_progress, approval, done, paused. Compatibilidade: todo => backlog, review => approval."
                            },
                            p_overdue: {
                                type: "boolean",
                                description: "Quando true, retorna apenas tarefas atrasadas (due_date menor que hoje e status diferente de done)."
                            },
                            p_reference_date: {
                                type: "string",
                                description: "Data de referência no formato YYYY-MM-DD para calcular atraso (ex: data local do usuário)."
                            },
                            p_reference_tz: {
                                type: "string",
                                description: "Timezone IANA opcional do usuário (ex: America/Sao_Paulo) para rastreabilidade."
                            },
                            p_created_date: {
                                type: "string",
                                description: "Filtrar tarefas pela data de criação (created_at). Formato YYYY-MM-DD. Use quando o usuário perguntar 'tarefas criadas hoje', 'tarefas criadas ontem', 'novas tarefas de hoje', etc."
                            }
                        }
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_task_distribution_chart",
                    description: "Gerar um gráfico de distribuição de tarefas (por status, usuário, etc). Use quando o usuário pedir 'gráfico de tarefas', 'distribuição de status', 'resumo visual das tarefas'.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_group_by: {
                                type: "string",
                                enum: ["status", "assignee", "priority"],
                                description: "Campo para agrupar as tarefas no gráfico. Padrão: status."
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
                            },
                            p_limit: {
                                type: "number",
                                description: "Limite máximo de registros retornados. Padrão recomendado: 10."
                            }
                        }
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_create_traffic_task",
                    description: "Criar uma nova tarefa em um projeto. SEMPRE use para 'criar tarefa', 'agendar atividade' ou 'adicionar pendência'. Aceita ID numérico OU nome do projeto.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_id: { type: "number", description: "ID numérico do projeto (acceptance). Opcional se p_project_name for informado." },
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Alternativa ao p_project_id (ex: 'Duarte Vinhos')." },
                            p_title: { type: "string", description: "Título da tarefa." },
                            p_description: { type: "string", description: "Descrição detalhada." },
                            p_due_date: { type: "string", format: "date", description: "Data de entrega (YYYY-MM-DD)." },
                            p_priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade. Padrão: medium." },
                            p_status: { type: "string", enum: ["backlog", "in_progress", "approval", "done", "paused"], description: "Status inicial. Padrão: backlog." },
                            p_assignee: { type: "string", description: "Nome do responsável pela tarefa." }
                        },
                        required: ["p_title"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_delete_task",
                    description: "Deletar/apagar/excluir uma tarefa. Aceita ID da tarefa OU título + projeto (por ID ou nome).",
                    parameters: {
                        type: "object",
                        properties: {
                            p_task_id: { type: "string", format: "uuid", description: "UUID da tarefa. Opcional se p_task_title for informado." },
                            p_task_title: { type: "string", description: "Título (ou parte) da tarefa a deletar." },
                            p_project_id: { type: "number", description: "ID numérico do projeto. Opcional." },
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Opcional." }
                        },
                        required: []
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_move_task",
                    description: "Mover tarefa entre colunas do Kanban (mudar status). Status: backlog, in_progress, approval, done, paused.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_task_id: { type: "string", format: "uuid", description: "UUID da tarefa. Opcional se p_task_title for informado." },
                            p_task_title: { type: "string", description: "Título (ou parte) da tarefa a mover." },
                            p_new_status: { type: "string", enum: ["backlog", "in_progress", "approval", "done", "paused"], description: "Novo status/coluna." },
                            p_project_id: { type: "number", description: "ID numérico do projeto. Opcional." },
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Opcional." }
                        },
                        required: ["p_new_status"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_update_project_status",
                    description: "Atualizar o status de um projeto de tráfego/site/lp. Use para 'marcar projeto como concluído', 'pausar projeto', etc. Aceita UUID ou nome.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_id: { type: "string", format: "uuid", description: "UUID do projeto. Opcional se p_project_name for informado." },
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Alternativa ao UUID." },
                            p_new_status: { type: "string", description: "Novo status (ex: Ativo, Inativo, Pausado)." },
                            p_notes: { type: "string", description: "Notas sobre a alteração." }
                        },
                        required: ["p_new_status"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_update_task",
                    description: "Atualizar campos de uma tarefa existente (responsável, descrição, prazo, prioridade, título). Aceita ID ou título da tarefa + projeto por ID ou nome.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_task_id: { type: "string", format: "uuid", description: "UUID da tarefa. Opcional se p_task_title for informado." },
                            p_task_title: { type: "string", description: "Título (ou parte) da tarefa a atualizar." },
                            p_project_id: { type: "number", description: "ID numérico do projeto. Opcional." },
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Opcional." },
                            p_new_title: { type: "string", description: "Novo título." },
                            p_new_description: { type: "string", description: "Nova descrição." },
                            p_new_due_date: { type: "string", format: "date", description: "Nova data de entrega (YYYY-MM-DD)." },
                            p_new_priority: { type: "string", enum: ["low", "medium", "high"], description: "Nova prioridade." },
                            p_new_assignee: { type: "string", description: "Novo responsável." }
                        },
                        required: []
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_batch_move_tasks",
                    description: "Mover TODAS as tarefas de um status para outro em um projeto (operação em lote). Use para 'mova todas as tarefas do backlog para em execução', 'mova tudo de X para Y no projeto Z'.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Alternativa ao p_project_id." },
                            p_project_id: { type: "number", description: "ID numérico do projeto. Opcional se p_project_name for informado." },
                            p_from_status: { type: "string", enum: ["backlog", "in_progress", "approval", "done", "paused"], description: "Status de origem (tarefas que serão movidas)." },
                            p_to_status: { type: "string", enum: ["backlog", "in_progress", "approval", "done", "paused"], description: "Status de destino." },
                            p_limit: { type: "number", description: "Limite máximo de tarefas a mover. Padrão: 50." }
                        },
                        required: ["p_from_status", "p_to_status"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_batch_delete_tasks",
                    description: "Deletar TODAS as tarefas de um status em um projeto (operação em lote destrutiva). Use para 'delete todas as tarefas finalizadas', 'apague tudo do backlog do projeto X'.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_name: { type: "string", description: "Nome do projeto/cliente. Alternativa ao p_project_id." },
                            p_project_id: { type: "number", description: "ID numérico do projeto. Opcional se p_project_name for informado." },
                            p_status: { type: "string", enum: ["backlog", "in_progress", "approval", "done", "paused"], description: "Status das tarefas a deletar." },
                            p_limit: { type: "number", description: "Limite máximo de tarefas a deletar. Padrão: 50." }
                        },
                        required: ["p_status"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_schedule_task",
                    description: "Criar uma tarefa recorrente/agendada que se repete automaticamente. Use para 'crie uma tarefa toda segunda-feira', 'agende reunião mensal', 'tarefa diária de relatório'.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_name: { type: "string", description: "Nome do projeto/cliente." },
                            p_project_id: { type: "number", description: "ID numérico do projeto. Opcional se p_project_name for informado." },
                            p_title: { type: "string", description: "Título da tarefa recorrente." },
                            p_recurrence_rule: { type: "string", enum: ["daily", "weekly_monday", "weekly_friday", "weekly", "biweekly", "monthly_1st", "monthly_15th", "monthly"], description: "Regra de recorrência. Use: daily=diário, weekly_monday=toda segunda, weekly_friday=toda sexta, weekly=semanal, biweekly=quinzenal, monthly_1st=todo dia 1, monthly_15th=todo dia 15, monthly=mensal." },
                            p_description: { type: "string", description: "Descrição da tarefa." },
                            p_priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade. Padrão: medium." },
                            p_assignee: { type: "string", description: "Responsável pela tarefa." }
                        },
                        required: ["p_title", "p_recurrence_rule"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "no_action",
                    description: "Use quando o usuário fizer uma saudação (oi, olá, bom dia, tudo bem, etc.), conversa casual, ou qualquer mensagem que NÃO precise de consulta ao banco de dados. NÃO use nenhuma outra ferramenta para cumprimentos.",
                    parameters: {
                        type: "object",
                        properties: {},
                        required: []
                    }
                }
            }
        ]

        // Lógica de precificação centralizada (Ref: v8.6)
        const MODEL_PRICES: Record<string, { input: number, output: number }> = {
            'gpt-4o': { input: 0.0000025, output: 0.00001 },
            'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
        };

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCostEst = 0;
        let totalLatencyMs = 0;

        const modelUsage: Record<string, { input_tokens: number, output_tokens: number, cost: number }> = {
            'gpt-4o': { input_tokens: 0, output_tokens: 0, cost: 0 },
            'gpt-4o-mini': { input_tokens: 0, output_tokens: 0, cost: 0 }
        };

        const callRouterLLM = async (input: RouterInput): Promise<RouteDecision> => {
            // Classificação por Function Calling com GPT-4o-mini (rápido e barato)
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0,
                tools: availableTools,
                tool_choice: "auto",
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
- "qual o MRR e ARR dos contratos ativos?" → query_financial_summary(p_status: "Ativo")
- "qual o faturamento recorrente atual?" → query_financial_summary(p_status: "Ativo")
- "qual foi o faturamento de janeiro de 2026?" → query_financial_summary(p_status: "Ativo", p_reference_date: "2026-01-31")
- "gere um gráfico das tarefas" → query_task_distribution_chart(p_group_by: "status")
- "gráfico por responsável" → query_task_distribution_chart(p_group_by: "assignee")
- "quem acessou o sistema hoje?" → query_access_summary()
- "que usuários acessaram a plataforma?" → query_access_summary()
- "quem entrou no sistema hoje?" → query_access_summary()
- "quais usuários logaram recentemente?" → query_access_summary()
- "o que diz o contrato com a empresa X?" → rag_search()
- "quais tarefas estão pendentes?" → query_all_tasks(p_status: "backlog")
- "quais tarefas estão atrasadas?" → query_all_tasks(p_overdue: true)
- "quais tarefas foram criadas hoje?" → query_all_tasks(p_created_date: "<data_de_hoje_YYYY-MM-DD>")
- "que tarefas foram criadas ontem?" → query_all_tasks(p_created_date: "<data_de_ontem_YYYY-MM-DD>")
- "novas tarefas de hoje" → query_all_tasks(p_created_date: "<data_de_hoje_YYYY-MM-DD>")
- "tarefas adicionadas hoje no projeto X" → query_all_tasks(p_project_id: X, p_created_date: "<data_de_hoje_YYYY-MM-DD>")
- "quantas propostas já foram aceitas?" → query_all_proposals(p_status_filter: "accepted")
- "me fale sobre o cliente Amplexo" → rag_search() (busca semântica)
- "o que a Amplexo respondeu na pesquisa?" → query_survey_responses(p_client_name: "Amplexo")
- "mostre as respostas do formulário de tráfego" → query_survey_responses(p_project_type: "traffic")
- "quem é o CEO da C4?" → query_all_users()
- "quem é o CTO da C4?" → query_all_users()
- "qual é o cargo do André Cardia?" → query_all_users()
- "crie uma tarefa chamada X para amanhã no projeto Duarte Vinhos" → execute_create_traffic_task(p_project_name: "Duarte Vinhos", p_title: "X", p_due_date: "YYYY-MM-DD")
- "adicione uma pendência de revisão de criativos no projeto 12" → execute_create_traffic_task(p_project_id: 12, p_title: "Revisão de criativos")
- "agende uma atividade para o projeto da Amplexo" → execute_create_traffic_task(p_project_name: "Amplexo", p_title: "...")
- "apague a tarefa Teste v8 do projeto Duarte Vinhos" → execute_delete_task(p_task_title: "Teste v8", p_project_name: "Duarte Vinhos")
- "delete a tarefa de revisão" → execute_delete_task(p_task_title: "revisão")
- "mova a tarefa X para em execução" → execute_move_task(p_task_title: "X", p_new_status: "in_progress")
- "finalize a tarefa de criativos do projeto Amplexo" → execute_move_task(p_task_title: "criativos", p_new_status: "done", p_project_name: "Amplexo")
- "coloque a tarefa X em aprovação" → execute_move_task(p_task_title: "X", p_new_status: "approval")
- "defina o André como responsável pela tarefa X" → execute_update_task(p_task_title: "X", p_new_assignee: "André")
- "mude o prazo da tarefa Y para 28/02" → execute_update_task(p_task_title: "Y", p_new_due_date: "2026-02-28")
- "atualize a descrição da tarefa X no projeto Duarte Vinhos" → execute_update_task(p_task_title: "X", p_project_name: "Duarte Vinhos", p_new_description: "...")
- "marque o projeto Duarte Vinhos como concluído" → execute_update_project_status(p_project_name: "Duarte Vinhos", p_new_status: "Inativo")
- "pause o projeto Amplexo" → execute_update_project_status(p_project_name: "Amplexo", p_new_status: "Pausado")
- "mova todas as tarefas do backlog para em execução no projeto Duarte Vinhos" → execute_batch_move_tasks(p_project_name: "Duarte Vinhos", p_from_status: "backlog", p_to_status: "in_progress")
- "mova tudo de backlog para em andamento no projeto X" → execute_batch_move_tasks(p_project_name: "X", p_from_status: "backlog", p_to_status: "in_progress")
- "delete todas as tarefas finalizadas do projeto X" → execute_batch_delete_tasks(p_project_name: "X", p_status: "done")
- "apague todas as tarefas do backlog do projeto Duarte Vinhos" → execute_batch_delete_tasks(p_project_name: "Duarte Vinhos", p_status: "backlog")
- "crie uma tarefa toda segunda-feira no projeto X" → execute_schedule_task(p_project_name: "X", p_title: "...", p_recurrence_rule: "weekly_monday")
- "agende uma tarefa diária de relatório no projeto Y" → execute_schedule_task(p_project_name: "Y", p_title: "Relatório diário", p_recurrence_rule: "daily")
- "crie uma reunião mensal no dia 1 para o projeto Z" → execute_schedule_task(p_project_name: "Z", p_title: "Reunião mensal", p_recurrence_rule: "monthly_1st")
Quando a pergunta for sobre pessoas, cargos, funções, C-level (CEO/CTO/CFO/COO/CMO/CIO), fundador ou papéis internos, priorize query_all_users.
Quando a pergunta envolver faturamento, MRR, ARR, receita recorrente ou run-rate, priorize query_financial_summary e evite usar query_all_projects/query_all_proposals para cálculo financeiro.
Quando a pergunta citar um mês/ano específico (ex: janeiro/2026, fev 2026), defina p_reference_date no último dia do mês citado.
Quando o usuário perguntar sobre tarefas CRIADAS em uma data específica (hoje, ontem, esta semana), use query_all_tasks com p_created_date no formato YYYY-MM-DD.
Quando o usuário pedir para CRIAR tarefa/pendência/atividade, SEMPRE use execute_create_traffic_task. NÃO peça confirmação — execute diretamente.
Quando o usuário pedir para DELETAR/APAGAR/EXCLUIR tarefa, SEMPRE use execute_delete_task.
Quando o usuário pedir para MOVER tarefa ou MUDAR STATUS de tarefa, use execute_move_task. Mapeie: "em execução"→in_progress, "aprovação"→approval, "finalizado/concluído/feito"→done, "pausado"→paused, "backlog"→backlog.
Quando o usuário pedir para EDITAR/ATUALIZAR campos de tarefa (responsável, descrição, prazo, prioridade, título), use execute_update_task.
Quando o usuário pedir para ALTERAR STATUS de PROJETO (não tarefa), SEMPRE use execute_update_project_status.
Prefira usar p_project_name ao invés de p_project_id quando o usuário mencionar o nome do cliente/projeto.
Se a pergunta tiver múltiplas solicitações independentes (ex: tarefas + usuários + projetos), faça uma function call para CADA solicitação.
QUANDO O USUÁRIO FIZER SAUDAÇÕES (oi, olá, bom dia, boa tarde, tudo bem, e aí, hey, etc.) ou conversa casual sem intenção de consulta, use OBRIGATORIAMENTE a ferramenta no_action. NUNCA dispare consultas de banco para cumprimentos.
Retorne apenas function calls (sem texto livre).`
                    },
                    { role: 'user', content: input.user_message }
                ]
            })

            const rawToolCalls = completion.choices[0].message.tool_calls ?? []

            // Log tokens do Router (gpt-4o-mini) — fire and forget
            // Preços (Fev 2026): Input $0.150/1M, Output $0.600/1M
            const routerUsage = completion.usage
            if (routerUsage) {
                const miniPrices = MODEL_PRICES['gpt-4o-mini'];
                const routerCost = (routerUsage.prompt_tokens * miniPrices.input) + (routerUsage.completion_tokens * miniPrices.output);

                // Acumular totais da sessão
                totalInputTokens += routerUsage.prompt_tokens;
                totalOutputTokens += routerUsage.completion_tokens;
                totalCostEst += routerCost;

                // Breakdown por modelo
                modelUsage['gpt-4o-mini'].input_tokens += routerUsage.prompt_tokens;
                modelUsage['gpt-4o-mini'].output_tokens += routerUsage.completion_tokens;
                modelUsage['gpt-4o-mini'].cost += routerCost;

                supabaseAdmin.rpc('log_agent_execution', {
                    p_session_id: session_id,
                    p_agent_name: 'Router_GPT4oMini',
                    p_action: 'route',
                    p_status: 'success',
                    p_cost_est: routerCost,
                    p_tokens_input: routerUsage.prompt_tokens,
                    p_tokens_output: routerUsage.completion_tokens,
                    p_tokens_total: (routerUsage.prompt_tokens + routerUsage.completion_tokens),
                }).catch(() => { })
            }

            if (rawToolCalls.length > 0) {
                const parsedCalls: Array<{ name: string; args: Record<string, any> }> = []
                for (const toolCall of rawToolCalls) {
                    const funcName = toolCall.function.name
                    let funcArgs: Record<string, any> = {}
                    try {
                        const raw = toolCall.function.arguments || '{}'
                        const parsed = JSON.parse(raw)
                        funcArgs = parsed && typeof parsed === 'object' ? parsed : {}
                    } catch (parseError) {
                        console.warn('[LLM Router] Invalid tool args JSON, using empty args:', parseError)
                    }
                    parsedCalls.push({ name: funcName, args: funcArgs })
                }

                // Mapear função para agente e configuração
                const funcToAgent: Record<string, { agent: string; artifact_kind: string }> = {
                    'query_all_proposals': { agent: 'Agent_Proposals', artifact_kind: 'proposal' },
                    'query_all_clients': { agent: 'Agent_Client360', artifact_kind: 'client' },
                    'query_all_projects': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'query_financial_summary': { agent: 'Agent_Proposals', artifact_kind: 'proposal' },
                    'query_task_distribution_chart': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'query_all_users': { agent: 'Agent_BrainOps', artifact_kind: 'ops' },
                    'query_all_tasks': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'query_access_summary': { agent: 'Agent_BrainOps', artifact_kind: 'ops' },
                    'query_survey_responses': { agent: 'Agent_MarketingTraffic', artifact_kind: 'project' },
                    'rag_search': { agent: 'Agent_Projects', artifact_kind: 'unknown' },
                    'execute_create_traffic_task': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_delete_task': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_move_task': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_update_task': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_update_project_status': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_batch_move_tasks': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_batch_delete_tasks': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_schedule_task': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'no_action': { agent: 'Agent_Conversational', artifact_kind: 'none' },
                }

                const llmDbCalls: DbQueryCall[] = parsedCalls
                    .filter((call) => call.name !== 'rag_search')
                    .filter((call) => call.name !== 'no_action')
                    .filter((call) => dbRpcNames.has(call.name))
                    .map((call) => ({ rpc_name: call.name, params: call.args || {} }))

                // Complementa consultas em perguntas compostas para evitar respostas parciais.
                const supplementalDbCalls = inferSupplementalDbCalls(input.user_message)
                let dbCalls = dedupeDbCalls(enrichDbCalls(mergeDbCalls(llmDbCalls, supplementalDbCalls)))

                // Guardrail de intenção: consultas de tarefas devem sempre executar query_all_tasks
                // e priorizá-la como chamada principal para evitar GenUI de projetos indevido.
                const isTaskQueryIntent = hasAny(input.user_message, [
                    'tarefa', 'tarefas',
                    'pendencia', 'pendência', 'pendente', 'pendentes',
                    'atrasad', 'vencid', 'fora do prazo', 'prazo estourado', 'deadline',
                    'criada', 'criadas', 'criado', 'criados',
                    'criação', 'criacao', 'data de criação', 'data de criacao',
                    'nova', 'novas', 'novo', 'novos', 'adicionada', 'adicionadas'
                ])

                if (isTaskQueryIntent) {
                    const wantsCreatedOnDate = hasAny(input.user_message, [
                        'criada', 'criadas', 'criado', 'criados',
                        'criação', 'criacao', 'data de criação', 'data de criacao',
                        'nova', 'novas', 'novo', 'novos', 'adicionada', 'adicionadas'
                    ])
                    const wantsOverdueTasks = hasAny(input.user_message, [
                        'atrasad', 'vencid', 'fora do prazo', 'prazo estourado', 'deadline'
                    ])
                    const explicitlyWantsProjectListInTaskQuery = hasAny(input.user_message, [
                        'liste os projetos', 'listar projetos', 'quais projetos', 'mostre os projetos',
                        'nomes dos projetos', 'detalhar projetos', 'detalhe dos projetos'
                    ])

                    const taskParams: Record<string, any> = {}
                    if (wantsCreatedOnDate) {
                        taskParams.p_created_date = inferredReferenceDate || (clientToday || runtimeToday)
                    }
                    if (wantsOverdueTasks) {
                        taskParams.p_overdue = true
                        taskParams.p_reference_date = clientToday || runtimeToday
                        if (clientTimezone) taskParams.p_reference_tz = clientTimezone
                    }

                    const taskIdx = dbCalls.findIndex((c) => c.rpc_name === 'query_all_tasks')
                    if (taskIdx === -1) {
                        dbCalls.unshift({ rpc_name: 'query_all_tasks', params: taskParams })
                    } else {
                        const existing = dbCalls[taskIdx]
                        const mergedTaskCall: DbQueryCall = {
                            rpc_name: 'query_all_tasks',
                            params: cleanRpcParams({ ...(existing.params || {}), ...taskParams })
                        }
                        dbCalls.splice(taskIdx, 1)
                        dbCalls.unshift(mergedTaskCall)
                    }

                    if (!explicitlyWantsProjectListInTaskQuery) {
                        dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_projects')
                    }

                    dbCalls = dedupeDbCalls(enrichDbCalls(dbCalls))
                }

                if (forcedAgent === 'Agent_MarketingTraffic') {
                    dbCalls = dbCalls.filter((c) => trafficAllowedReadRpcs.has(c.rpc_name))

                    const hasSurveyCall = dbCalls.some((c) => c.rpc_name === 'query_survey_responses')
                    const wantsTrafficStrategy = hasAny(input.user_message, [
                        'estrategia', 'estratégia', 'campanha', 'campanhas',
                        'google ads', 'meta ads', 'trafego pago', 'tráfego pago',
                        'questionario', 'questionário', 'survey', 'briefing'
                    ])

                    if (!hasSurveyCall && wantsTrafficStrategy) {
                        dbCalls.unshift({
                            rpc_name: 'query_survey_responses',
                            params: { p_project_type: 'traffic', p_limit: 10 }
                        })
                        dbCalls = dedupeDbCalls(enrichDbCalls(dbCalls))
                    }

                    const hasClientCall = dbCalls.some((c) => c.rpc_name === 'query_all_clients')
                    const wantsClientData = hasAny(input.user_message, ['cliente', 'clientes'])
                    if (!hasClientCall && wantsClientData) {
                        dbCalls.unshift({
                            rpc_name: 'query_all_clients',
                            params: {}
                        })
                        dbCalls = dedupeDbCalls(enrichDbCalls(dbCalls))
                    }
                }

                const hasFinancialIntent = hasAny(input.user_message, [
                    'mrr', 'arr', 'faturamento', 'receita', 'run rate', 'recorrente', 'recorrencia', 'recorrência'
                ])
                const explicitlyMentionsProposals = hasAny(input.user_message, ['proposta', 'propostas', 'orcamento', 'orçamento'])
                const explicitlyWantsProjectList = hasAny(input.user_message, [
                    'liste os projetos', 'listar projetos', 'quais projetos', 'mostre os projetos',
                    'nomes dos projetos', 'detalhar projetos', 'detalhe dos projetos'
                ])
                const hasFinancialSummaryCall = dbCalls.some((c) => c.rpc_name === 'query_financial_summary')
                if (hasFinancialIntent && hasFinancialSummaryCall) {
                    if (!explicitlyMentionsProposals) {
                        dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_proposals')
                    }
                    if (!explicitlyWantsProjectList) {
                        dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_projects')
                    }
                }

                const hasTaskChartCall = dbCalls.some((c) => c.rpc_name === 'query_task_distribution_chart')
                if (hasTaskChartCall) {
                    const explicitlyWantsTaskList = hasAny(input.user_message, [
                        'liste as tarefas', 'listar as tarefas', 'quais tarefas', 'mostre as tarefas',
                        'todas as tarefas', 'nomes das tarefas', 'detalhar tarefas'
                    ])
                    if (!explicitlyWantsTaskList) {
                        dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_tasks')
                    }
                }

                // Se o LLM pediu access_summary, não precisa da lista genérica de usuários
                const hasAccessSummaryCall = dbCalls.some((c) => c.rpc_name === 'query_access_summary')
                if (hasAccessSummaryCall) {
                    dbCalls = dbCalls.filter((c) => c.rpc_name !== 'query_all_users')
                }

                if (dbCalls.length > 0) {
                    const primary = dbCalls[0]
                    const config = funcToAgent[primary.rpc_name] || funcToAgent['query_all_projects']
                    const isBatch = dbCalls.length > 1
                    const dbQueryParams = isBatch
                        ? {
                            rpc_name: '__batch__',
                            calls: dbCalls.map((call) => ({ rpc_name: call.rpc_name, ...call.params })),
                        }
                        : { rpc_name: primary.rpc_name, ...primary.params }

                    console.log(`[LLM Router] Chose DB call(s): ${JSON.stringify(dbQueryParams)}`)

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
                        top_k: 0,
                        tools_allowed: ['rag_search', 'db_read'],
                        tool_hint: 'db_query',
                        db_query_params: dbQueryParams,
                        confidence: 0.95,
                        reason: isBatch
                            ? `LLM Router batch DB (${dbCalls.map((c) => c.rpc_name).join(', ')})`
                            : `LLM Router DB (${primary.rpc_name})`,
                    } as RouteDecision
                }

                if (parsedCalls.some((call) => call.name === 'rag_search')) {
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
                        top_k: 10,
                        tools_allowed: ['rag_search'],
                        tool_hint: 'rag_search',
                        confidence: 0.85,
                        reason: 'LLM Router selected rag_search',
                    } as RouteDecision
                }
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
        let effectiveDecision = forcedAgent
            ? {
                ...decision,
                agent: forcedAgent as any,
                reason: `${decision.reason} | forced_agent=${forcedAgent}`,
            }
            : decision

        if (effectiveDecision.agent === 'Agent_MarketingTraffic') {
            const sanitizeTrafficCalls = (calls: DbQueryCall[]) =>
                dedupeDbCalls(enrichDbCalls(calls.filter((call) => trafficAllowedReadRpcs.has(call.rpc_name))))

            if (effectiveDecision.tool_hint === 'db_query' && effectiveDecision.db_query_params) {
                const plannedTrafficCalls: DbQueryCall[] = []
                const rawDbParams: any = effectiveDecision.db_query_params

                if (rawDbParams.rpc_name === '__batch__' && Array.isArray(rawDbParams.calls)) {
                    for (const call of rawDbParams.calls) {
                        if (!call || typeof call !== 'object' || typeof call.rpc_name !== 'string') continue
                        const { rpc_name, ...params } = call
                        plannedTrafficCalls.push({ rpc_name, params })
                    }
                } else if (typeof rawDbParams.rpc_name === 'string') {
                    const { rpc_name, ...params } = rawDbParams
                    plannedTrafficCalls.push({ rpc_name, params })
                }

                const safeTrafficCalls = sanitizeTrafficCalls(plannedTrafficCalls)
                if (safeTrafficCalls.length > 0) {
                    const primary = safeTrafficCalls[0]
                    effectiveDecision = {
                        ...effectiveDecision,
                        tool_hint: 'db_query',
                        db_query_params: safeTrafficCalls.length > 1
                            ? {
                                rpc_name: '__batch__',
                                calls: safeTrafficCalls.map((call) => ({ rpc_name: call.rpc_name, ...call.params })),
                            }
                            : { rpc_name: primary.rpc_name, ...primary.params },
                    }
                } else {
                    effectiveDecision = {
                        ...effectiveDecision,
                        tool_hint: 'rag_search',
                        db_query_params: undefined,
                    }
                }
            }

            // Guardrail de domínio: tráfego consulta somente contexto de clientes + tarefas + survey.
            effectiveDecision = {
                ...effectiveDecision,
                artifact_kind: 'project',
                retrieval_policy: 'STRICT_DOCS_ONLY',
                top_k: Math.max(1, effectiveDecision.top_k || 8),
                filters: {
                    ...effectiveDecision.filters,
                    artifact_kind: 'project',
                    source_table: ['traffic_projects', 'project_tasks', 'acceptances', 'activity_logs'],
                    type_allowlist: ['official_doc', 'session_summary', 'database_record'],
                    type_blocklist: ['chat_log'],
                    status: 'active',
                    time_window_minutes: null,
                },
            }
        }

        const isTrafficAgentContext = effectiveDecision.agent === 'Agent_MarketingTraffic'

        console.log(`[Router] Decision: ${effectiveDecision.agent} (Risk: ${effectiveDecision.risk_level})`)

        if (isTrafficAgentContext && isTrafficOutOfScopeIntent(query)) {
            const outOfScopeAnswer = 'Escopo restrito do Agente Especialista em Gestão de Tráfego: aqui eu só consulto dados de clientes, tarefas e respostas de questionário. Dados comerciais/financeiros (propostas, MRR, ARR, faturamento, pricing) não são acessados neste agente.'
            await persistCognitiveMemorySafe('assistant', outOfScopeAnswer, 'assistant_traffic_scope_block')
            return new Response(JSON.stringify({
                answer: outOfScopeAnswer,
                documents: [],
                meta: { scope_blocked: true, agent: effectiveDecision.agent }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 3. Retrieval Step (Hybrid: RAG ou SQL direto)
        let contextText = ''
        let retrievedDocs: any[] = []
        let rawDbRecordsForGenUI: any[] | null = null;
        let rpcNameForGenUI: string = '';
        const rawDbRecordsByRpcForGenUI: Record<string, any[]> = {}
        let cognitiveMemoryDocs: any[] = []
        let cognitiveMemoryContext = ''
        let explicitUserFacts: string[] = []
        let executedDbRpcs: string[] = []
        const isTaskFocusedQueryForGenUi = hasAny(query, [
            'tarefa', 'tarefas',
            'pendencia', 'pendência', 'pendente', 'pendentes',
            'atrasad', 'vencid', 'fora do prazo', 'prazo estourado', 'deadline',
            'criada', 'criadas', 'criado', 'criados',
            'criação', 'criacao', 'data de criação', 'data de criacao',
            'nova', 'novas', 'novo', 'novos', 'adicionada', 'adicionadas'
        ])
        const isLeadershipQuery = hasAny(query, [
            'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio',
            'cargo', 'funcao', 'função', 'papel',
            'presidente', 'fundador', 'dono', 'diretor executivo'
        ])
        let explicitLeadershipFact: string | null = null
        const leadershipHintRegex = /(ceo|cto|cfo|coo|cmo|cio|presidente|diretor executivo|fundador|dono)/i

        const isExplicitUserFactDoc = (doc: any) => {
            const meta = doc?.metadata || {}
            const sourceTable = String(meta.source_table || '').toLowerCase()
            const source = String(meta.source || '').toLowerCase()
            return sourceTable === 'user_facts' || source === 'explicit_user_memory'
        }

        // RPCs que são ações de escrita (Agent_Executor)
        const executorRpcNames = new Set([
            'execute_create_traffic_task',
            'execute_delete_task',
            'execute_move_task',
            'execute_update_task',
            'execute_update_project_status',
            'execute_batch_move_tasks',
            'execute_batch_delete_tasks',
            'execute_schedule_task',
        ])

        // RPCs destrutivas que exigem confirmação explícita do usuário
        const destructiveRpcNames = new Set([
            'execute_delete_task',
            'execute_batch_delete_tasks',
        ])
        const confirmationTokens = [
            'confirmar', 'sim deletar', 'pode deletar', 'confirmo',
            'pode excluir', 'sim excluir', 'confirme', 'sim, pode',
        ]

        // Função unificada para buscar e normalizar dados
        const executeDbRpc = async (rpc_name: string, payload: any): Promise<{ section: string; rawData: any }> => {
            const isExecutorAction = rpc_name.startsWith('execute_')

            // INTENÇÃO ESPECIAL: Gráfico Recharts (Mockado a partir dos dados brutod para efeitos de V1)
            // Em uma V2 o banco teria uma view, mas aqui fazemos JS group by na Edge
            if (rpc_name === 'query_task_distribution_chart') {
                const groupBy = payload.p_group_by || 'status';
                const { data: allTasks, error: errT } = await supabaseAdmin.rpc('query_all_tasks', {});

                if (errT || !allTasks) {
                    return { section: `FALHA: Não foi possível gerar gráfico.`, rawData: [] }
                }

                // Agrupando
                const counts: Record<string, number> = {};
                if (Array.isArray(allTasks)) {
                    for (const t of allTasks) {
                        const key = t[groupBy] || 'Não Definido';
                        counts[key] = (counts[key] || 0) + 1;
                    }
                }

                const chartData = Object.keys(counts).map(k => ({ name: k.replace(/_/g, ' ').toUpperCase(), total: counts[k] }));

                // Preparando Payload Especial Chart
                const chartBlock = {
                    type: 'chart',
                    chartType: 'bar',
                    title: `Distribuição de Tarefas por ${groupBy.toUpperCase()}`,
                    xAxis: 'name',
                    series: [{ key: 'total', name: 'Tarefas', color: '#6366f1' }],
                    data: chartData,
                    isCurrency: false
                };

                // Vamos injetar esse block na variável de injeção global e retornar string vazia ao invés de string text,
                // ASSIM resolvemos o parser lá no final.
                rawDbRecordsForGenUI = [chartBlock]; // para não dar nulo
                rpcNameForGenUI = 'query_task_distribution_chart'; // para mapear no parser no switch final

                return { section: `GRÁFICO GERADO COM SUCESSO. Os dados visuais foram ocultados da string para evitar poluição textural, mas já estão prontos para UI. Apenas diga "Aqui está o gráfico solicitado:"`, rawData: [chartBlock] };
            }

            const cleanParams = cleanRpcParams(payload)

            // Injetar p_session_id automaticamente para RPCs de escrita
            if (isExecutorAction && !cleanParams.p_session_id && session_id) {
                cleanParams.p_session_id = session_id
            }

            console.log(`[Tool] ${isExecutorAction ? 'EXECUTOR' : 'db_query'} → ${rpc_name}`)
            console.log(`[Tool] params:`, JSON.stringify(cleanParams))

            const rpcStartTime = performance.now()
            const { data, error: rpcError } = await supabaseAdmin.rpc(rpc_name, cleanParams)
            const rpcLatencyMs = Math.round(performance.now() - rpcStartTime)

            if (rpcError) {
                console.error('RPC error:', rpcError)

                // Log de falha para RPCs de escrita
                if (isExecutorAction) {
                    try {
                        await supabaseAdmin.rpc('log_agent_execution', {
                            p_session_id: session_id || 'unknown',
                            p_agent_name: 'Agent_Executor',
                            p_action: rpc_name,
                            p_status: 'error',
                            p_params: {
                                ...cleanParams,
                                model_usage: modelUsage
                            },
                            p_result: {},
                            p_latency_ms: rpcLatencyMs,
                            p_error_message: rpcError.message,
                        }).catch(() => { })
                    } catch (_e) { /* fail-safe */ }
                }

                return { section: `EXECUÇÃO FALHOU via ${rpc_name}: ${rpcError.message}. Informe o erro com transparência e não invente dados.`, rawData: null }
            }

            let normalizedData: any = data
            if (typeof normalizedData === 'string') {
                try {
                    normalizedData = JSON.parse(normalizedData)
                } catch {
                    // mantém string original se não for JSON válido
                }
            }

            // Enriquecimento para navegação do frontend:
            // query_all_projects retorna ids por tabela de projeto (traffic/website/lp),
            // mas as rotas do app usam acceptance_id. Aqui anexamos acceptance_id por empresa.
            if (rpc_name === 'query_all_projects' && Array.isArray(normalizedData) && normalizedData.length > 0) {
                try {
                    const companyNames = Array.from(
                        new Set(
                            normalizedData
                                .map((row: any) => String(row?.company_name || '').trim())
                                .filter((name: string) => name.length > 0)
                        )
                    )

                    if (companyNames.length > 0) {
                        const { data: acceptanceRows, error: acceptanceError } = await supabaseAdmin
                            .from('acceptances')
                            .select('id, company_name, timestamp')
                            .in('company_name', companyNames)
                            .order('timestamp', { ascending: false })

                        if (!acceptanceError && Array.isArray(acceptanceRows)) {
                            const acceptanceByCompany = new Map<string, number>()
                            for (const acc of acceptanceRows as any[]) {
                                const company = String(acc?.company_name || '').trim()
                                if (!company || acceptanceByCompany.has(company)) continue
                                acceptanceByCompany.set(company, Number(acc.id))
                            }

                            normalizedData = normalizedData.map((row: any) => ({
                                ...row,
                                acceptance_id: acceptanceByCompany.get(String(row?.company_name || '').trim()) ?? null,
                            }))
                        }
                    }
                } catch (enrichmentError) {
                    console.error('query_all_projects enrichment failed:', enrichmentError)
                }
            }

            // Para RPCs de escrita, retornar resultado direto (JSONB com status)
            if (isExecutorAction) {
                const result = normalizedData || {}
                const status = result?.status || 'unknown'
                const message = result?.message || JSON.stringify(result)
                console.log(`[Executor] ${rpc_name} → ${status}: ${message}`)
                return { section: `AÇÃO EXECUTADA COM SUCESSO via ${rpc_name} (${rpcLatencyMs}ms):\n${JSON.stringify(result, null, 2)}`, rawData: result }
            }

            if (!normalizedData || (Array.isArray(normalizedData) && normalizedData.length === 0) || normalizedData === '[]') {
                return { section: `CONSULTA REALIZADA COM SUCESSO via ${rpc_name}, mas NENHUM registro foi encontrado. Informe ao usuário que a consulta foi feita no banco de dados e não há registros correspondentes no momento.`, rawData: [] }
            }

            const records = Array.isArray(normalizedData) ? normalizedData : [normalizedData]

            // SANITIZAÇÃO PRÉ-LLM: Remover PII dos dados antes de enviar ao contexto do LLM
            let sanitizedRecordsForPrompt = records;
            if (rpc_name === 'query_access_summary') {
                sanitizedRecordsForPrompt = records.map((r: any) => {
                    const email = r.user_email || '';
                    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                    return { nome: name, total_acessos: r.total_accesses, ultimo_acesso: r.last_access };
                });
            } else if (rpc_name === 'query_all_users') {
                sanitizedRecordsForPrompt = records.map((r: any) => ({
                    nome: r.full_name || r.name || 'Sem nome',
                    cargo: r.role || 'Não definido',
                    ultimo_acesso: r.last_access || null,
                }));
            }

            return { section: `DADOS DO BANCO DE DADOS (${records.length} registros encontrados via ${rpc_name}):\n\n${JSON.stringify(sanitizedRecordsForPrompt, null, 2)}`, rawData: records }
        }

        // Tier-1: busca documentos canônicos corporativos via RPC dedicado.
        // Ignora isolamento por tenant do usuário — usa tenant 'c4_corporate_identity'.
        const runCanonicalRetrieval = async (): Promise<{ text: string; count: number }> => {
            if (isTrafficAgentContext) return { text: '', count: 0 }
            if (!canonicalMemoryEnabled) return { text: '', count: 0 }

            try {
                const embedder = makeOpenAIEmbedder({ apiKey: Deno.env.get('OPENAI_API_KEY')! })
                const queryEmbedding = await embedder(query)

                const { data: docs, error } = await supabaseAdmin.rpc(
                    'get_canonical_corporate_docs',
                    {
                        query_embedding: queryEmbedding,
                        p_user_role: userRole,
                        p_top_k: 6,
                    }
                )

                if (error) {
                    console.error('[Canonical] get_canonical_corporate_docs error:', error.message)
                    return { text: '', count: 0 }
                }

                if (!docs?.length) return { text: '', count: 0 }

                const text = (docs as any[])
                    .map((d: any) => `[${d.metadata?.title || 'Documento Canônico'}]\n${d.content}`)
                    .join('\n\n---\n\n')

                return { text, count: docs.length }
            } catch (canonicalError: any) {
                console.error('[Canonical] retrieval failed:', canonicalError?.message || canonicalError)
                return { text: '', count: 0 }
            }
        }

        const runVectorRetrieval = async (opts?: {
            topK?: number
            overrideFilters?: Record<string, any>
            retrievalLabel?: string
            forcedPolicy?: RetrievalPolicy
        }) => {
            const topKToUse = typeof opts?.topK === 'number' ? opts.topK : effectiveDecision.top_k
            console.log(`[Tool] rag_search → top_k: ${topKToUse}`)
            try {
                const embedder = makeOpenAIEmbedder({ apiKey: Deno.env.get('OPENAI_API_KEY')! })
                const baseFilters = {
                    ...effectiveDecision.filters,
                    ...(opts?.overrideFilters || {}),
                }
                const label = opts?.retrievalLabel || 'base vetorial'
                const hasForcedPolicy = !!opts?.forcedPolicy
                const canUseNormative =
                    normativeGovernanceEnabled &&
                    !hasForcedPolicy &&
                    effectiveDecision.retrieval_policy === 'STRICT_DOCS_ONLY'

                const primaryPolicy: RetrievalPolicy = opts?.forcedPolicy
                    ? opts.forcedPolicy
                    : (canUseNormative ? 'NORMATIVE_FIRST' : effectiveDecision.retrieval_policy)

                const primaryFilters = (primaryPolicy === 'NORMATIVE_FIRST')
                    ? {
                        ...baseFilters,
                        normative_mode: true,
                        require_current: true,
                        require_searchable: true,
                        authority_rank_min: 50,
                    }
                    : baseFilters

                let docs = await matchBrainDocuments({
                    supabase: supabaseAdmin,
                    queryText: query,
                    filters: primaryFilters as any,
                    options: {
                        topK: topKToUse,
                        policy: primaryPolicy
                    },
                    embedder
                })

                // Fail-open: if normative mode returns empty, fallback to legacy policy.
                if (!hasForcedPolicy && canUseNormative && docs.length === 0) {
                    console.warn('[RAG] NORMATIVE_FIRST returned empty, falling back to STRICT_DOCS_ONLY')
                    docs = await matchBrainDocuments({
                        supabase: supabaseAdmin,
                        queryText: query,
                        filters: baseFilters as any,
                        options: {
                            topK: topKToUse,
                            policy: effectiveDecision.retrieval_policy
                        },
                        embedder
                    })
                }

                retrievedDocs = docs

                if (!retrievedDocs.length) {
                    return `CONSULTA REALIZADA NA ${label.toUpperCase()}, mas nenhum documento relevante foi encontrado para esta pergunta.`
                }

                const explicitFactDoc = retrievedDocs.find((d: any) => {
                    const content = String(d?.content || '')
                    return isExplicitUserFactDoc(d) && leadershipHintRegex.test(content)
                })

                if (explicitFactDoc) {
                    explicitLeadershipFact = String(explicitFactDoc.content || '').trim()
                }

                return retrievedDocs.map(d => {
                    const meta = d.metadata || {};
                    const source = meta.source_table || meta.title || 'Unknown Source';
                    return `[ID: ${d.id} | Source: ${source} | Type: ${meta.type}]: ${d.content}`;
                }).join('\n\n')
            } catch (ragError: any) {
                console.error('RAG retrieval failed:', ragError)
                return `Falha ao recuperar contexto semântico no momento: ${ragError?.message || ragError}. Responda ao usuário de forma útil e peça uma reformulação curta se necessário.`
            }
        }

        const runCognitiveMemoryRetrieval = async () => {
            console.log('[Tool] cognitive_memory_search → top_k: 8')
            try {
                const embedder = makeOpenAIEmbedder({ apiKey: Deno.env.get('OPENAI_API_KEY')! })
                cognitiveMemoryDocs = await matchBrainDocuments({
                    supabase: supabaseAdmin,
                    queryText: query,
                    filters: {
                        tenant_id: userId,
                        type_allowlist: ['chat_log', 'session_summary'],
                        type_blocklist: [],
                        artifact_kind: null,
                        source_table: null,
                        client_id: null,
                        project_id: null,
                        source_id: null,
                        status: 'active',
                        time_window_minutes: null,
                    } as any,
                    options: {
                        topK: 8,
                        policy: 'CHAT_ONLY'
                    },
                    embedder
                })

                if (!cognitiveMemoryDocs.length) {
                    explicitUserFacts = []
                    return 'CONSULTA DE MEMÓRIA COGNITIVA: nenhum item relevante encontrado para esta pergunta.'
                }

                explicitUserFacts = cognitiveMemoryDocs
                    .filter((d: any) => isExplicitUserFactDoc(d))
                    .map((d: any) => String(d?.content || '').trim())
                    .filter((text: string) => text.length > 0)
                    .slice(0, 6)

                if (!explicitLeadershipFact) {
                    const leadershipDoc = cognitiveMemoryDocs.find((d: any) => {
                        const content = String(d?.content || '')
                        return isExplicitUserFactDoc(d) && leadershipHintRegex.test(content)
                    })
                    if (leadershipDoc) {
                        explicitLeadershipFact = String(leadershipDoc?.content || '').trim()
                    }
                }

                return cognitiveMemoryDocs.map((d: any) => {
                    const meta = d?.metadata || {}
                    const source = meta.source_table || meta.source || 'Unknown Source'
                    return `[ID: ${d.id} | Source: ${source} | Type: ${meta.type}]: ${d.content}`
                }).join('\n\n')
            } catch (memoryRetrievalError: any) {
                console.error('cognitive memory retrieval failed:', memoryRetrievalError)
                explicitUserFacts = []
                return `Falha ao consultar memória cognitiva: ${memoryRetrievalError?.message || memoryRetrievalError}.`
            }
        }

        // Canonical retrieval — executado ANTES de qualquer outra busca.
        const { text: canonicalBlock, count: canonicalDocsCount } = await runCanonicalRetrieval()

        if (effectiveDecision.tool_hint === 'db_query' && effectiveDecision.db_query_params) {
            // === SQL DIRETO (listagens, contagens, filtros exatos) ===
            const plannedCalls: DbQueryCall[] = []

            if (effectiveDecision.db_query_params.rpc_name === '__batch__' && Array.isArray(effectiveDecision.db_query_params.calls)) {
                for (const rawCall of effectiveDecision.db_query_params.calls) {
                    if (!rawCall || typeof rawCall !== 'object') continue
                    const { rpc_name, ...rpcParams } = rawCall
                    if (typeof rpc_name !== 'string' || !dbRpcNames.has(rpc_name)) continue
                    plannedCalls.push({ rpc_name, params: rpcParams })
                }
            } else {
                const { rpc_name, ...rpcParams } = effectiveDecision.db_query_params
                if (typeof rpc_name === 'string' && dbRpcNames.has(rpc_name)) {
                    plannedCalls.push({ rpc_name, params: rpcParams })
                }
            }

            let finalCalls = dedupeDbCalls(enrichDbCalls(dedupeDbCalls(plannedCalls)))
            if (isTrafficAgentContext) {
                finalCalls = finalCalls.filter((call) => trafficAllowedReadRpcs.has(call.rpc_name))
            }
            if (finalCalls.length === 0) {
                // Guardrail: sempre consultar alguma base antes de responder
                contextText = await runVectorRetrieval()
            } else {
                if (effectiveDecision.agent === 'Agent_MarketingTraffic' && finalCalls.some((call) => call.rpc_name.startsWith('execute_'))) {
                    const writeBlockedAnswer = 'Este chat do Agente Especialista em Gestão de Tráfego é consultivo e estratégico. Não executo ações operacionais de escrita (criar, mover, editar ou excluir tarefas) aqui.'
                    await persistCognitiveMemorySafe('assistant', writeBlockedAnswer, 'assistant_traffic_write_block')
                    await logFinalAgentExecution({
                        agentName: effectiveDecision.agent,
                        action: 'write_blocked',
                        status: 'error',
                        answer: writeBlockedAnswer,
                        error: 'Agent_MarketingTraffic restricted from writing'
                    });
                    return new Response(JSON.stringify({
                        answer: writeBlockedAnswer,
                        documents: [],
                        meta: { write_blocked: true, forced_agent: forcedAgent, agent: effectiveDecision.agent }
                    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                }

                // Confirmação inteligente: verificar RPCs destrutivas antes de executar
                for (const call of finalCalls) {
                    if (destructiveRpcNames.has(call.rpc_name) && !hasAny(query, confirmationTokens)) {
                        const taskInfo = call.params.p_task_title || call.params.p_status || 'as tarefas selecionadas'
                        const projectInfo = call.params.p_project_name ? ` no projeto "${call.params.p_project_name}"` : ''
                        const isBatch = call.rpc_name === 'execute_batch_delete_tasks'
                        const confirmAnswer = isBatch
                            ? `⚠️ Confirmação necessária: deseja deletar **todas as tarefas com status "${call.params.p_status}"**${projectInfo}? Esta ação não pode ser desfeita.\n\nResponda **"confirmar"** para prosseguir com a exclusão.`
                            : `⚠️ Confirmação necessária: deseja deletar a tarefa **"${taskInfo}"**${projectInfo}? Esta ação não pode ser desfeita.\n\nResponda **"confirmar"** para prosseguir com a exclusão.`

                        await persistCognitiveMemorySafe('assistant', confirmAnswer, 'assistant_confirmation_request')
                        await logFinalAgentExecution({
                            agentName: effectiveDecision.agent,
                            action: call.rpc_name,
                            status: 'waiting_confirmation',
                            answer: confirmAnswer
                        });
                        return new Response(JSON.stringify({
                            answer: confirmAnswer,
                            documents: [],
                            meta: { confirmation_required: true, rpc_name: call.rpc_name }
                        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    }
                }

                const sections: string[] = []
                for (const call of finalCalls) {
                    executedDbRpcs.push(call.rpc_name)
                    const { section, rawData } = await executeDbRpc(call.rpc_name, call.params)
                    sections.push(section)

                    if (!executorRpcNames.has(call.rpc_name) && call.rpc_name !== '__batch__') {
                        const normalizedRows = Array.isArray(rawData)
                            ? rawData
                            : (rawData === null || rawData === undefined ? [] : [rawData])
                        rawDbRecordsByRpcForGenUI[call.rpc_name] = normalizedRows

                        if (!isTrafficAgentContext) {
                            // PRIORIDADE: Captura apenas o primeiro resultado de listagem para o GenUI,
                            // evitando que consultas de "enriquecimento" (como listar todos os usuários)
                            // sobrescrevam a consulta principal (como logs de acesso).
                            if (!rawDbRecordsForGenUI) {
                                rawDbRecordsForGenUI = normalizedRows
                                rpcNameForGenUI = call.rpc_name
                            }
                        } else if (call.rpc_name === 'query_all_tasks') {
                            const taskRows = normalizedRows
                            const currentTaskRows = Array.isArray(rawDbRecordsForGenUI)
                                ? rawDbRecordsForGenUI
                                : []
                            rawDbRecordsForGenUI = [...currentTaskRows, ...taskRows]
                            rpcNameForGenUI = call.rpc_name
                        }
                    }
                }

                // Se a pergunta é de tarefas, forçamos o GenUI a usar query_all_tasks
                // (mesmo quando o LLM executa chamadas adicionais como query_all_projects).
                if (
                    !isTrafficAgentContext
                    && isTaskFocusedQueryForGenUi
                    && Object.prototype.hasOwnProperty.call(rawDbRecordsByRpcForGenUI, 'query_all_tasks')
                ) {
                    rawDbRecordsForGenUI = rawDbRecordsByRpcForGenUI['query_all_tasks']
                    rpcNameForGenUI = 'query_all_tasks'
                }

                // Guardrail adicional para perguntas de liderança/cargo:
                // consultar memória vetorial explícita além do SQL.
                if (isLeadershipQuery) {
                    const leadershipVectorContext = await runVectorRetrieval({
                        topK: 8,
                        overrideFilters: {
                            artifact_kind: null,
                            source_table: 'user_facts',
                            type_allowlist: ['official_doc', 'database_record', 'session_summary'],
                            type_blocklist: ['chat_log'],
                            status: 'active',
                        },
                        retrievalLabel: 'base vetorial de memória',
                    })
                    sections.push(`CONSULTA COMPLEMENTAR (MEMÓRIA VETORIAL):\n${leadershipVectorContext}`)
                }

                contextText = sections.join('\n\n')
            }
        } else {
            // === RAG (busca semântica) ===
            contextText = await runVectorRetrieval()
        }

        // Guardrail global: sempre consultar memória cognitiva antes de responder.
        cognitiveMemoryContext = await runCognitiveMemoryRetrieval()

        // 4. Generation Step — com identidade do usuário e histórico
        const agentName = (effectiveDecision.agent as any) || "Agent_Projects"
        const agentConfig = (AGENTS as any)[agentName]
        const allowTrafficGenUi = isTrafficAgentContext && rpcNameForGenUI === 'query_all_tasks'
        const disableAutoGenUi = rpcNameForGenUI === 'query_access_summary'
        const hasGenUiData = !!(rawDbRecordsForGenUI && Array.isArray(rawDbRecordsForGenUI) && rawDbRecordsForGenUI.length > 0)
            && (!isTrafficAgentContext || allowTrafficGenUi)
            && !disableAutoGenUi
        const isMarketingTrafficAgent = effectiveDecision.agent === 'Agent_MarketingTraffic'

        const responseStyleBlock = `
ESTILO DE RESPOSTA (OBRIGATÓRIO):
- Responda com tom executivo e profissional, direto ao ponto.
- NUNCA use frases como "como assistente virtual", "não tenho opiniões pessoais" ou equivalentes.
- Quando pedirem avaliação/opinião, entregue uma análise técnica baseada nos dados disponíveis.
- Não se exima: traga conclusão objetiva, riscos e próxima ação recomendada.
- Se faltar dado, diga exatamente o que falta e faça uma pergunta curta de esclarecimento.
- Se houver histórico fornecido no prompt, use esse histórico. Não diga que não tem acesso ao histórico quando ele estiver disponível.
- Se a FONTE DOS DADOS for SQL direta, nunca diga que precisa "acessar outro sistema" ou "confirmar qual banco". As consultas SQL já foram executadas.
- Se a pergunta tiver mais de uma parte (ex: tarefas + usuários + projetos), responda em blocos separados cobrindo cada parte.
- O sistema possui memória cognitiva ativa. Não diga que "não consegue armazenar informações" ou que "não tem memória" quando houver registro no contexto.
- Sempre considere os blocos "MEMÓRIA COGNITIVA RELEVANTE" e "FATOS EXPLÍCITOS SALVOS PELO USUÁRIO" antes de concluir.
- Em caso de conflito entre fontes, priorize a hierarquia normativa: policy > procedure/contract > memo > conversa, sempre com versão vigente.
- Nunca invente nomes de pessoas, cargos, números ou fatos.
- Para perguntas de faturamento/MRR/ARR, use apenas números explícitos da consulta SQL financeira (query_financial_summary). Nunca derive valores financeiros de listas de projetos sem valor.
- Se a consulta financeira indicar contratos ativos sem mensalidade cadastrada, destaque essa limitação e informe que o MRR/ARR pode estar subestimado.
- Se não houver evidência explícita no CONTEXTO RECUPERADO, responda que a informação não foi encontrada nas bases consultadas.
- Se existir um bloco "FATO EXPLÍCITO PRIORITÁRIO", ele prevalece para responder perguntas sobre liderança/cargo corporativo.
${hasGenUiData
                ? `FORMATO DE RESPOSTA (GenUI):
O sistema AUTOMATICAMENTE anexará a interface visual (GenUI) dos resultados da consulta ao final da sua mensagem.
Portanto, NÃO gere blocos JSON manualmente.
Para respostas com GenUI, escreva apenas uma frase introdutória curta confirmando os dados encontrados.
EXEMPLO: "Aqui estão os dados solicitados:"`
                : `FORMATO DE RESPOSTA:
Quando não houver bloco GenUI automático, entregue resposta completa em texto estruturado e objetivo.
Você pode usar títulos, subtítulos e listas para organizar a resposta.`}
${isMarketingTrafficAgent
                ? `
EXCEÇÃO DO AGENTE DE TRÁFEGO:
Para o Agent_MarketingTraffic, priorize relatório executivo bem formatado para apresentação ao cliente.
Inclua seções claras de diagnóstico, estratégia por canal (Google/Meta), estrutura de campanhas, métricas alvo, riscos e próximos passos.`
                : ''}
`.trim()

        // Montar bloco de identidade
        const identityBlock = userProfile
            ? `\nIDENTIDADE DO USUÁRIO (quem está conversando com você):\n- Nome: ${userProfile.full_name || userProfile.name}\n- Email: ${userProfile.email}\n- Cargo: ${userProfile.role}\n- Auth User ID: ${userId}\nVocê deve se dirigir ao usuário pelo nome e adaptar sua linguagem ao cargo dele.`
            : ''

        const crossSessionMemoryBlock = shouldInjectCrossSessionMemory
            ? (crossSessionMessages.length > 0
                ? `\nMEMÓRIA RECENTE DO USUÁRIO (outras sessões):\n${crossSessionMessages
                    .map((m) => {
                        const timestamp = new Date(m.created_at).toISOString()
                        const compact = (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 280)
                        return `- [${timestamp}] (${m.role}) ${compact}`
                    })
                    .join('\n')}`
                : `\nMEMÓRIA RECENTE DO USUÁRIO (outras sessões): nenhum registro recente encontrado.`)
            : ''

        const explicitLeadershipFactBlock = explicitLeadershipFact
            ? `\nFATO EXPLÍCITO PRIORITÁRIO (informado e salvo pelo usuário):\n${explicitLeadershipFact}`
            : ''

        const explicitUserFactsBlock = explicitUserFacts.length > 0
            ? `\nFATOS EXPLÍCITOS SALVOS PELO USUÁRIO:\n${explicitUserFacts
                .map((fact, idx) => `${idx + 1}. ${fact}`)
                .join('\n')}`
            : '\nFATOS EXPLÍCITOS SALVOS PELO USUÁRIO: nenhum fato explícito relevante foi encontrado para esta pergunta.'

        const cognitiveMemoryBlock = `\nMEMÓRIA COGNITIVA RELEVANTE:\n${cognitiveMemoryContext}`

        // v8.0 Estratificação de Memória (Tier 3: Base Canônica)
        const effectiveCanonicalBlock = isTrafficAgentContext ? '' : canonicalBlock
        const canonicalSystemBlock = `=== CAMADA 3: BASE DOCUMENTAL CANÔNICA (AUTORIDADE MÁXIMA) ===
Os princípios abaixo representam a identidade e as políticas inegociáveis da C4 Marketing.
Eles têm precedência absoluta sobre qualquer outra fonte de informação.

GUARDRAIL ABSOLUTO: Nenhuma resposta pode contradizer ou ignorar estes princípios.
${canonicalTier1Baseline}
${effectiveCanonicalBlock
                ? `\nDIRETRIZES CANÔNICAS RECUPERADAS DA BASE:\n${effectiveCanonicalBlock}`
                : '\nDIRETRIZES CANÔNICAS RECUPERADAS DA BASE: indisponíveis nesta consulta (mantendo Tier-1 baseline obrigatório).'}
=== FIM DA CAMADA 3 ===`

        // v8.0 Estratificação de Memória (Tier 2: Memória Consolidada e Contexto)
        const consolidatedMemoryBlock = `
=== CAMADA 2: MEMÓRIA CONSOLIDADA E CONTEXTO ===
DADOS RELEVANTES (RAG/SQL):
${contextText || "Nenhum documento específico encontrado."}

FATOS DO USUÁRIO:
${explicitUserFactsBlock}
MEMÓRIA COGNITIVA:
${cognitiveMemoryBlock}
=== FIM DA CAMADA 2 ===
        `.trim()

        // v8.0 Estratificação de Memória (Tier 1: Memória Volátil / Histórico)
        const systemPrompt = `
${canonicalSystemBlock}
${agentConfig.getSystemPrompt()}
${identityBlock}
${responseStyleBlock}

${consolidatedMemoryBlock}

=== CAMADA 1: MEMÓRIA VOLÁTIL (HISTÓRICO DA SESSÃO) ===
O histórico abaixo é o contexto imediato da nossa conversa atual.
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

        const endTime = performance.now()
        totalLatencyMs = Math.round(endTime - startTime)
        const usage = chatResponse.usage
        if (usage) {
            const mainModel = 'gpt-4o'; // Modelo principal dos agentes
            const chatCost = (usage.prompt_tokens * (MODEL_PRICES[mainModel]?.input || 0)) +
                (usage.completion_tokens * (MODEL_PRICES[mainModel]?.output || 0));

            totalInputTokens += usage.prompt_tokens;
            totalOutputTokens += usage.completion_tokens;
            totalCostEst += chatCost;

            modelUsage['gpt-4o'].input_tokens += usage.prompt_tokens;
            modelUsage['gpt-4o'].output_tokens += usage.completion_tokens;
            modelUsage['gpt-4o'].cost += chatCost;
        }

        let answer = chatResponse.choices[0].message.content || ''
        let suggestedSessionTitle: string | null = null

        const llmGeneratedGenUi = /"type"\s*:\s*"(?:task_list|project_list|client_list|proposal_list|user_list|access_list)"/.test(answer);

        if (isTrafficAgentContext && hasGenUiData && rawDbRecordsForGenUI && Array.isArray(rawDbRecordsForGenUI) && rawDbRecordsForGenUI.length > 0 && !llmGeneratedGenUi && rpcNameForGenUI === 'query_all_tasks') {
            // Traffic Agent: filtrar tasks pelo cliente/projeto mencionado na query antes de injetar GenUI.
            const normalizedQuery = normalizeText(query)
            const trafficFilteredTasks = rawDbRecordsForGenUI.filter((task: any) => {
                const clientName = normalizeText(task?.client_name || '')
                return clientName && normalizedQuery.includes(clientName.split(' ')[0])
            })

            // Substitui resposta de texto pelo GenUI visual (sem duplicar texto + cards)
            if (trafficFilteredTasks.length > 0) {
                answer = `\`\`\`json\n${JSON.stringify({ type: 'task_list', items: trafficFilteredTasks })}\n\`\`\``
            }
        }

        // FORÇA BRUTA: Injetar componente UI na resposta final via backend (apenas para agentes não-Traffic)
        if (hasGenUiData && rawDbRecordsForGenUI && Array.isArray(rawDbRecordsForGenUI) && rawDbRecordsForGenUI.length > 0 && !llmGeneratedGenUi && !isTrafficAgentContext) {
            // ANTI-DUPLICAÇÃO: Remover blocos ```json que o LLM já tenha gerado por conta própria
            // ou blocos de json truncados, para evitar duplicação com a injenção do GenUI
            answer = answer.replace(/```json[\s\S]*?(?:```|$)/g, '').trim();

            let genUiType = 'unknown_list';
            let genUiPayload: any = { type: genUiType, items: rawDbRecordsForGenUI };

            // 1. Lógica para Listas Clássicas
            if (rpcNameForGenUI === 'query_all_tasks') {
                const filteredTaskItems = isOpenTasksIntent(query)
                    ? rawDbRecordsForGenUI.filter((task: any) => isOpenTaskStatus(task?.status))
                    : rawDbRecordsForGenUI

                if (filteredTaskItems.length === 0 && isOpenTasksIntent(query)) {
                    genUiPayload = null
                    answer = 'Não encontrei tarefas em aberto no sistema neste momento.'
                } else {
                    genUiPayload = { type: 'task_list', items: filteredTaskItems }
                }
            }
            else if (rpcNameForGenUI === 'query_all_projects') {
                genUiPayload = { type: 'project_list', items: rawDbRecordsForGenUI };
            }
            else if (rpcNameForGenUI === 'query_all_proposals') {
                genUiPayload = { type: 'proposal_list', items: rawDbRecordsForGenUI };
            }
            else if (rpcNameForGenUI === 'query_all_clients') {
                genUiPayload = { type: 'client_list', items: rawDbRecordsForGenUI };
            }
            else if (rpcNameForGenUI === 'query_all_users') {
                // SANITIZAR: Remover campos sensíveis antes de expor no chat
                const sanitizedUsers = rawDbRecordsForGenUI.map((u: any) => ({
                    name: u.full_name || u.name || 'Sem nome',
                    role: u.role || 'Não definido',
                    last_access: u.last_access || null,
                }));
                genUiPayload = { type: 'user_list', items: sanitizedUsers };
            }
            else if (rpcNameForGenUI === 'query_access_summary') {
                // SANITIZAR: Mascarar emails nos logs de acesso
                const sanitizedAccess = rawDbRecordsForGenUI.map((a: any) => {
                    const email = a.user_email || '';
                    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                    return {
                        name,
                        total_accesses: a.total_accesses || 0,
                        last_access: a.last_access || null,
                    };
                });
                genUiPayload = { type: 'access_list', items: sanitizedAccess };
            }

            // --- FILTRAGEM INTELIGENTE (Pós-Processamento GenUI) ---
            // Se o usuário mencionar um nome ou email específico, filtramos os dados do GenUI
            // para mostrar apenas o que é relevante, evitando mostrar a lista completa desnecessariamente.
            if (rawDbRecordsForGenUI && Array.isArray(rawDbRecordsForGenUI) && rawDbRecordsForGenUI.length > 0) {
                const normalizedQuery = normalizeText(query);
                const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

                // Somente filtrar se houver palavras de busca relevantes (excluindo verbos comuns de listagem)
                const searchKeywords = queryWords.filter(w => !['listar', 'quais', 'quem', 'mostrar', 'todos', 'tudo', 'acesso', 'acessos'].includes(w));

                if (searchKeywords.length > 0) {
                    rawDbRecordsForGenUI = rawDbRecordsForGenUI.filter((item: any) => {
                        const searchableText = normalizeText(JSON.stringify(item));
                        return searchKeywords.some(kw => searchableText.includes(kw));
                    });
                }
            }
            // --------------------------------------------------------

            // 2. Lógica para Relatórios (Métricas Financeiras Mapeadas)
            else if (rpcNameForGenUI === 'query_financial_summary') {
                try {
                    const financeRecord = rawDbRecordsForGenUI[0];

                    // O retorno de query_financial_summary é um JSON nested, onde as métricas estão em financeRecord.totals
                    const mrrValue = financeRecord?.totals?.mrr || financeRecord?.mrr || financeRecord?.receita_recorrente || 0;
                    const arrValue = financeRecord?.totals?.arr || financeRecord?.arr || mrrValue * 12;

                    genUiPayload = null; // desabilita payload padrão

                    const reportBlockMRR = `\n\n\`\`\`json\n${JSON.stringify({
                        type: 'report',
                        title: 'Receita Recorrente (MRR)',
                        value: `R$ ${Number(mrrValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                        icon: 'trending-up',
                        trend: '+Ativo',
                        subtitle: 'Contratos Vigentes'
                    })}\n\`\`\``;

                    const reportBlockARR = `\n\n\`\`\`json\n${JSON.stringify({
                        type: 'report',
                        title: 'Receita Anualizada (ARR)',
                        value: `R$ ${Number(arrValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                        icon: 'trending-up',
                        subtitle: 'Projeção (MRR x 12)'
                    })}\n\`\`\``;

                    answer += reportBlockMRR + reportBlockARR;

                } catch (e) { /* fallback */ }
            }
            // 3. Lógica para Gráficos Previamente Preparados pela Função do Backend
            else if (rpcNameForGenUI === 'query_task_distribution_chart') {
                try {
                    genUiPayload = null; // O bloco inteiro foi devolvido no rawData no executeDbRpc
                    const chartBlockPre = rawDbRecordsForGenUI[0];
                    if (chartBlockPre?.type === 'chart') {
                        const chartJsonMd = `\n\n\`\`\`json\n${JSON.stringify(chartBlockPre)}\n\`\`\``;
                        answer += chartJsonMd;
                    }
                } catch (e) { /* fallback */ }
            }

            if (genUiPayload) {
                const genUiBlock = `\`\`\`json\n${JSON.stringify(genUiPayload)}\n\`\`\``;

                // CLEAN UI: Se for uma listagem pura e o LLM não gerou GenUI próprio,
                // substituímos o texto (que costuma ser repetitivo) pelo bloco visual.
                // REGRAS: 
                // 1. Deve ser um RPC de listagem pura.
                // 2. Não deve ser uma intenção analítica.
                // 3. Só substituímos se houver MAIS de um registro (listagem geral).
                //    Se houver apenas um registro (específico), mantemos o texto do LLM que é mais preciso.
                const pureListingRpcs = ['query_all_tasks', 'query_all_projects', 'query_all_proposals', 'query_all_clients', 'query_all_users', 'query_access_summary'];
                const isListingRpc = pureListingRpcs.includes(rpcNameForGenUI);

                const isAnalyticalIntent = hasAny(query, ['analise', 'avalie', 'compare', 'por que', 'motivo', 'explique', 'causa', 'entenda']);
                const hasMultipleResults = rawDbRecordsForGenUI && rawDbRecordsForGenUI.length > 1;

                if (isListingRpc && !isAnalyticalIntent && hasMultipleResults) {
                    answer = genUiBlock
                } else {
                    answer += `\n\n${genUiBlock}`
                }
            }
        }

        // Pós-processamento para bloquear frase proibida sobre "não ter acesso ao histórico".
        // Quando houver histórico, reformulamos para resumo do que está disponível.
        const deniedHistoryPatterns = [
            /não tenho acesso ao histórico/i,
            /não tenho acesso ao histórico de conversas/i,
            /não tenho acesso a conversas anteriores/i,
        ]
        const deniedHistoryDetected = deniedHistoryPatterns.some((p) => p.test(answer))
        if (isPastConversationIntent && deniedHistoryDetected) {
            const compact = (text: string) => (text || '').replace(/\s+/g, ' ').trim().slice(0, 160)
            const snippets: string[] = []

            for (const m of sessionMessages.slice(-4)) {
                snippets.push(`- ${m.role === 'user' ? 'Você' : 'Assistente'}: ${compact(m.content)}`)
            }
            for (const m of crossSessionMessages.slice(-4)) {
                snippets.push(`- ${m.role === 'user' ? 'Você' : 'Assistente'}: ${compact(m.content)}`)
            }

            if (snippets.length === 0) {
                answer = 'Não encontrei registros recentes de conversas anteriores para recuperar agora.'
            } else {
                answer = `Lembro do contexto disponível. Resumo rápido:\n${snippets.join('\n')}`
            }
        }

        // Respostas de logs de acesso devem ser sempre textuais (sem GenUI/JSON).
        const isAccessSummaryContext = executedDbRpcs.includes('query_access_summary')
        if (isAccessSummaryContext) {
            const accessRows = Array.isArray(rawDbRecordsForGenUI) ? rawDbRecordsForGenUI : []
            const extractedEmail = query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || null
            const sortedRows = [...accessRows].sort((a: any, b: any) => {
                const aTime = a?.last_access ? new Date(a.last_access).getTime() : 0
                const bTime = b?.last_access ? new Date(b.last_access).getTime() : 0
                return bTime - aTime
            })
            const formatAccessDate = (value: any) => {
                if (!value) return 'sem registro de acesso'
                const date = new Date(value)
                if (Number.isNaN(date.getTime())) return String(value)
                return date.toLocaleString('pt-BR')
            }
            const formatDisplayName = (email: string) => {
                const prefix = (email || '').split('@')[0] || 'Usuário'
                return prefix
                    .replace(/[._-]+/g, ' ')
                    .replace(/\b\w/g, (c: string) => c.toUpperCase())
            }

            if (extractedEmail) {
                const target = sortedRows.find((row: any) =>
                    String(row?.user_email || '').toLowerCase() === extractedEmail
                )
                if (target) {
                    const total = Number(target?.total_accesses || 0)
                    answer = `O último acesso do usuário ${extractedEmail} foi em ${formatAccessDate(target?.last_access)}.`
                    answer += ` Total de acessos registrados: ${total}.`
                } else {
                    answer = `Não encontrei registros de acesso para ${extractedEmail}.`
                }
            } else if (sortedRows.length > 0) {
                const lines = sortedRows.slice(0, 10).map((row: any) => {
                    const email = String(row?.user_email || '').toLowerCase()
                    const name = formatDisplayName(email)
                    const total = Number(row?.total_accesses || 0)
                    const last = formatAccessDate(row?.last_access)
                    return `- ${name} (${email}): total de acessos ${total}, último acesso em ${last}.`
                })
                answer = `Os seguintes usuários acessaram a plataforma:\n${lines.join('\n')}`
            } else {
                answer = 'Não encontrei registros de acesso no período consultado.'
            }

            // Remove qualquer bloco JSON residual para evitar renderização indevida no frontend.
            answer = answer.replace(/```json[\s\S]*?```/gi, '').trim()
        }

        const sanitizeSessionTitle = (raw: string): string | null => {
            if (!raw) return null
            const cleaned = raw
                .replace(/[`*_#"]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            if (!cleaned) return null
            return cleaned.slice(0, 80).trim()
        }

        const fallbackSessionTitle = () => {
            const base = query
                .replace(/\s+/g, ' ')
                .trim()
                .split(' ')
                .slice(0, 8)
                .join(' ')
            return sanitizeSessionTitle(base)
        }

        const shouldSuggestSessionTitle = !!session_id && sessionMessages.length <= 1 && query.trim().length >= 8
        if (shouldSuggestSessionTitle) {
            try {
                const titleResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    temperature: 0.2,
                    max_tokens: 24,
                    messages: [
                        {
                            role: 'system',
                            content: 'Gere um título curto em português para a conversa. Regras: até 7 palavras, direto ao ponto, sem aspas, sem ponto final, sem markdown.',
                        },
                        {
                            role: 'user',
                            content: `Pergunta inicial:\n${query}\n\nResumo da resposta:\n${answer.slice(0, 300)}`,
                        },
                    ],
                })
                suggestedSessionTitle = sanitizeSessionTitle(titleResponse.choices[0]?.message?.content || '')

                // LOG: Acumular tokens e custo do GPT-4o-mini usado no título
                const titleUsage = titleResponse.usage;
                if (titleUsage) {
                    const miniPrices = MODEL_PRICES['gpt-4o-mini'];
                    totalInputTokens += titleUsage.prompt_tokens;
                    totalOutputTokens += titleUsage.completion_tokens;
                    totalCostEst += (titleUsage.prompt_tokens * miniPrices.input) +
                        (titleUsage.completion_tokens * miniPrices.output);

                    modelUsage['gpt-4o-mini'].input_tokens += titleUsage.prompt_tokens;
                    modelUsage['gpt-4o-mini'].output_tokens += titleUsage.completion_tokens;
                    modelUsage['gpt-4o-mini'].cost += (titleUsage.prompt_tokens * miniPrices.input) +
                        (titleUsage.completion_tokens * miniPrices.output);
                }
            } catch (titleError: any) {
                console.warn('chat-brain title generation failed:', titleError?.message || titleError)
            }

            if (!suggestedSessionTitle) {
                suggestedSessionTitle = fallbackSessionTitle()
            }
        }

        if (suggestedSessionTitle && session_id) {
            try {
                const { error: updateTitleError } = await supabaseAdmin
                    .schema('brain')
                    .from('chat_sessions')
                    .update({
                        title: suggestedSessionTitle,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', session_id)
                    .eq('user_id', userId)

                if (updateTitleError) {
                    console.error('chat-brain failed to persist suggested title:', updateTitleError.message)
                }
            } catch (persistTitleError: any) {
                console.error('chat-brain exception persisting suggested title:', persistTitleError?.message || persistTitleError)
            }
        }

        await persistCognitiveMemorySafe('assistant', answer, 'assistant_answer_outbound')

        // v9.0 Agent_Autonomy: pós-execução de ações do Executor → sugestões proativas
        const isExecutorAction = executedDbRpcs.some((rpc) => executorRpcNames.has(rpc))
        if (isExecutorAction) {
            try {
                const lastExecutorRpc = executedDbRpcs.find((rpc) => executorRpcNames.has(rpc))
                const { data: suggestions } = await supabaseAdmin.rpc('query_autonomy_suggestions', {
                    p_project_id: null
                })
                if (Array.isArray(suggestions) && suggestions.length > 0) {
                    const topSuggestions = suggestions.slice(0, 3)
                    const suggestionLines = topSuggestions.map((s: any) => `• ${s.message}`).join('\n')
                    answer += `\n\n💡 **Sugestões do Agente Autônomo:**\n${suggestionLines}`
                }
            } catch (_autonomyError) {
                // fail-safe: não bloquear resposta por falha nas sugestões
            }
        }

        // Registro de telemetria e auditoria (v8.6 unificado)
        totalLatencyMs = Math.round(performance.now() - startTime);
        const logId = await logFinalAgentExecution({
            agentName: agentConfig.name,
            action: effectiveDecision.tool_hint === 'db_query' ? 'sql_query' : 'rag_search',
            status: 'success',
            answer: answer,
            result: { doc_count: retrievedDocs.length },
            latencyMs: totalLatencyMs
        });

        // 5. Return
        return new Response(JSON.stringify({
            answer,
            documents: retrievedDocs,
            meta: {
                decision: effectiveDecision,
                raw_router_decision: decision,
                agent: agentConfig.name,
                executed_db_rpcs: executedDbRpcs,
                cognitive_memory_docs: cognitiveMemoryDocs.length,
                normative_governance_enabled: normativeGovernanceEnabled,
                canonical_memory_enabled: canonicalMemoryEnabled,
                canonical_docs_loaded: canonicalDocsCount,
                memory_write_events: memoryWriteEvents,
                latency_ms: totalLatencyMs,
                cost_est: totalCostEst,
                log_id: logId,
                ...(suggestedSessionTitle ? { suggested_session_title: suggestedSessionTitle } : {})
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error("Error in chat-brain:", error)
        const errorMessage = error?.message || String(error)
        return new Response(JSON.stringify({
            answer: `Estou com uma falha temporária de integração, mas continuo disponível. Detalhes técnicos: ${errorMessage}`,
            documents: [],
            meta: { error: errorMessage }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
