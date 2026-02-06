
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking schema for landing_page_projects...');

    // Try to select the column specifically
    const { data, error } = await supabase
        .from('landing_page_projects')
        .select('id, access_guide_data, account_setup_status');

    if (error) {
        console.error('Error selecting access_guide_data:', error);
    } else {
        console.log(`Total projects: ${data?.length}`);
        const withData = data?.filter(p => p.access_guide_data);
        console.log(`Projects with access_guide_data: ${withData?.length}`);
        if (withData && withData.length > 0) {
            console.log('Sample with data:', JSON.stringify(withData[0], null, 2));
        } else {
            console.log('No projects have access_guide_data.');
            console.log('Sample project:', data?.[0]);
        }
    }
}

checkSchema();
