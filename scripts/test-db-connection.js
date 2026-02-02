
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('Testing connection to:', supabaseUrl);

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    console.log('Attempting to fetch LATEST 5 proposals (public access check)...');

    const { data, error } = await supabase
        .from('proposals')
        .select('id, slug, company_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching proposals:', error);
    } else {
        console.log('Successfully fetched proposals:');
        if (data.length === 0) {
            console.log('No proposals found.');
        } else {
            console.table(data);
            console.log('Latest proposal slug:', data[0]?.slug);
        }
    }
}

testConnection();
