
import { createClient } from '@supabase/supabase-js';
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

    const openAiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY; // Verify env var name
    if (!openAiKey) {
        console.warn('No OpenAI Key found in env, using dummy embedding. Retrieval wont work for semantic search.');
    } else {
        console.log('Found OpenAI Key, generating real embedding...');
    }

    // Call RPC
    const dummyEmbedding = Array(1536).fill(0.01);

    const { error: insertError } = await supabase.rpc('insert_brain_document', {
        content: content,
        metadata: metadata,
        embedding: dummyEmbedding // We use dummy for now to test DB insertion
    });

    if (insertError) {
        console.error('Insert Error:', insertError);
    } else {
        console.log('Successfully inserted Amplexo document (with dummy embedding).');
    }
}

checkBrain();
