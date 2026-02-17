
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
    console.log('Checking brain.documents for "Amplexo"...');

    // We cannot query 'brain.documents' directly with anon key if RLS is strict/schema not exposed
    // But let's try via the public RPC function 'match_brain_documents' if possible, 
    // or just try to select if we have permissions.

    // Actually, we can't easily query the 'brain' schema from the client unless we exposed it.
    // BUT, we defined 'match_brain_documents' in PUBLIC schema in the migration 20240216000001_fix_brain_access.sql
    // So we can try to call that, but we need an embedding.

    // Alternatively, let's try to query the source tables to ensure the source data exists.
    const { data: sourceData, error: sourceError } = await supabase
        .from('acceptances')
        .select('*')
        .ilike('company_name', '%Amplexo%');

    console.log('Source Data (Acceptances):', sourceData);
    if (sourceError) console.error(sourceError);

    // Let's try to list documents via a direct query if the policy allows. 
    // Usually brain schema is hidden. 
    // We'll rely on the source data verification first.
}

checkBrain();
