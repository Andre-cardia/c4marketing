
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const openAiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openAiKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openAiKey });

async function checkBrain() {
    console.log('Testing retrieval for Amplexo...');

    const query = "Qual a data de início de contrato da empresa Amplexo Diesel?";
    console.log(`Generating embedding for query: "${query}"`);

    const queryEmbeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
    });
    const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

    console.log('Searching for documents (Top 10)...');
    const { data: searchResults, error: searchError } = await supabase.rpc('match_brain_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: 10
    });

    if (searchError) {
        console.error('Search Error:', searchError);
    } else {
        console.log(`Found ${searchResults?.length || 0} documents.`);
        searchResults.forEach((d, i) => {
            console.log(`--- Result ${i + 1} (Sim: ${d.similarity}) ---`);
            console.log('ID:', d.id);
            console.log('Title:', d.metadata?.title); // Title is usually undefined for chat logs
            console.log('Source:', d.metadata?.source);
            console.log('Content Preview:', d.content.substring(0, 100).replace(/\n/g, ' '));
        });
    }
}

checkBrain();
