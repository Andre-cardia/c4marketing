import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAppUsers() {
    console.log('Fetching app_users schema via options/select...');

    // Fetch some rows to see what it looks like
    const { data, error } = await supabase.from('app_users').select('*').limit(3);

    if (error) {
        console.error('Error fetching app_users:', error);
    } else {
        console.log('Data:', data);
    }

}

checkAppUsers();
