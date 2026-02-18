
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const acceptanceId = 36; // From previous inspection

async function createProject() {
    console.log(`Creating traffic project for acceptance ID: ${acceptanceId}...`);

    // 1. Get acceptance details
    const { data: acceptance, error: accError } = await supabase
        .from('acceptances')
        .select('*')
        .eq('id', acceptanceId)
        .single();

    if (accError) {
        console.error('Error fetching acceptance:', accError);
        return;
    }

    console.log(`Found acceptance for: ${acceptance.name} (${acceptance.company_name})`);

    // 2. Insert into traffic_projects
    // Check schema first? Assuming standard fields: name, company_name, acceptance_id, status
    const { data, error } = await supabase
        .from('traffic_projects')
        .insert({
            acceptance_id: acceptanceId,
            name: acceptance.company_name || acceptance.name,
            status: 'active'
        })
        .select();

    if (error) {
        console.error('Error creating project:', error);
    } else {
        console.log('Traffic Project Created Successfully:', data);
    }
}

createProject();
