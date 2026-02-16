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
        const { query } = await req.json()

        if (!query) {
            throw new Error('Query is required')
        }

        const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        })

        // 1. Generate embedding for the query
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: query,
        })

        const queryEmbedding = embeddingResponse.data[0].embedding

        // 2. Search for similar documents in 'brain' schema
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Call the RPC function which is inside the 'brain' schema
        // Note: RPC calls are usually unaware of schema unless the function is in public or explicitly called.
        // However, the function `brain.match_documents` is in `brain`. 
        // Supabase client `rpc` method calls functions in the `public` schema by default OR matching the exposed schema.
        // If the function is in `brain`, we might need to expose `brain` schema or call it differently.
        // A robust way in Edge Functions is to use SQL/PG via postgres.js or valid RPC if exposed.
        // But `supabase-js` `rpc` usually defaults to looking in the schema defined in the client options or `public`.
        // Let's try calling it. If `brain.match_documents` is the name, we might simply pass the name `match_documents` if we switch schema, or `brain.match_documents`?
        // Actually, `supabase-js` `rpc` takes the function name.
        // If the function is defined as `brain.match_documents`, we might have issues calling it directly if `brain` is not in the search path.
        // WORKAROUND: We can use `.rpc('match_documents', ...)` but we need to ensure the client is configured to see it,
        // OR we change the function to be in `public` but accessing `brain` tables (which breaks isolation slightly but is easier), 
        // OR we just assume `supabase-js` can call namespaced functions? No, it usually can't.
        // BETTER APPROACH: Since we are in an Edge Function using Service Role, we can use the `rpc` call but we might need to specify the schema `brain` when creating the client?
        // Let's configure the client with `db: { schema: 'brain' }`.

        const brainClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { db: { schema: 'brain' } } // This sets the search path/schema context
        )

        const { data: documents, error: searchError } = await brainClient
            .rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.5, // Adjust similarity threshold
                match_count: 5 // Retrieve top 5 chunks
            })

        if (searchError) {
            throw searchError
        }

        // 3. Construct prompt for LLM
        const contextText = documents?.map(d => `${d.content} (Source: ${JSON.stringify(d.metadata)})`).join('\n---\n') || 'No context found.'

        const systemPrompt = `Você é o "Segundo Cérebro" corporativo. Use o contexto abaixo para responder à pergunta do usuário.
    Se a resposta não estiver no contexto, diga que não sabe, mas tente ser útil com o que tem.
    Sempre responda em Português do Brasil.
    
    Contexto:
    ${contextText}`

        // 4. Generate answer with GPT-4o
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            model: 'gpt-4o',
            temperature: 0.1,
        })

        const answer = chatCompletion.choices[0].message.content

        return new Response(JSON.stringify({ answer, documents }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
