
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
    console.log('--- Inspecting Acceptances ---');
    const { data, error } = await supabase
        .from('acceptances')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('Sample Row:', data[0]);

        // Now try to find the latest based on ID (assuming auto-increment or serial)
        // or a timestamp column if we found one.
        const cols = Object.keys(data[0]);
        const timeCol = cols.find(c => c.includes('created') || c.includes('date') || c.includes('time')) || 'id';
        console.log(`Using sort column: ${timeCol}`);

        const { data: latest, error: latError } = await supabase
            .from('acceptances')
            .select('*')
            .order(timeCol, { ascending: false })
            .limit(1);

        if (latest && latest.length > 0) {
            console.log('Latest Acceptance Email:', latest[0].email);

            // Check app_users
            const { data: user, error: userError } = await supabase
                .from('app_users')
                .select('*')
                .eq('email', latest[0].email); // select returns array by default

            if (user && user.length > 0) {
                console.log('User FOUND in app_users:', user[0]);
            } else {
                console.log('User NOT FOUND in app_users.');
            }
        }
    } else {
        console.log('Table acceptances is empty.');
    }
}

inspect();
