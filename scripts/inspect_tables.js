
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
    console.log('--- Listing Tables ---');
    // Using a query to valid table existence via error message or success of a known table
    const { data, error } = await supabase
        .from('traffic_projects')
        .select('count', { count: 'exact', head: true });

    if (error) {
        console.error('Error accessing traffic_projects:', error);
    } else {
        console.log('traffic_projects is accessible.');
    }
}

inspect();
