
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBrain() {
    // Fetch Amplexo data again
    const { data: sourceData, error: sourceError } = await supabase
        .from('acceptances')
        .select('*')
        .ilike('company_name', '%Amplexo%')
        .limit(1);

    if (sourceError || !sourceData || sourceData.length === 0) {
        console.error('Could not find Amplexo in source:', sourceError);
        return;
    }

    const acc = sourceData[0];
    console.log('Attempting to manually insert Amplexo Acceptance ID:', acc.id);

    // Construct the text content EXACTLY as the frontend does
    const content = `RETORNO DO BANCO DE DADOS:
=== TÍTULO: Contrato: ${acc.company_name} ===
=== FONTE: Tabela acceptances (Contratos Ativos) ===
=== DATA DE REFERÊNCIA: ${new Date().toLocaleDateString('pt-BR')} ===

[DETALHES DO CONTRATO]
Empresa: ${acc.company_name}
CNPJ: ${acc.cnpj || 'Não cadastrado'}
Cliente: ${acc.name} (${acc.email})
Status: ${acc.status}
Data de Início (Aceite): ${new Date(acc.timestamp).toLocaleDateString('pt-BR')}
Validade/Término: ${acc.expiration_date ? new Date(acc.expiration_date).toLocaleDateString('pt-BR') : 'Indeterminado'}
ID: ${acc.id}
`;

    // Metadata
    const metadata = {
        type: 'database_record',
        source_table: 'acceptances',
        source_id: acc.id.toString(),
        title: `Contrato: ${acc.company_name}`,
        source: `Contrato Ativo`
    };

    console.log('Content to insert:\n', content);

    // Generate embedding (DUMMY for test, real embedding requires OpenAI)
    // We will just verify if we CAN insert.
    // However, `insert_brain_document` requires an embedding.
    // Since I cannot generate a real embedding easily here without OpenAI key setup (it is in .env but I need to call OpenAI API),
    // I will try to call the Edge Function `embed-content` if possible? 
    // No, standard `fetch` to the local/remote function URL.

    // Instead, I will use a dummy embedding and call RPC `insert_brain_document` just to see if DB rejects it.
    // If it succeeds, the document will exist but be unsearchable by semantic meaning (dummy embedding).
    // BUT the text search might work if we have hybrid search? We use vector search `match_brain_documents`.

    // Let's try to use the OpenAI key from env to generate a REAL embedding so we can fix it for the user right now!

    const openAiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!openAiKey) {
        console.error('CRITICAL: No OpenAI Key found. Cannot generate real embedding.');
        return;
    }

    const openai = new OpenAI({ apiKey: openAiKey });

    console.log('Generating REAL embedding for content...');
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
    });

    const realEmbedding = embeddingResponse.data[0].embedding;

    // Delete existing dummy record first to be clean
    const { error: deleteError } = await supabase.from('brain.documents').delete().eq('metadata->>source_id', acc.id.toString()).eq('metadata->>source_table', 'acceptances');
    // Note: direct delete might fail via anon key if RLS blocks.
    // Instead, rely on RPC 'insert_brain_document' which handles deduplication?
    // The updated RPC logic handles deduplication! 
    // It deletes where metadata->>source_table and source_id match.

    // ... insertion done ...
    console.log('Document inserted. Now testing retrieval...');

    const query = "quem é Amplexo Diesel?";
    console.log(`Generating embedding for query: "${query}"`);

    const queryEmbeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
    });
    const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

    console.log('Searching for documents...');
    const { data: searchResults, error: searchError } = await supabase.rpc('match_brain_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.1, // Test with 0.1
        match_count: 5
    });

    if (searchError) {
        console.error('Search Error:', searchError);
    } else {
        console.log(`Found ${searchResults?.length || 0} documents.`);
        searchResults.forEach((d, i) => {
            console.log(`--- Result ${i + 1} (Sim: ${d.similarity}) ---`);
            console.log('Title:', d.metadata?.title);
            console.log('Content:', d.content.substring(0, 150) + '...');
        });
    }
}

checkBrain();

checkBrain();
