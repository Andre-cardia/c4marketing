/**
 * Controller Agent — Loop Agentic ReAct-style
 *
 * Implementa o ciclo:
 *   [THINK]   callPlannerLLM → decide próxima ação
 *   [ACT]     executeTool    → executa RPC ou RAG
 *   [OBSERVE] coleta resultado e acumula workingMemory
 *   [MEMORY]  persiste observações relevantes em brain_documents
 *   [LOOP]    repete até produce_final_answer ou maxIterations
 *   [EVAL]    runEvaluator → LLM-as-a-judge
 *   [REFINE]  refineAnswer → máx 1 refinamento se score < 0.70
 *
 * Modelo: gpt-5.4-mini-2026-03-17 (temperature: 0) para planner e evaluator.
 */

import { OpenAI } from 'https://esm.sh/openai@4'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type {
    AgentName,
    ControllerResult,
    EvaluationResult,
    Observation,
    RouteDecision,
} from '../brain-types.ts'
import { runEvaluator, refineAnswer } from './evaluator.ts'

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const CONTROLLER_MODEL = 'gpt-5.4-mini-2026-03-17'
const MINI_PRICES = { input: 0.00000075, output: 0.0000045 }
const DEFAULT_MAX_ITERATIONS = 5

// ---------------------------------------------------------------------------
// Tipos internos do Controller
// ---------------------------------------------------------------------------

export interface ControllerContext {
    userId: string
    sessionId: string
    userRole: string
    agentName: AgentName
    initialDecision: RouteDecision
}

export interface ToolResult {
    text: string
    rawData: any
    success: boolean
    significant: boolean   // true se retornou dados não-vazios (guia persist memory)
}

export interface ControllerDeps {
    openai: OpenAI
    supabaseAdmin: SupabaseClient
    /** Executa um RPC no Supabase e retorna texto formatado + rawData */
    executeDbRpc: (rpcName: string, params: Record<string, any>) => Promise<{ section: string; rawData: any }>
    /** Executa busca vetorial RAG e retorna texto dos documentos */
    runVectorRetrieval: (query: string) => Promise<string>
    /** Persiste observação relevante em brain_documents (opcional — silencia erros) */
    persistMemory?: (obs: Observation, context: ControllerContext) => Promise<void>
}

// ---------------------------------------------------------------------------
// Definição das tools do planner (mesmas do router + produce_final_answer)
// ---------------------------------------------------------------------------

function buildPlannerTools() {
    return [
        // --- tool especial de parada ---
        {
            type: 'function' as const,
            function: {
                name: 'produce_final_answer',
                description: 'Chame quando tiver informação suficiente para responder ao usuário. O loop encerra imediatamente após esta chamada. NÃO chame se ainda precisar de mais dados.',
                parameters: {
                    type: 'object',
                    properties: {
                        answer: { type: 'string', description: 'Resposta completa e definitiva para o usuário, em português.' },
                    },
                    required: ['answer'],
                },
            },
        },
        // --- tools de leitura ---
        {
            type: 'function' as const,
            function: {
                name: 'query_all_proposals',
                description: 'Consultar propostas comerciais. Use para listar, contar ou filtrar propostas.',
                parameters: {
                    type: 'object',
                    properties: {
                        p_status_filter: { type: 'string', enum: ['all', 'open', 'accepted'], description: "Filtro de status. 'open'=em aberto, 'accepted'=aceitas, 'all'=todas." },
                    },
                    required: ['p_status_filter'],
                },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_all_clients',
                description: 'Consultar clientes que aceitaram propostas.',
                parameters: {
                    type: 'object',
                    properties: {
                        p_status: { type: 'string', enum: ['Ativo', 'Inativo', 'Suspenso', 'Cancelado', 'Finalizado'], description: 'Filtro por status. Omita para retornar todos.' },
                    },
                },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_all_projects',
                description: 'Consultar projetos de serviço (Gestão de Tráfego, Criação de Site, Landing Page).',
                parameters: {
                    type: 'object',
                    properties: {
                        p_service_type: { type: 'string', enum: ['traffic', 'website', 'landing_page'], description: 'Filtro por tipo. Omita para todos.' },
                        p_status_filter: { type: 'string', enum: ['Ativo', 'Inativo'], description: 'Filtro por status do cliente. Omita para todos.' },
                    },
                },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_financial_summary',
                description: 'Consultar resumo financeiro: MRR, ARR, faturamento recorrente, contratos ativos.',
                parameters: {
                    type: 'object',
                    properties: {
                        p_reference_date: { type: 'string', description: 'Data de referência YYYY-MM-DD.' },
                        p_status: { type: 'string', enum: ['Ativo', 'Inativo', 'Suspenso', 'Cancelado', 'Finalizado'] },
                        p_company_name: { type: 'string', description: 'Filtro por nome da empresa (partial match).' },
                        p_reference_tz: { type: 'string', description: 'Timezone IANA (ex: America/Sao_Paulo).' },
                    },
                },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_all_users',
                description: 'Consultar lista de usuários/colaboradores da equipe interna.',
                parameters: { type: 'object', properties: {} },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_all_tasks',
                description: 'Consultar tarefas e pendências dos projetos/clientes.',
                parameters: {
                    type: 'object',
                    properties: {
                        p_project_id: { type: 'number', description: 'ID do projeto. Omita para todos.' },
                        p_status: { type: 'string', enum: ['backlog', 'in_progress', 'approval', 'done', 'paused', 'todo', 'review'] },
                        p_overdue: { type: 'boolean', description: 'true = apenas tarefas atrasadas.' },
                        p_reference_date: { type: 'string', description: 'Data de referência YYYY-MM-DD.' },
                        p_reference_tz: { type: 'string', description: 'Timezone IANA.' },
                        p_created_date: { type: 'string', description: 'Filtrar por data de criação YYYY-MM-DD.' },
                    },
                },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_access_summary',
                description: 'Consultar logs de acesso ao sistema.',
                parameters: { type: 'object', properties: {} },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'query_survey_responses',
                description: 'Consultar respostas de pesquisas/formulários dos clientes.',
                parameters: {
                    type: 'object',
                    properties: {
                        p_client_name: { type: 'string', description: 'Nome do cliente (partial match).' },
                        p_project_type: { type: 'string', enum: ['traffic', 'website', 'landing_page'] },
                        p_limit: { type: 'number', description: 'Limite de registros.' },
                    },
                },
            },
        },
        {
            type: 'function' as const,
            function: {
                name: 'rag_search',
                description: 'Busca semântica no acervo de documentos (contratos, políticas, manuais, propostas).',
                parameters: { type: 'object', properties: {} },
            },
        },
    ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toolKey(name: string, args: Record<string, any>): string {
    return `${name}:${JSON.stringify(Object.entries(args).sort())}`
}

function buildWorkingMemoryEntry(obs: Observation): string {
    const status = obs.success ? 'OK' : 'FALHOU'
    const data = obs.output.slice(0, 1000) + (obs.output.length > 1000 ? '\n...(truncado)' : '')
    return `\n[Iteração ${obs.iteration} | ${obs.toolName} | ${status}]\n${data}`
}

// ---------------------------------------------------------------------------
// THINK: callPlannerLLM
// ---------------------------------------------------------------------------

interface PlannerDecision {
    action: 'use_tool' | 'produce_answer'
    toolName?: string
    toolArgs?: Record<string, any>
    answer?: string
}

async function callPlannerLLM(
    query: string,
    workingMemory: string,
    iteration: number,
    maxIterations: number,
    context: ControllerContext,
    deps: ControllerDeps,
): Promise<{ decision: PlannerDecision; inputTokens: number; outputTokens: number }> {
    const plannerTools = buildPlannerTools()

    const todayBrasilia = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })

    const systemPrompt = `Você é o PLANEJADOR do "Segundo Cérebro" da C4 Marketing.
Sua função é decidir, a cada iteração, qual ferramenta chamar para responder à pergunta do usuário.

Contexto:
- Iteração atual: ${iteration} / ${maxIterations}
- Agente: ${context.agentName}
- Data atual (Brasília): ${todayBrasilia}
- Role do usuário: ${context.userRole}

Regras:
1. Analise os dados já coletados (Working Memory abaixo).
2. Se você tiver informação SUFICIENTE para responder, chame produce_final_answer imediatamente.
3. Se precisar de mais dados, chame UMA tool por vez (a mais relevante).
4. NÃO repita uma tool com os mesmos parâmetros que já foi chamada.
5. Na iteração ${maxIterations} (última), OBRIGATORIAMENTE chame produce_final_answer com os dados disponíveis.
6. Prefira dados do banco (query_*) para fatos quantitativos; rag_search para documentos/análises.
7. Ações de escrita (execute_*) NÃO estão disponíveis neste modo — foque em leitura e análise.

Responda chamando UMA ferramenta por vez.`

    const userContent = workingMemory
        ? `PERGUNTA DO USUÁRIO:\n${query}\n\nWORKING MEMORY (dados coletados até agora):\n${workingMemory}`
        : `PERGUNTA DO USUÁRIO:\n${query}\n\n(nenhum dado coletado ainda — esta é a primeira iteração)`

    const completion = await deps.openai.chat.completions.create({
        model: CONTROLLER_MODEL,
        temperature: 0,
        tools: plannerTools,
        tool_choice: 'auto',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
        ],
    })

    const inputTokens = completion.usage?.prompt_tokens ?? 0
    const outputTokens = completion.usage?.completion_tokens ?? 0
    const message = completion.choices[0]?.message

    // Se o planner chamou uma tool
    if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0]
        const name = toolCall.function.name
        let args: Record<string, any> = {}
        try { args = JSON.parse(toolCall.function.arguments ?? '{}') } catch { /* vazio */ }

        if (name === 'produce_final_answer') {
            return {
                decision: { action: 'produce_answer', answer: args.answer ?? '' },
                inputTokens,
                outputTokens,
            }
        }

        return {
            decision: { action: 'use_tool', toolName: name, toolArgs: args },
            inputTokens,
            outputTokens,
        }
    }

    // Se não chamou tool, usa o texto como resposta final
    const textAnswer = message?.content ?? 'Não foi possível gerar uma resposta.'
    return {
        decision: { action: 'produce_answer', answer: textAnswer },
        inputTokens,
        outputTokens,
    }
}

// ---------------------------------------------------------------------------
// ACT: executeTool
// ---------------------------------------------------------------------------

async function executeTool(
    toolName: string,
    toolArgs: Record<string, any>,
    query: string,
    deps: ControllerDeps,
): Promise<ToolResult> {
    try {
        if (toolName === 'rag_search') {
            const text = await deps.runVectorRetrieval(query)
            return {
                text: text || '(busca vetorial não retornou documentos)',
                rawData: null,
                success: true,
                significant: text.length > 50,
            }
        }

        const { section, rawData } = await deps.executeDbRpc(toolName, toolArgs)
        const isError = section.toLowerCase().includes('falhou') || section.toLowerCase().includes('erro')
        const hasRows = Array.isArray(rawData) ? rawData.length > 0 : (rawData !== null && rawData !== undefined)

        return {
            text: section,
            rawData,
            success: !isError,
            significant: !isError && hasRows,
        }
    } catch (err: any) {
        const errMsg = `Erro ao executar ${toolName}: ${err?.message ?? String(err)}`
        console.warn(`[Controller] executeTool error: ${errMsg}`)
        return { text: errMsg, rawData: null, success: false, significant: false }
    }
}

// ---------------------------------------------------------------------------
// MEMORY UPDATE: persistir observação relevante
// ---------------------------------------------------------------------------

async function tryPersistMemory(
    obs: Observation,
    context: ControllerContext,
    deps: ControllerDeps,
): Promise<void> {
    if (!deps.persistMemory) return
    try {
        await deps.persistMemory(obs, context)
    } catch (err: any) {
        console.warn('[Controller] persistMemory error (silenced):', err?.message)
    }
}

// ---------------------------------------------------------------------------
// MAIN: runController
// ---------------------------------------------------------------------------

export async function runController(
    query: string,
    context: ControllerContext,
    deps: ControllerDeps,
    opts?: { maxIterations?: number },
): Promise<ControllerResult> {
    const maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS
    const observations: Observation[] = []
    let workingMemory = ''
    let iteration = 0
    let finalAnswer = ''
    let totalInputTokens = 0
    let totalOutputTokens = 0
    const seenToolKeys = new Set<string>()

    console.log(`[Controller] start — query="${query.slice(0, 80)}" maxIter=${maxIterations} agent=${context.agentName}`)

    // -------------------------------------------------------------------------
    // Loop principal: Think → Act → Observe → Memory
    // -------------------------------------------------------------------------
    while (iteration < maxIterations) {
        iteration++
        console.log(`[Controller] iteration ${iteration}/${maxIterations}`)

        // [THINK]
        let plannerDecision: PlannerDecision
        try {
            const result = await callPlannerLLM(
                query,
                workingMemory,
                iteration,
                maxIterations,
                context,
                deps,
            )
            plannerDecision = result.decision
            totalInputTokens += result.inputTokens
            totalOutputTokens += result.outputTokens
        } catch (err: any) {
            console.warn(`[Controller] callPlannerLLM failed at iter ${iteration}:`, err?.message)
            finalAnswer = workingMemory
                ? `Dados coletados até o momento:\n${workingMemory}`
                : 'Não foi possível processar a solicitação no momento.'
            break
        }

        // Se o planner decidiu responder
        if (plannerDecision.action === 'produce_answer') {
            finalAnswer = plannerDecision.answer ?? ''
            console.log(`[Controller] produce_final_answer na iteração ${iteration}`)
            break
        }

        const toolName = plannerDecision.toolName!
        const toolArgs = plannerDecision.toolArgs ?? {}

        // Loop detection: mesma tool + mesmos args já chamados
        const key = toolKey(toolName, toolArgs)
        if (seenToolKeys.has(key)) {
            console.warn(`[Controller] loop detection — tool "${toolName}" com mesmos args já chamada. Forçando parada.`)
            // Força resposta com dados disponíveis
            const forceResult = await callPlannerLLM(
                query,
                `${workingMemory}\n\n[AVISO: Você tentou chamar "${toolName}" novamente com os mesmos parâmetros. Você DEVE chamar produce_final_answer agora com os dados já coletados.]`,
                maxIterations, // finge ser última iteração
                maxIterations,
                context,
                deps,
            )
            finalAnswer = forceResult.decision.answer ?? workingMemory || 'Não foi possível coletar dados suficientes.'
            totalInputTokens += forceResult.inputTokens
            totalOutputTokens += forceResult.outputTokens
            break
        }
        seenToolKeys.add(key)

        // [ACT]
        const toolResult = await executeTool(toolName, toolArgs, query, deps)

        // [OBSERVE]
        const obs: Observation = {
            iteration,
            toolName,
            input: toolArgs,
            output: toolResult.text,
            success: toolResult.success,
            timestamp: Date.now(),
        }
        observations.push(obs)
        workingMemory += buildWorkingMemoryEntry(obs)

        console.log(`[Controller] obs ${iteration}: tool=${toolName} success=${toolResult.success} significant=${toolResult.significant}`)

        // [MEMORY UPDATE]
        if (toolResult.significant) {
            await tryPersistMemory(obs, context, deps)
        }
    }

    // Se saiu do loop sem produzir resposta (maxIterations atingido)
    if (!finalAnswer) {
        console.log('[Controller] maxIterations atingido — forçando produce_final_answer')
        try {
            const forced = await callPlannerLLM(
                query,
                `${workingMemory}\n\n[AVISO: Iterações esgotadas. Produza a melhor resposta possível com os dados acima.]`,
                maxIterations,
                maxIterations,
                context,
                deps,
            )
            finalAnswer = forced.decision.answer ?? workingMemory || 'Limite de iterações atingido sem dados suficientes.'
            totalInputTokens += forced.inputTokens
            totalOutputTokens += forced.outputTokens
        } catch {
            finalAnswer = workingMemory || 'Não foi possível processar a solicitação.'
        }
    }

    // -------------------------------------------------------------------------
    // [EVALUATE]
    // -------------------------------------------------------------------------
    let evaluationResult: EvaluationResult | null = null
    try {
        evaluationResult = await runEvaluator(
            { query, answer: finalAnswer, observations, agentName: context.agentName },
            { openai: deps.openai },
        )

        // [REFINE] — máx 1 vez, sem loop adicional
        if (!evaluationResult.pass) {
            console.log(`[Controller] evaluator score=${evaluationResult.score.toFixed(2)} — refinando resposta`)
            const refined = await refineAnswer(
                finalAnswer,
                query,
                evaluationResult,
                observations,
                { openai: deps.openai },
            )
            finalAnswer = refined
        }
    } catch (err: any) {
        console.warn('[Controller] evaluator/refine error (silenced):', err?.message)
    }

    // -------------------------------------------------------------------------
    // Custo total
    // -------------------------------------------------------------------------
    const evalCost = evaluationResult?.cost_est ?? 0
    const plannerCost = (totalInputTokens * MINI_PRICES.input) + (totalOutputTokens * MINI_PRICES.output)
    const totalCostEst = plannerCost + evalCost

    console.log(
        `[Controller] done — iterations=${iteration} obs=${observations.length}` +
        ` eval=${evaluationResult ? `score=${evaluationResult.score.toFixed(2)} pass=${evaluationResult.pass}` : 'skipped'}` +
        ` cost=$${totalCostEst.toFixed(6)}`
    )

    return {
        answer: finalAnswer,
        iterations: iteration,
        observations,
        evaluationResult,
        finalDecision: context.initialDecision,
        totalCostEst,
        totalInputTokens,
        totalOutputTokens,
    }
}
