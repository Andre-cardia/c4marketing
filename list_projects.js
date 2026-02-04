
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function listAll() {
    const { data, error } = await supabase
        .from('traffic_projects')
        .select('id, acceptance_id, survey_status');

    console.log('All Projects:', JSON.stringify(data, null, 2));
    if (error) console.error('Error:', error);
}

listAll();
