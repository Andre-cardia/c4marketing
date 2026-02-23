
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

        // Idempotency: Se recebido do frontend, evita duplicação de execução pesada em retentativa.
        const idempotencyKey = req.headers.get('x-idempotency-key') || null
        const rawClientToday = typeof requestBody?.client_today === 'string' ? requestBody.client_today.trim() : null
        const clientTimezone = typeof requestBody?.client_tz === 'string' ? requestBody.client_tz.trim() : null
        const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
        const clientToday = rawClientToday && isIsoDate(rawClientToday) ? rawClientToday : null
        const runtimeToday = (() => {
            const now = new Date()
            const y = String(now.getFullYear())
            const m = String(now.getMonth() + 1).padStart(2, '0')
            const d = String(now.getDate()).padStart(2, '0')
            return `${y}-${m}-${d}`
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

        // O chat do /brain deve operar autenticado para preservar identidade/memória por usuário.
        if (userId === 'anon_user') {
            return new Response(JSON.stringify({
                answer: 'Sessão inválida ou expirada. Faça login novamente para restaurar identidade e memória do agente.',
                documents: [],
                meta: { auth: 'missing_or_invalid' }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
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

        type DbQueryCall = {
            rpc_name: string
            params: Record<string, any>
        }

        const dbRpcNames = new Set([
            'query_all_proposals',
            'query_all_clients',
            'query_all_projects',
            'query_financial_summary',
            'query_all_users',
            'query_all_tasks',
            'query_access_summary',
            'query_survey_responses',
            'execute_create_traffic_task',
            'execute_update_project_status',
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
                let p_status: string | null = null
                if (hasAny(text, ['pendente', 'pendentes', 'a fazer', 'em aberto'])) p_status = 'backlog'
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
                    description: "Criar uma nova tarefa em um projeto. SEMPRE use esta ferramenta para pedidos de 'criar tarefa', 'agendar atividade' ou 'adicionar pendência'. Precisa do ID numérico do projeto (acceptance_id).",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_id: { type: "number", description: "ID numérico do projeto (acceptance). Busque com query_all_projects se necessário." },
                            p_title: { type: "string", description: "Título da tarefa." },
                            p_description: { type: "string", description: "Descrição detalhada." },
                            p_due_date: { type: "string", format: "date", description: "Data de entrega (YYYY-MM-DD)." },
                            p_priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade. Padrão: medium." },
                            p_status: { type: "string", enum: ["backlog", "in_progress", "approval", "done"], description: "Status inicial. Padrão: backlog." },
                            p_assignee: { type: "string", description: "Nome do responsável pela tarefa." }
                        },
                        required: ["p_project_id", "p_title"]
                    }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "execute_update_project_status",
                    description: "Atualizar o status de um projeto de tráfego/site/lp. Use para 'marcar projeto como concluído', 'pausar projeto', etc.",
                    parameters: {
                        type: "object",
                        properties: {
                            p_project_id: { type: "string", format: "uuid", description: "UUID do projeto." },
                            p_new_status: { type: "string", description: "Novo status (ex: Ativo, Inativo, Pausado)." },
                            p_notes: { type: "string", description: "Notas sobre a alteração." },
                            p_idempotency_key: { type: "string", description: "Chave única (uuid)." }
                        },
                        required: ["p_project_id", "p_new_status"]
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
- "qual o MRR e ARR dos contratos ativos?" → query_financial_summary(p_status: "Ativo")
- "qual o faturamento recorrente atual?" → query_financial_summary(p_status: "Ativo")
- "qual foi o faturamento de janeiro de 2026?" → query_financial_summary(p_status: "Ativo", p_reference_date: "2026-01-31")
- "quem acessou o sistema hoje?" → query_access_summary()
- "o que diz o contrato com a empresa X?" → rag_search()
- "quais tarefas estão pendentes?" → query_all_tasks(p_status: "backlog")
- "quais tarefas estão atrasadas?" → query_all_tasks(p_overdue: true)
- "quantas propostas já foram aceitas?" → query_all_proposals(p_status_filter: "accepted")
- "me fale sobre o cliente Amplexo" → rag_search() (busca semântica)
- "o que a Amplexo respondeu na pesquisa?" → query_survey_responses(p_client_name: "Amplexo")
- "mostre as respostas do formulário de tráfego" → query_survey_responses(p_project_type: "traffic")
- "quem é o CEO da C4?" → query_all_users()
- "quem é o CTO da C4?" → query_all_users()
- "qual é o cargo do André Cardia?" → query_all_users()
- "crie uma tarefa chamada X para amanhã no projeto 28" → execute_create_traffic_task(p_project_id: 28, p_title: "X", p_due_date: "YYYY-MM-DD")
- "adicione uma pendência de revisão de criativos no projeto 12" → execute_create_traffic_task(p_project_id: 12, p_title: "Revisão de criativos")
- "agende uma atividade para o projeto da Amplexo" → execute_create_traffic_task(p_project_id: <id>, p_title: "...")
- "marque o projeto como concluído" → execute_update_project_status(p_project_id: <id>, p_new_status: "Inativo")
- "pause o projeto X" → execute_update_project_status(p_project_id: <id>, p_new_status: "Pausado")
Quando a pergunta for sobre pessoas, cargos, funções, C-level (CEO/CTO/CFO/COO/CMO/CIO), fundador ou papéis internos, priorize query_all_users.
Quando a pergunta envolver faturamento, MRR, ARR, receita recorrente ou run-rate, priorize query_financial_summary e evite usar query_all_projects/query_all_proposals para cálculo financeiro.
Quando a pergunta citar um mês/ano específico (ex: janeiro/2026, fev 2026), defina p_reference_date no último dia do mês citado.
Quando o usuário pedir para CRIAR tarefa/pendência/atividade, SEMPRE use execute_create_traffic_task. NÃO peça confirmação — execute diretamente.
Quando o usuário pedir para ALTERAR STATUS de projeto, SEMPRE use execute_update_project_status.
Se a pergunta tiver múltiplas solicitações independentes (ex: tarefas + usuários + projetos), faça uma function call para CADA solicitação.
Retorne apenas function calls (sem texto livre).`
                    },
                    { role: 'user', content: input.user_message }
                ]
            })

            const rawToolCalls = completion.choices[0].message.tool_calls ?? []

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
                    'query_all_users': { agent: 'Agent_BrainOps', artifact_kind: 'ops' },
                    'query_all_tasks': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'query_access_summary': { agent: 'Agent_BrainOps', artifact_kind: 'ops' },
                    'query_survey_responses': { agent: 'Agent_Projects', artifact_kind: 'project' },
                    'rag_search': { agent: 'Agent_Projects', artifact_kind: 'unknown' },
                    'execute_create_traffic_task': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                    'execute_update_project_status': { agent: 'Agent_Executor', artifact_kind: 'ops' },
                }

                const llmDbCalls: DbQueryCall[] = parsedCalls
                    .filter((call) => call.name !== 'rag_search')
                    .filter((call) => dbRpcNames.has(call.name))
                    .map((call) => ({ rpc_name: call.name, params: call.args || {} }))

                // Complementa consultas em perguntas compostas para evitar respostas parciais.
                const supplementalDbCalls = inferSupplementalDbCalls(input.user_message)
                let dbCalls = dedupeDbCalls(enrichDbCalls(mergeDbCalls(llmDbCalls, supplementalDbCalls)))

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

        console.log(`[Router] Decision: ${decision.agent} (Risk: ${decision.risk_level})`)

        // 3. Retrieval Step (Hybrid: RAG ou SQL direto)
        let contextText = ''
        let retrievedDocs: any[] = []
        let cognitiveMemoryDocs: any[] = []
        let cognitiveMemoryContext = ''
        let explicitUserFacts: string[] = []
        let executedDbRpcs: string[] = []
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
            'execute_update_project_status',
        ])

        const executeDbRpc = async (rpc_name: string, rpcParams: Record<string, any>) => {
            const cleanParams = cleanRpcParams(rpcParams)
            const isExecutorAction = executorRpcNames.has(rpc_name)

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
                            p_params: cleanParams,
                            p_result: {},
                            p_latency_ms: rpcLatencyMs,
                            p_error_message: rpcError.message,
                        }).catch(() => { })
                    } catch (_e) { /* fail-safe */ }
                }

                return `EXECUÇÃO FALHOU via ${rpc_name}: ${rpcError.message}. Informe o erro com transparência e não invente dados.`
            }

            let normalizedData: any = data
            if (typeof normalizedData === 'string') {
                try {
                    normalizedData = JSON.parse(normalizedData)
                } catch {
                    // mantém string original se não for JSON válido
                }
            }

            // Para RPCs de escrita, retornar resultado direto (JSONB com status)
            if (isExecutorAction) {
                const result = normalizedData || {}
                const status = result?.status || 'unknown'
                const message = result?.message || JSON.stringify(result)
                console.log(`[Executor] ${rpc_name} → ${status}: ${message}`)
                return `AÇÃO EXECUTADA COM SUCESSO via ${rpc_name} (${rpcLatencyMs}ms):\n${JSON.stringify(result, null, 2)}`
            }

            if (!normalizedData || (Array.isArray(normalizedData) && normalizedData.length === 0) || normalizedData === '[]') {
                return `CONSULTA REALIZADA COM SUCESSO via ${rpc_name}, mas NENHUM registro foi encontrado. Informe ao usuário que a consulta foi feita no banco de dados e não há registros correspondentes no momento.`
            }

            const records = Array.isArray(normalizedData) ? normalizedData : [normalizedData]
            return `DADOS DO BANCO DE DADOS (${records.length} registros encontrados via ${rpc_name}):\n\n${JSON.stringify(records, null, 2)}`
        }

        // Tier-1: busca documentos canônicos corporativos via RPC dedicado.
        // Ignora isolamento por tenant do usuário — usa tenant 'c4_corporate_identity'.
        const runCanonicalRetrieval = async (): Promise<{ text: string; count: number }> => {
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
            const topKToUse = typeof opts?.topK === 'number' ? opts.topK : decision.top_k
            console.log(`[Tool] rag_search → top_k: ${topKToUse}`)
            try {
                const embedder = makeOpenAIEmbedder({ apiKey: Deno.env.get('OPENAI_API_KEY')! })
                const baseFilters = {
                    ...decision.filters,
                    ...(opts?.overrideFilters || {}),
                }
                const label = opts?.retrievalLabel || 'base vetorial'
                const hasForcedPolicy = !!opts?.forcedPolicy
                const canUseNormative =
                    normativeGovernanceEnabled &&
                    !hasForcedPolicy &&
                    decision.retrieval_policy === 'STRICT_DOCS_ONLY'

                const primaryPolicy: RetrievalPolicy = opts?.forcedPolicy
                    ? opts.forcedPolicy
                    : (canUseNormative ? 'NORMATIVE_FIRST' : decision.retrieval_policy)

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
                            policy: decision.retrieval_policy
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

        if (decision.tool_hint === 'db_query' && decision.db_query_params) {
            // === SQL DIRETO (listagens, contagens, filtros exatos) ===
            const plannedCalls: DbQueryCall[] = []

            if (decision.db_query_params.rpc_name === '__batch__' && Array.isArray(decision.db_query_params.calls)) {
                for (const rawCall of decision.db_query_params.calls) {
                    if (!rawCall || typeof rawCall !== 'object') continue
                    const { rpc_name, ...rpcParams } = rawCall
                    if (typeof rpc_name !== 'string' || !dbRpcNames.has(rpc_name)) continue
                    plannedCalls.push({ rpc_name, params: rpcParams })
                }
            } else {
                const { rpc_name, ...rpcParams } = decision.db_query_params
                if (typeof rpc_name === 'string' && dbRpcNames.has(rpc_name)) {
                    plannedCalls.push({ rpc_name, params: rpcParams })
                }
            }

            const finalCalls = dedupeDbCalls(enrichDbCalls(dedupeDbCalls(plannedCalls)))
            if (finalCalls.length === 0) {
                // Guardrail: sempre consultar alguma base antes de responder
                contextText = await runVectorRetrieval()
            } else {
                const sections: string[] = []
                for (const call of finalCalls) {
                    executedDbRpcs.push(call.rpc_name)
                    const section = await executeDbRpc(call.rpc_name, call.params)
                    sections.push(section)
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
        const agentConfig = AGENTS[decision.agent] || AGENTS["Agent_Projects"]

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
        const canonicalSystemBlock = canonicalBlock
            ? `=== CAMADA 3: BASE DOCUMENTAL CANÔNICA (AUTORIDADE MÁXIMA) ===
Os princípios abaixo representam a identidade e as políticas inegociáveis da C4 Marketing. 
Eles têm precedência absoluta sobre qualquer outra fonte de informação.

GUARDRAIL ABSOLUTO: Nenhuma resposta pode contradizer ou ignorar estes princípios.
${canonicalBlock}
=== FIM DA CAMADA 3 ===`
            : ''

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
        const totalLatencyMs = Math.round(endTime - startTime)
        const usage = chatResponse.usage

        // Cálculo de custo estimado (GPT-4o)
        // Preços (Fev 2026): Input $2.50/1M, Output $10.00/1M
        const inputTokens = usage?.prompt_tokens || 0
        const outputTokens = usage?.completion_tokens || 0
        const costEst = (inputTokens * 0.0000025) + (outputTokens * 0.00001)

        let answer = chatResponse.choices[0].message.content || ''

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

        await persistCognitiveMemorySafe('assistant', answer, 'assistant_answer_outbound')

        // Registro de telemetria e auditoria (v8.0)
        let logId = null
        try {
            const { data } = await supabaseAdmin.rpc('log_agent_execution', {
                p_session_id: session_id,
                p_agent_name: agentConfig.name,
                p_action: decision.tool_hint === 'db_query' ? 'sql_query' : 'rag_search',
                p_status: 'success',
                p_params: {
                    decision,
                    idempotency_key: idempotencyKey,
                    token_usage: usage
                },
                p_result: { doc_count: retrievedDocs.length },
                p_latency_ms: totalLatencyMs,
                p_cost_est: costEst,
                p_message_id: chatResponse.id
            })
            logId = data
        } catch (logError) {
            console.error('[v8.0] Failed to log execution:', logError)
        }

        // 5. Return
        return new Response(JSON.stringify({
            answer,
            documents: retrievedDocs,
            meta: {
                decision: decision,
                agent: agentConfig.name,
                executed_db_rpcs: executedDbRpcs,
                cognitive_memory_docs: cognitiveMemoryDocs.length,
                normative_governance_enabled: normativeGovernanceEnabled,
                canonical_memory_enabled: canonicalMemoryEnabled,
                canonical_docs_loaded: canonicalDocsCount,
                memory_write_events: memoryWriteEvents,
                latency_ms: totalLatencyMs,
                cost_est: costEst,
                log_id: logId
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
