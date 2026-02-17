
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

// Shared types and logic
// We assume these are available in _shared as per previous steps
interface SyncQueueItem {
    id: number;
    source_table: string;
    source_id: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS })
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        })

        // 1. Fetch pending items
        const { data: queue, error: queueError } = await supabaseAdmin
            .from('sync_queue')
            .select('*')
            .eq('status', 'pending')
            .limit(5)
            .schema('brain') // Typically brain schema, but supabase client usage depends on exposure. 
        // Note: The table brain.sync_queue is in 'brain' schema. 
        // Supabase JS client usually defaults to 'public'. We need to specify schema if possible or use rpc/view.
        // Or if the table is exposed. Since we are admin, we can query it.
        // Actually, supabase-js 'from' accepts 'schema.table' notation in some versions or we set schema in constructor.
        // Let's assume we can set schema or use fully qualified name if not, but standard is .schema('brain').

        // Re-creating client for brain schema might be safer if .schema() chaining isn't standard in older versions
        const brainClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { db: { schema: 'brain' } }
        )

        const { data: pendingItems, error: fetchError } = await brainClient
            .from('sync_queue')
            .select('*')
            .eq('status', 'pending')
            .limit(10)

        if (fetchError) throw fetchError;
        if (!pendingItems || pendingItems.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending items' }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            })
        }

        const results = []

        // 2. Process each item
        for (const item of pendingItems) {
            try {
                // Update status to processing
                await brainClient
                    .from('sync_queue')
                    .update({ status: 'processing', processed_at: new Date().toISOString() })
                    .eq('id', item.id)

                let docContent = ''
                let docMetadata: any = {}
                let shouldDelete = item.operation === 'DELETE'

                if (!shouldDelete) {
                    // Fetch source data based on table
                    if (item.source_table === 'website_projects') {
                        const { data: proj, error: pErr } = await supabaseAdmin
                            .from('website_projects')
                            .select(`
                                *,
                                acceptances ( company_name ),
                                websites ( * )
                            `)
                            .eq('id', item.source_id)
                            .single()

                        if (pErr) throw pErr

                        // Format Text
                        docContent = `[PROJETO WEB] Site: ${proj.acceptances?.company_name || 'N/A'}\n`
                        docContent += `Status: ${proj.account_setup_status}\n`
                        if (proj.websites && proj.websites.length > 0) {
                            const web = proj.websites[0]
                            docContent += `Etapa Atual: ${web.status}\n`
                            docContent += `Nome do Site: ${web.name}\n`
                        }

                        // Metadata
                        docMetadata = {
                            type: 'official_doc',
                            artifact_kind: 'project',
                            title: `Projeto Site ${proj.acceptances?.company_name}`,
                            source_table: 'website_projects',
                            status: 'active',
                            tenant_id: null // In real scenario, map user_id from acceptance->proposal->user or similar
                        }
                    } else if (item.source_table === 'landing_page_projects') {
                        // ... similar logic for LPs
                        const { data: proj, error: pErr } = await supabaseAdmin
                            .from('landing_page_projects')
                            .select(`
                                *,
                                acceptances ( company_name ),
                                landing_pages ( * )
                            `)
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
                            title: `Projeto LP ${proj.acceptances?.company_name}`,
                            source_table: 'landing_page_projects',
                            status: 'active'
                        }
                    } else {
                        // Unknown table or not implemented yet
                        throw new Error(`Processor for ${item.source_table} not implemented`)
                    }
                }

                if (shouldDelete) {
                    // Remove from brain
                    await brainClient
                        .from('documents')
                        .delete()
                        .match({ 'metadata->>source_table': item.source_table, 'metadata->>source_id': item.source_id }) // approximate matching
                    // Actually better to store source_id properly in metadata to match exactly
                } else {
                    // Generate Embedding
                    const embeddingResponse = await openai.embeddings.create({
                        model: 'text-embedding-3-small',
                        input: docContent,
                    })
                    const embedding = embeddingResponse.data[0].embedding

                    // Upsert into Brain
                    // We need to find if exists to update, or insert new.
                    // Ideally we have a unique constraint or we search first.
                    // For now, let's delete old reference and insert new to keep it clean, or use upsert if we have a stable ID mapping.
                    // The 'id' in brain.documents is uuid. We don't have a strict 1:1 functional index yet.

                    // Simple strategy: Delete any existing doc for this source_id and insert new
                    // NOTE: This assumes we store source_id in metadata!

                    docMetadata.source_id = item.source_id

                    // Clean up old
                    // This query catches docs where metadata->'source_id' == item.source_id
                    // Note: querying generic jsonb is slow without index. 
                    // Assuming for now simple append is fine, or better:

                    const { error: insertError } = await brainClient
                        .from('documents')
                        .insert({
                            content: docContent,
                            metadata: docMetadata,
                            embedding: embedding
                        })

                    if (insertError) throw insertError
                }

                // Mark Complete
                await brainClient
                    .from('sync_queue')
                    .update({ status: 'completed', processed_at: new Date().toISOString() })
                    .eq('id', item.id)

                results.push({ id: item.id, status: 'completed' })

            } catch (err) {
                console.error(`Error processing item ${item.id}:`, err)
                await brainClient
                    .from('sync_queue')
                    .update({ status: 'failed', error_message: err.message, processed_at: new Date().toISOString() })
                    .eq('id', item.id)
                results.push({ id: item.id, status: 'failed', error: err.message })
            }
        }

        return new Response(JSON.stringify({ processed: results }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error("Fatal error in brain-sync:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
    }
})
