
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const getDisplayCompanyName = (acceptance: any) => {
    const alias = String(acceptance?.company_alias || '').trim()
    const legal = String(acceptance?.company_name || '').trim()
    return alias || legal || 'N/A'
}

const formatDateTimePt = (value?: string | null) => {
    if (!value) return 'n/a'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value)
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(parsed)
}

const formatCurrencyBr = (value?: number | string | null) => {
    if (value === null || value === undefined || value === '') return 'n/a'
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(numeric)
}

const getUserLabel = (user: any) => {
    const fullName = String(user?.full_name || '').trim()
    const shortName = String(user?.name || '').trim()
    const email = String(user?.email || '').trim()
    return fullName || shortName || email || 'Sem responsavel'
}

const getLeadStatusLabel = (stage: any) => {
    const key = String(stage?.key || '').trim()
    if (key === 'proposal_won') return 'ganho'
    if (key === 'proposal_lost') return 'perdido'
    return 'em aberto'
}

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message
    return String(error)
}

const buildCrmLeadBrainDocument = async (supabase: any, leadId: string) => {
    const { data: lead, error: leadError } = await supabase
        .from('crm_leads')
        .select(`
            id,
            name,
            company_name,
            whatsapp,
            email,
            address,
            notes,
            owner_user_id,
            stage_id,
            opened_at,
            closed_at,
            next_follow_up_at,
            last_interaction_at,
            source,
            lead_temperature,
            estimated_value,
            loss_reason,
            proposal_id,
            acceptance_id,
            created_at,
            updated_at,
            archived_at
        `)
        .eq('id', leadId)
        .maybeSingle()

    if (leadError) throw leadError
    if (!lead) return null

    const [
        activitiesResp,
        followupsResp,
        historyResp,
        proposalResp,
        acceptanceResp,
    ] = await Promise.all([
        supabase
            .from('crm_lead_activities')
            .select('id, activity_type, summary, content, created_by, created_at')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(8),
        supabase
            .from('crm_followups')
            .select('id, title, due_at, completed_at, status, owner_user_id, created_at')
            .eq('lead_id', leadId)
            .order('due_at', { ascending: true })
            .limit(20),
        supabase
            .from('crm_lead_stage_history')
            .select('id, from_stage_id, to_stage_id, moved_by, moved_at, note')
            .eq('lead_id', leadId)
            .order('moved_at', { ascending: false })
            .limit(8),
        lead.proposal_id
            ? supabase
                .from('proposals')
                .select('id, slug, company_name')
                .eq('id', lead.proposal_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        lead.acceptance_id
            ? supabase
                .from('acceptances')
                .select('id, company_name, company_alias')
                .eq('id', lead.acceptance_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
    ])

    if (activitiesResp.error) throw activitiesResp.error
    if (followupsResp.error) throw followupsResp.error
    if (historyResp.error) throw historyResp.error
    if (proposalResp.error) throw proposalResp.error
    if (acceptanceResp.error) throw acceptanceResp.error

    const activities = Array.isArray(activitiesResp.data) ? activitiesResp.data : []
    const followups = Array.isArray(followupsResp.data) ? followupsResp.data : []
    const history = Array.isArray(historyResp.data) ? historyResp.data : []
    const proposal = proposalResp.data || null
    const acceptance = acceptanceResp.data || null

    const userIds = Array.from(new Set([
        lead.owner_user_id,
        ...activities.map((activity: any) => activity.created_by),
        ...followups.map((followup: any) => followup.owner_user_id),
        ...history.map((entry: any) => entry.moved_by),
    ].filter(Boolean)))

    const stageIds = Array.from(new Set([
        lead.stage_id,
        ...history.flatMap((entry: any) => [entry.from_stage_id, entry.to_stage_id]),
    ].filter(Boolean)))

    const [usersResp, stagesResp] = await Promise.all([
        userIds.length > 0
            ? supabase
                .from('app_users')
                .select('id, full_name, name, email')
                .in('id', userIds)
            : Promise.resolve({ data: [], error: null }),
        stageIds.length > 0
            ? supabase
                .from('crm_pipeline_stages')
                .select('id, key, name, is_closed, position')
                .in('id', stageIds)
            : Promise.resolve({ data: [], error: null }),
    ])

    if (usersResp.error) throw usersResp.error
    if (stagesResp.error) throw stagesResp.error

    const usersById = new Map<string, any>((usersResp.data || []).map((user: any) => [String(user.id), user]))
    const stagesById = new Map<string, any>((stagesResp.data || []).map((stage: any) => [String(stage.id), stage]))
    const currentStage: any = stagesById.get(String(lead.stage_id)) || null
    const owner: any = usersById.get(String(lead.owner_user_id)) || null

    const pendingFollowups = followups.filter((followup: any) => followup.status === 'pending')
    const overdueFollowups = pendingFollowups.filter((followup: any) => new Date(followup.due_at) < new Date())

    const activityLines = activities.length > 0
        ? activities.map((activity: any) => {
            const actor = usersById.get(String(activity.created_by))
            return `- ${formatDateTimePt(activity.created_at)} | ${activity.activity_type} | ${activity.summary} | por ${getUserLabel(actor)}`
        }).join('\n')
        : '- Nenhuma atividade registrada.'

    const followupLines = followups.length > 0
        ? followups.slice(0, 8).map((followup: any) => {
            const followupOwner = usersById.get(String(followup.owner_user_id))
            const statusLabel =
                followup.status === 'completed'
                    ? 'concluido'
                    : followup.status === 'cancelled'
                        ? 'cancelado'
                        : new Date(followup.due_at) < new Date()
                            ? 'vencido'
                            : 'pendente'
            return `- ${formatDateTimePt(followup.due_at)} | ${statusLabel} | ${followup.title} | responsavel ${getUserLabel(followupOwner)}`
        }).join('\n')
        : '- Nenhum follow-up registrado.'

    const historyLines = history.length > 0
        ? history.map((entry: any) => {
            const fromStage: any = stagesById.get(String(entry.from_stage_id))
            const toStage: any = stagesById.get(String(entry.to_stage_id))
            return `- ${formatDateTimePt(entry.moved_at)} | ${fromStage?.name || 'Origem inicial'} -> ${toStage?.name || 'Estagio atual'}${entry.note ? ` | nota: ${entry.note}` : ''}`
        }).join('\n')
        : '- Nenhuma movimentacao registrada.'

    const acceptanceCompanyName = acceptance
        ? getDisplayCompanyName(acceptance)
        : 'n/a'

    const docContent = [
        `[CRM LEAD] ${lead.name}`,
        `Empresa: ${lead.company_name}`,
        `Estagio atual: ${currentStage?.name || 'Sem estagio'} (${String(currentStage?.key || 'n/a')})`,
        `Status do lead: ${getLeadStatusLabel(currentStage)}`,
        `Responsavel: ${getUserLabel(owner)}`,
        `Contato: WhatsApp=${lead.whatsapp || 'n/a'} | Email=${lead.email || 'n/a'}`,
        `Endereco: ${lead.address || 'n/a'}`,
        `Origem: ${lead.source || 'n/a'} | Temperatura: ${lead.lead_temperature || 'n/a'} | Valor estimado: ${formatCurrencyBr(lead.estimated_value)}`,
        `Abertura: ${formatDateTimePt(lead.opened_at)} | Fechamento: ${formatDateTimePt(lead.closed_at)} | Proximo follow-up: ${formatDateTimePt(lead.next_follow_up_at)} | Ultima interacao: ${formatDateTimePt(lead.last_interaction_at)}`,
        `Proposta vinculada: ${proposal ? `#${proposal.id} - ${proposal.company_name}` : 'n/a'}`,
        `Cliente vinculado: ${acceptance ? `#${acceptance.id} - ${acceptanceCompanyName}` : 'n/a'}`,
        `Follow-ups pendentes: ${pendingFollowups.length} | vencidos: ${overdueFollowups.length}`,
        `Observacoes: ${lead.notes || 'Nenhuma observacao registrada.'}`,
        lead.loss_reason ? `Motivo de perda: ${lead.loss_reason}` : '',
        '',
        'Ultimas atividades:',
        activityLines,
        '',
        'Follow-ups:',
        followupLines,
        '',
        'Historico de estagio:',
        historyLines,
    ].filter(Boolean).join('\n')

    const docMetadata = {
        type: 'official_doc',
        artifact_kind: 'crm_lead',
        title: `CRM Lead: ${lead.name} - ${lead.company_name}`,
        source_table: 'crm_leads',
        source_id: lead.id,
        source: 'crm_live_record',
        tenant_id: 'c4_corporate_identity',
        status: lead.archived_at ? 'archived' : 'active',
        is_current: true,
        searchable: true,
        authority_type: 'memo',
        authority_rank: 70,
        effective_from: lead.updated_at || lead.created_at || new Date().toISOString(),
        crm_entity: 'lead',
        crm_stage_key: currentStage?.key || null,
        crm_stage_name: currentStage?.name || null,
        crm_owner_name: getUserLabel(owner),
        crm_followups_pending: pendingFollowups.length,
        crm_followups_overdue: overdueFollowups.length,
        proposal_id: lead.proposal_id ?? null,
        acceptance_id: lead.acceptance_id ?? null,
        lead_name: lead.name,
        company_name: lead.company_name,
        lead_source: lead.source || null,
        lead_temperature: lead.lead_temperature || null,
        opened_at: lead.opened_at || null,
        closed_at: lead.closed_at || null,
        next_follow_up_at: lead.next_follow_up_at || null,
        last_interaction_at: lead.last_interaction_at || null,
        updated_at: lead.updated_at || null,
        search_terms: [
            lead.name,
            lead.company_name,
            lead.whatsapp,
            lead.email,
            owner?.email,
            proposal?.company_name,
            acceptanceCompanyName !== 'n/a' ? acceptanceCompanyName : null,
        ].filter(Boolean).join(' | '),
    }

    return { docContent, docMetadata }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS })
    }

    try {
        // Client for public schema (RPC calls + reading project tables)
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        })

        // 1. Buscar itens pendentes via RPC (evita acessar schema brain diretamente)
        const { data: pendingItems, error: fetchError } = await supabase
            .rpc('get_pending_sync_items', { p_limit: 10 })

        if (fetchError) throw fetchError
        if (!pendingItems || pendingItems.length === 0) {
            return new Response(JSON.stringify({ message: 'Nenhum item pendente' }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            })
        }

        const results = []

        const upsertVersionedBrainDocument = async (
            docContent: string,
            docMetadata: Record<string, any>,
            embedding: number[]
        ) => {
            const normalizedMetadata = {
                ...docMetadata,
                document_key: docMetadata?.document_key || `${docMetadata?.source_table || 'unknown'}:${docMetadata?.source_id || 'unknown'}`,
                authority_type: docMetadata?.authority_type || 'policy',
                authority_rank: typeof docMetadata?.authority_rank === 'number' ? docMetadata.authority_rank : 100,
                is_current: docMetadata?.is_current ?? true,
                searchable: docMetadata?.searchable ?? true,
                effective_from: docMetadata?.effective_from || new Date().toISOString(),
            }

            const { error: publishError } = await supabase.rpc('publish_brain_document_version', {
                p_content: docContent,
                p_metadata: normalizedMetadata,
                p_embedding: embedding,
                p_replace_current: true,
            })

            if (!publishError) return

            const publishMsg = String(publishError?.message || '')
            const publishMissing =
                /publish_brain_document_version/i.test(publishMsg) &&
                /(does not exist|not found|function)/i.test(publishMsg)

            if (!publishMissing) throw publishError

            console.warn('publish_brain_document_version indisponível, fallback para insert_brain_document')
            const { error: insertError } = await supabase.rpc('insert_brain_document', {
                content: docContent,
                metadata: normalizedMetadata,
                embedding: embedding
            })
            if (insertError) throw insertError
        }

        // 2. Processar cada item
        for (const item of pendingItems) {
            try {
                // Marcar como processando
                await supabase.rpc('update_sync_item_status', {
                    p_id: item.id,
                    p_status: 'processing'
                })

                let docContent = ''
                let docMetadata: any = {}
                const shouldDelete = item.operation === 'DELETE'

                if (!shouldDelete) {
                    // === WEBSITE PROJECTS ===
                    if (item.source_table === 'website_projects') {
                        const { data: proj, error: pErr } = await supabase
                            .from('website_projects')
                            .select(`*, acceptances ( company_name, company_alias ), websites ( * )`)
                            .eq('id', item.source_id)
                            .single()
                        if (pErr) throw pErr

                        const companyName = getDisplayCompanyName(proj.acceptances)
                        docContent = `[PROJETO WEB] Site: ${companyName}\n`
                        docContent += `Status: ${proj.account_setup_status}\n`
                        if (proj.websites && proj.websites.length > 0) {
                            const web = proj.websites[0]
                            docContent += `Etapa Atual: ${web.status}\n`
                            docContent += `Nome do Site: ${web.name}\n`
                        }
                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'project',
                            title: `Projeto Site: ${companyName}`,
                            source_table: 'website_projects',
                            source_id: item.source_id,
                            status: 'active',
                            authority_type: 'policy',
                        }

                        // === LANDING PAGE PROJECTS ===
                    } else if (item.source_table === 'landing_page_projects') {
                        const { data: proj, error: pErr } = await supabase
                            .from('landing_page_projects')
                            .select(`*, acceptances ( company_name, company_alias ), landing_pages ( * )`)
                            .eq('id', item.source_id)
                            .single()
                        if (pErr) throw pErr

                        const companyName = getDisplayCompanyName(proj.acceptances)
                        docContent = `[PROJETO LP] Landing Page: ${companyName}\n`
                        docContent += `Status Survey: ${proj.survey_status}\n`
                        if (proj.landing_pages && proj.landing_pages.length > 0) {
                            const lp = proj.landing_pages[0]
                            docContent += `Etapa Criativa: ${lp.status}\n`
                            docContent += `Nome: ${lp.name}\n`
                        }
                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'project',
                            title: `Projeto LP: ${companyName}`,
                            source_table: 'landing_page_projects',
                            source_id: item.source_id,
                            status: 'active',
                            authority_type: 'policy',
                        }

                        // === TRAFFIC PROJECTS ===
                    } else if (item.source_table === 'traffic_projects') {
                        const { data: proj, error: pErr } = await supabase
                            .from('traffic_projects')
                            .select(`*, acceptances ( company_name, company_alias ), traffic_campaigns ( * )`)
                            .eq('id', item.source_id)
                            .single()
                        if (pErr) throw pErr

                        const clientName = getDisplayCompanyName(proj.acceptances)
                        docContent = `[PROJETO TRÁFEGO] Gestão de Tráfego: ${clientName}\n`
                        docContent += `Status Survey: ${proj.survey_status}\n`
                        docContent += `Status Setup: ${proj.account_setup_status}\n`
                        if (proj.traffic_campaigns && proj.traffic_campaigns.length > 0) {
                            docContent += `Campanhas Ativas:\n`
                            for (const camp of proj.traffic_campaigns) {
                                docContent += `- [${camp.platform}] ${camp.name || 'Sem nome'} (${camp.status})\n`
                            }
                        }
                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'project',
                            title: `Projeto Tráfego: ${clientName}`,
                            source_table: 'traffic_projects',
                            source_id: item.source_id,
                            status: 'active',
                            authority_type: 'policy',
                        }

                    } else if (item.source_table === 'crm_leads') {
                        const crmDoc = await buildCrmLeadBrainDocument(supabase, item.source_id)
                        if (!crmDoc) {
                            throw new Error(`Lead do CRM ${item.source_id} não encontrado para sincronização`)
                        }

                        docContent = crmDoc.docContent
                        docMetadata = crmDoc.docMetadata

                    } else {
                        throw new Error(`Processador para ${item.source_table} não implementado`)
                    }
                }

                if (shouldDelete) {
                    // Para DELETE, usamos o insert_brain_document que faz dedup
                    // (ele deleta registros com mesmo source_id antes de inserir)
                    // Neste caso, só precisamos deletar. Vamos usar um RPC dedicado se existir.
                    // Por enquanto, marcamos como concluído.
                    console.log(`DELETE para ${item.source_table}/${item.source_id} - ignorado por enquanto`)
                } else {
                    // Gerar Embedding
                    const embeddingResponse = await openai.embeddings.create({
                        model: 'text-embedding-3-small',
                        input: docContent,
                    })
                    const embedding = embeddingResponse.data[0].embedding

                    await upsertVersionedBrainDocument(docContent, docMetadata, embedding)
                }

                // Marcar como concluído
                await supabase.rpc('update_sync_item_status', {
                    p_id: item.id,
                    p_status: 'completed'
                })
                results.push({ id: item.id, status: 'completed' })

            } catch (err) {
                const errorMessage = getErrorMessage(err)
                console.error(`Erro processando item ${item.id}:`, err)
                await supabase.rpc('update_sync_item_status', {
                    p_id: item.id,
                    p_status: 'failed',
                    p_error_message: errorMessage
                })
                results.push({ id: item.id, status: 'failed', error: errorMessage })
            }
        }

        return new Response(JSON.stringify({ processed: results }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        const errorMessage = getErrorMessage(error)
        console.error("Erro fatal no brain-sync:", error)
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
    }
})
