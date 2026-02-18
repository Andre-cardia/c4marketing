
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('--- Checking traffic_projects ---');
    const { data, error } = await supabase
        .from('traffic_projects')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error details:', JSON.stringify(error, null, 2));
    } else {
        console.log('Success. Row count:', data.length);
    }
}

inspect();
