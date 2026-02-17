
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
                            status: 'active'
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
                            status: 'active'
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
                            status: 'active'
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

                    // Inserir no Brain via RPC (com dedup automática)
                    const { error: insertError } = await supabase
                        .rpc('insert_brain_document', {
                            content: docContent,
                            metadata: docMetadata,
                            embedding: embedding
                        })

                    if (insertError) throw insertError
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

        return new Response(JSON.stringify({ processed: results }), {
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
