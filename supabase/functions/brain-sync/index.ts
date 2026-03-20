
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
                            .select(`*, acceptances ( company_name ), websites ( * )`)
                            .eq('id', item.source_id)
                            .single()
                        if (pErr) throw pErr

                        docContent = `[PROJETO WEB] Site: ${proj.acceptances?.company_name || 'N/A'}\n`
                        docContent += `Status: ${proj.account_setup_status}\n`
                        if (proj.websites && proj.websites.length > 0) {
                            const web = proj.websites[0]
                            docContent += `Etapa Atual: ${web.status}\n`
                            docContent += `Nome do Site: ${web.name}\n`
                        }
                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'project',
                            title: `Projeto Site: ${proj.acceptances?.company_name || 'N/A'}`,
                            source_table: 'website_projects',
                            source_id: item.source_id,
                            status: 'active',
                            authority_type: 'policy',
                        }

                        // === LANDING PAGE PROJECTS ===
                    } else if (item.source_table === 'landing_page_projects') {
                        const { data: proj, error: pErr } = await supabase
                            .from('landing_page_projects')
                            .select(`*, acceptances ( company_name ), landing_pages ( * )`)
                            .eq('id', item.source_id)
                            .single()
                        if (pErr) throw pErr

                        docContent = `[PROJETO LP] Landing Page: ${proj.acceptances?.company_name || 'N/A'}\n`
                        docContent += `Status Survey: ${proj.survey_status}\n`
                        if (proj.landing_pages && proj.landing_pages.length > 0) {
                            const lp = proj.landing_pages[0]
                            docContent += `Etapa Criativa: ${lp.status}\n`
                            docContent += `Nome: ${lp.name}\n`
                        }
                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'project',
                            title: `Projeto LP: ${proj.acceptances?.company_name || 'N/A'}`,
                            source_table: 'landing_page_projects',
                            source_id: item.source_id,
                            status: 'active',
                            authority_type: 'policy',
                        }

                        // === TRAFFIC PROJECTS ===
                    } else if (item.source_table === 'traffic_projects') {
                        const { data: proj, error: pErr } = await supabase
                            .from('traffic_projects')
                            .select(`*, acceptances ( company_name ), traffic_campaigns ( * )`)
                            .eq('id', item.source_id)
                            .single()
                        if (pErr) throw pErr

                        const clientName = proj.acceptances?.company_name || 'N/A'
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
                console.error(`Erro processando item ${item.id}:`, err)
                await supabase.rpc('update_sync_item_status', {
                    p_id: item.id,
                    p_status: 'failed',
                    p_error_message: err.message
                })
                results.push({ id: item.id, status: 'failed', error: err.message })
            }
        }

        // 3. Processar fila commercial (proposals + acceptances)
        const { data: commercialItems } = await supabase
            .rpc('get_pending_commercial_sync_items', { p_limit: 10 })

        const commercialResults = []
        for (const item of (commercialItems || [])) {
            try {
                let docContent = ''
                let docMetadata: any = {}
                const shouldDelete = item.operation === 'DELETE'

                if (!shouldDelete) {
                    // === PROPOSALS ===
                    if (item.source_table === 'proposals') {
                        const { data: prop, error: pErr } = await supabase
                            .from('proposals')
                            .select(`*, acceptances ( id, name, company_name, email, status, timestamp, expiration_date )`)
                            .eq('id', parseInt(item.source_id, 10))
                            .maybeSingle()
                        if (pErr) throw pErr
                        if (!prop) throw new Error(`Proposta ${item.source_id} não encontrada`)

                        const acceptance = Array.isArray(prop.acceptances) ? prop.acceptances[0] : prop.acceptances
                        const isAccepted = !!acceptance
                        const clientName = acceptance?.company_name || prop.company_name || 'N/A'

                        docContent = `[PROPOSTA] Empresa: ${clientName}\n`
                        docContent += `Responsável: ${prop.responsible_name || 'N/A'}\n`
                        docContent += `Status: ${isAccepted ? 'Aceita' : 'Em aberto'}\n`
                        docContent += `Mensalidade: R$${prop.monthly_fee || 0}\n`
                        docContent += `Setup: R$${prop.setup_fee || 0}\n`
                        if (prop.media_limit) docContent += `Limite Mídia: R$${prop.media_limit}\n`
                        if (prop.contract_duration) docContent += `Duração: ${prop.contract_duration} meses\n`
                        if (prop.services) docContent += `Serviços: ${typeof prop.services === 'string' ? prop.services : JSON.stringify(prop.services)}\n`
                        if (isAccepted && acceptance) {
                            docContent += `Data do Aceite: ${acceptance.timestamp ? new Date(acceptance.timestamp).toLocaleDateString('pt-BR') : 'N/A'}\n`
                            if (acceptance.expiration_date) docContent += `Validade: ${acceptance.expiration_date}\n`
                            docContent += `Status do Contrato: ${acceptance.status || 'N/A'}\n`
                        }

                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: isAccepted ? 'contract' : 'proposal',
                            title: isAccepted ? `Contrato: ${clientName}` : `Proposta: ${clientName}`,
                            source_table: 'proposals',
                            source_id: item.source_id,
                            status: prop.status || 'active',
                            authority_type: 'policy',
                            authority_rank: isAccepted ? 10 : 50, // contratos têm rank mais alto
                        }

                    // === ACCEPTANCES (CONTRATOS) ===
                    } else if (item.source_table === 'acceptances') {
                        const { data: acc, error: aErr } = await supabase
                            .from('acceptances')
                            .select(`
                                *,
                                proposals ( id, slug, monthly_fee, setup_fee, media_limit, contract_duration, services ),
                                traffic_projects ( id, survey_status, account_setup_status ),
                                website_projects ( id, survey_status, account_setup_status ),
                                landing_page_projects ( id, survey_status, account_setup_status )
                            `)
                            .eq('id', item.source_id)
                            .maybeSingle()
                        if (aErr) throw aErr
                        if (!acc) throw new Error(`Aceite ${item.source_id} não encontrado`)

                        const prop = acc.proposals
                        const services: string[] = []
                        if (acc.traffic_projects?.length > 0) services.push('Gestão de Tráfego')
                        if (acc.website_projects?.length > 0) services.push('Criação de Site')
                        if (acc.landing_page_projects?.length > 0) services.push('Landing Page')

                        docContent = `[CONTRATO] Empresa: ${acc.company_name || 'N/A'}\n`
                        docContent += `Cliente: ${acc.name || 'N/A'}\n`
                        docContent += `Email: ${acc.email || 'N/A'}\n`
                        docContent += `Status do Contrato: ${acc.status || 'N/A'}\n`
                        docContent += `Data de Assinatura: ${acc.timestamp ? new Date(acc.timestamp).toLocaleDateString('pt-BR') : 'N/A'}\n`
                        if (acc.expiration_date) docContent += `Validade: ${acc.expiration_date}\n`
                        if (services.length > 0) docContent += `Serviços Contratados: ${services.join(', ')}\n`
                        if (prop) {
                            docContent += `Mensalidade: R$${prop.monthly_fee || 0}\n`
                            docContent += `Setup: R$${prop.setup_fee || 0}\n`
                            if (prop.media_limit) docContent += `Limite Mídia: R$${prop.media_limit}\n`
                            if (prop.contract_duration) docContent += `Duração: ${prop.contract_duration} meses\n`
                        }

                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'contract',
                            title: `Contrato: ${acc.company_name || 'N/A'}`,
                            source_table: 'acceptances',
                            source_id: item.source_id,
                            status: acc.status || 'Ativo',
                            authority_type: 'policy',
                            authority_rank: 10, // contratos têm máxima autoridade
                        }
                    } else {
                        throw new Error(`Processador commercial para ${item.source_table} não implementado`)
                    }
                }

                if (shouldDelete) {
                    console.log(`DELETE commercial ${item.source_table}/${item.source_id} - ignorado por enquanto`)
                } else {
                    const embeddingResponse = await openai.embeddings.create({
                        model: 'text-embedding-3-small',
                        input: docContent,
                    })
                    const embedding = embeddingResponse.data[0].embedding
                    await upsertVersionedBrainDocument(docContent, docMetadata, embedding)
                }

                await supabase.rpc('update_commercial_sync_item_status', {
                    p_id: item.id,
                    p_status: 'completed'
                })
                commercialResults.push({ id: item.id, status: 'completed', table: item.source_table })

            } catch (err) {
                console.error(`Erro processando item commercial ${item.id}:`, err)
                await supabase.rpc('update_commercial_sync_item_status', {
                    p_id: item.id,
                    p_status: 'failed',
                    p_error_message: err.message
                })
                commercialResults.push({ id: item.id, status: 'failed', error: err.message })
            }
        }

        return new Response(JSON.stringify({ processed: results, commercial: commercialResults }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error("Erro fatal no brain-sync:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
    }
})
