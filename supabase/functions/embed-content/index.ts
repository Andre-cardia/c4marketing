import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from 'https://esm.sh/openai@4'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { content, metadata } = await req.json()

        if (!content) {
            throw new Error('Content is required')
        }

        const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        })

        // Generate embedding
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: content,
        })

        const embedding = embeddingResponse.data[0].embedding

        // Initialize Supabase Client
        // We use the service role key to bypass RLS if necessary, but here we just need access to the 'brain' schema.
        // However, the `brain` schema table permissions were granted to `service_role`.
        // It's safer to use the Service Role key for this backend operation to ensure we can write to the isolated schema.
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const isTruthyFlag = (value: string | null | undefined) =>
            ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase().trim())

        const versionedPublishEnabled = isTruthyFlag(
            Deno.env.get('BRAIN_VERSIONED_PUBLISH_ENABLED')
        )

        const normalizedMetadata = {
            ...(metadata || {}),
            effective_from: metadata?.effective_from || new Date().toISOString(),
        }

        let error: any = null

        if (versionedPublishEnabled) {
            const publish = await supabaseClient.rpc('publish_brain_document_version', {
                p_content: content,
                p_metadata: normalizedMetadata,
                p_embedding: embedding,
                p_replace_current: true,
            })
            error = publish.error

            if (error) {
                const msg = String(error?.message || '')
                const publishMissing =
                    /publish_brain_document_version/i.test(msg) &&
                    /(does not exist|not found|function)/i.test(msg)

                if (publishMissing) {
                    const fallback = await supabaseClient.rpc('insert_brain_document', {
                        content,
                        metadata: normalizedMetadata,
                        embedding,
                    })
                    error = fallback.error
                }
            }
        } else {
            const inserted = await supabaseClient.rpc('insert_brain_document', {
                content,
                metadata: normalizedMetadata,
                embedding,
            })
            error = inserted.error
        }

        if (error) {
            console.error('Supabase error:', error)
            throw error
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
