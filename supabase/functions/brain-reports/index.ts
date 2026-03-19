/**
 * brain-reports — Edge Function para geração e gestão de relatórios CUA
 *
 * Ações suportadas (POST):
 *   list     → lista relatórios em brain.reports
 *   get      → retorna relatório específico
 *   generate → gera conteúdo com GPT + salva em brain.reports
 *   schedule → agenda entrega de relatório existente
 *   deliver  → marca como entregue
 *
 * Política: SOMENTE gestor. Verifica via app_users pelo email do JWT.
 * Modelo geração: gpt-5.4-mini-2026-03-17
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    })

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const REPORT_MODEL = 'gpt-5.4-mini-2026-03-17'

// ---------------------------------------------------------------------------
// Auth helper — extrai email do JWT (sem verificar assinatura)
// ---------------------------------------------------------------------------

function extractEmail(token: string): string | null {
    try {
        const parts = token.split('.')
        if (parts.length < 2) return null
        // Base64url → Base64
        const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(
            Math.ceil(parts[1].length / 4) * 4, '='
        )
        const payload = JSON.parse(atob(padded))
        return typeof payload.email === 'string' ? payload.email : null
    } catch {
        return null
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList(supabase: any) {
    const { data, error } = await supabase
        .schema('brain')
        .from('reports')
        .select('id,title,report_type,status,deliver_at,delivered_at,created_by,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) throw error
    return json({ reports: data ?? [] })
}

async function handleGet(supabase: any, reportId: string) {
    if (!reportId) return json({ error: 'report_id é obrigatório.' }, 400)

    const { data, error } = await supabase
        .schema('brain')
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single()

    if (error || !data) return json({ error: 'Relatório não encontrado.' }, 404)
    return json({ report: data })
}

async function handleGenerate(
    supabase: any,
    openai: OpenAI,
    reportType: string,
    params: Record<string, any>,
    createdBy: string,
) {
    const validTypes = ['ops_daily', 'proposal_pipeline', 'contract_pulse', 'client_health', 'custom']
    if (!validTypes.includes(reportType)) {
        return json({ error: `Tipo "${reportType}" inválido. Use: ${validTypes.join(', ')}` }, 400)
    }

    // --- custom: sem geração por GPT ---
    if (reportType === 'custom') {
        const content = params.content
        const title = params.title || 'Relatório personalizado'
        if (!content) return json({ error: 'params.content é obrigatório para tipo custom.' }, 400)

        const { data, error } = await supabase
            .schema('brain')
            .from('reports')
            .insert({
                title,
                content,
                report_type: 'custom',
                session_id: params.session_id ?? 'manual',
                status: 'draft',
                created_by: createdBy,
            })
            .select('id,title,status')
            .single()

        if (error) throw error
        return json({ report: data, message: `Relatório "${title}" salvo.` })
    }

    // --- tipos gerados por GPT ---
    const context = await gatherContext(supabase, reportType)
    const { title, content } = await generateWithGPT(openai, reportType, context)

    const { data, error } = await supabase
        .schema('brain')
        .from('reports')
        .insert({
            title,
            content,
            report_type: reportType,
            session_id: params.session_id ?? 'manual',
            status: 'draft',
            created_by: createdBy,
        })
        .select('id,title,status,content')
        .single()

    if (error) throw error
    return json({
        report: data,
        message: `Relatório "${title}" gerado e salvo (ID: ${data.id}).`,
    })
}

async function handleSchedule(supabase: any, reportId: string, deliverAt: string) {
    if (!reportId || !deliverAt) {
        return json({ error: 'report_id e deliver_at são obrigatórios.' }, 400)
    }

    const { data, error } = await supabase
        .schema('brain')
        .from('reports')
        .update({ status: 'scheduled', deliver_at: deliverAt, updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .select('id,title,deliver_at')
        .single()

    if (error || !data) return json({ error: 'Relatório não encontrado.' }, 404)
    return json({ report: data, message: `Relatório "${data.title}" agendado para ${data.deliver_at}.` })
}

async function handleDeliver(supabase: any, reportId: string) {
    if (!reportId) return json({ error: 'report_id é obrigatório.' }, 400)

    const now = new Date().toISOString()
    const { data, error } = await supabase
        .schema('brain')
        .from('reports')
        .update({ status: 'delivered', delivered_at: now, updated_at: now })
        .eq('id', reportId)
        .select('id,title')
        .single()

    if (error || !data) return json({ error: 'Relatório não encontrado.' }, 404)
    return json({ report: data, message: `Relatório "${data.title}" marcado como entregue.` })
}

// ---------------------------------------------------------------------------
// Coleta de contexto por tipo de relatório
// ---------------------------------------------------------------------------

async function gatherContext(supabase: any, reportType: string): Promise<string> {
    const todayBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })

    if (reportType === 'ops_daily') {
        const [tasks, overdue] = await Promise.all([
            supabase.rpc('query_all_tasks', { p_status: 'in_progress' }),
            supabase.rpc('query_all_tasks', { p_overdue: true }),
        ])
        return [
            `Data: ${todayBR}`,
            `\n## Tarefas em andamento (${tasks.data?.length ?? 0}):`,
            JSON.stringify(tasks.data?.slice(0, 30) ?? [], null, 2),
            `\n## Tarefas atrasadas (${overdue.data?.length ?? 0}):`,
            JSON.stringify(overdue.data?.slice(0, 20) ?? [], null, 2),
        ].join('\n')
    }

    if (reportType === 'proposal_pipeline') {
        const { data } = await supabase.rpc('query_all_proposals', { p_status_filter: 'all' })
        return [
            `Data: ${todayBR}`,
            `\n## Propostas (${data?.length ?? 0} total):`,
            JSON.stringify(data ?? [], null, 2),
        ].join('\n')
    }

    if (reportType === 'contract_pulse') {
        const [ativos, inativos] = await Promise.all([
            supabase.rpc('query_all_clients', { p_status: 'Ativo' }),
            supabase.rpc('query_all_clients', { p_status: 'Suspenso' }),
        ])
        return [
            `Data: ${todayBR}`,
            `\n## Contratos Ativos (${ativos.data?.length ?? 0}):`,
            JSON.stringify(ativos.data ?? [], null, 2),
            `\n## Contratos Suspensos (${inativos.data?.length ?? 0}):`,
            JSON.stringify(inativos.data ?? [], null, 2),
        ].join('\n')
    }

    if (reportType === 'client_health') {
        const [clients, projects] = await Promise.all([
            supabase.rpc('query_all_clients'),
            supabase.rpc('query_all_projects'),
        ])
        return [
            `Data: ${todayBR}`,
            `\n## Clientes (${clients.data?.length ?? 0}):`,
            JSON.stringify(clients.data ?? [], null, 2),
            `\n## Projetos ativos (${projects.data?.length ?? 0}):`,
            JSON.stringify(projects.data?.slice(0, 30) ?? [], null, 2),
        ].join('\n')
    }

    return `Data: ${todayBR}\n(sem contexto adicional)`
}

// ---------------------------------------------------------------------------
// Geração de conteúdo via GPT
// ---------------------------------------------------------------------------

const REPORT_PROMPTS: Record<string, { title: string; instruction: string }> = {
    ops_daily: {
        title: () => `Operacional Diário — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        instruction: `Você é um assistente de operações da C4 Marketing. Gere um relatório operacional diário profissional em Markdown com as seções:
1. Resumo Executivo (2-3 frases)
2. Tarefas em Andamento (tabela: projeto, tarefa, responsável, prazo)
3. Alertas de Atraso (tarefas atrasadas com detalhes)
4. Recomendações (2-3 ações prioritárias)

Seja objetivo, direto e use linguagem gerencial.`,
    },
    proposal_pipeline: {
        title: () => `Pipeline de Propostas — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        instruction: `Você é um analista comercial da C4 Marketing. Gere um relatório de pipeline de propostas em Markdown com as seções:
1. Sumário Comercial (total, aceitas, em aberto, conversão %)
2. Propostas em Aberto (tabela: empresa, valor mensal, valor setup, data)
3. Propostas Aceitas Recentemente
4. Oportunidades e Próximos Passos

Use linguagem comercial profissional.`,
    },
    contract_pulse: {
        title: () => `Pulso de Contratos — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        instruction: `Você é o gestor de contratos da C4 Marketing. Gere um relatório de saúde contratual em Markdown com as seções:
1. Visão Geral (ativos, suspensos, ações necessárias)
2. Contratos Ativos (tabela: empresa, status, observações)
3. Contratos Suspensos (tabela: empresa, motivo provável)
4. Riscos e Ações Recomendadas

Destaque clientes que precisam de atenção.`,
    },
    client_health: {
        title: () => `Saúde de Clientes — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        instruction: `Você é o gerente de sucesso de clientes da C4 Marketing. Gere um relatório de saúde geral dos clientes em Markdown com as seções:
1. Panorama Geral (total de clientes, distribuição por status)
2. Clientes em Destaque (mais projetos ativos, melhores indicadores)
3. Clientes que Precisam de Atenção (poucos projetos, status suspenso)
4. Recomendações de Ação

Foco em retenção e expansão de receita.`,
    },
}

async function generateWithGPT(
    openai: OpenAI,
    reportType: string,
    context: string,
): Promise<{ title: string; content: string }> {
    const config = REPORT_PROMPTS[reportType]
    const title = typeof config?.title === 'function' ? config.title() : `Relatório ${reportType}`

    const completion = await openai.chat.completions.create({
        model: REPORT_MODEL,
        temperature: 0.3,
        messages: [
            {
                role: 'system',
                content: config?.instruction ?? 'Gere um relatório profissional em Markdown com base nos dados fornecidos.',
            },
            {
                role: 'user',
                content: `Dados para o relatório:\n\n${context.slice(0, 12000)}`,
            },
        ],
    })

    const content = completion.choices[0]?.message?.content ?? '_(sem conteúdo gerado)_'
    return { title, content }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS })
    }

    if (req.method !== 'POST') {
        return json({ error: 'Método não permitido. Use POST.' }, 405)
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { db: { schema: 'public' } }
    )

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

    try {
        // --- Auth: extrai email do JWT ---
        const authHeader = req.headers.get('Authorization') ?? ''
        const token = authHeader.replace('Bearer ', '').trim()
        const jwtEmail = extractEmail(token)

        if (!jwtEmail) {
            return json({ error: 'Token inválido ou email ausente no JWT.' }, 401)
        }

        // --- Verifica role = gestor ---
        const { data: userRow } = await supabase
            .from('app_users')
            .select('role')
            .eq('email', jwtEmail)
            .single()

        if (userRow?.role !== 'gestor') {
            return json({ error: 'Acesso negado: relatórios do agente são exclusivos para gestores.' }, 403)
        }

        // --- Parse body ---
        let body: any
        try {
            body = await req.json()
        } catch {
            return json({ error: 'Body JSON inválido.' }, 400)
        }

        const { action } = body
        if (!action) return json({ error: 'Campo "action" é obrigatório.' }, 400)

        switch (action) {
            case 'list':
                return handleList(supabase)
            case 'get':
                return handleGet(supabase, body.report_id)
            case 'generate':
                return handleGenerate(supabase, openai, body.report_type ?? 'custom', body.params ?? {}, jwtEmail)
            case 'schedule':
                return handleSchedule(supabase, body.report_id, body.deliver_at)
            case 'deliver':
                return handleDeliver(supabase, body.report_id)
            default:
                return json({ error: `Ação "${action}" não reconhecida. Use: list, get, generate, schedule, deliver.` }, 400)
        }
    } catch (err: any) {
        console.error('[brain-reports]', err)
        return json({ error: err?.message ?? 'Erro interno no servidor.' }, 500)
    }
})
