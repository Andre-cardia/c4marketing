
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

async function seedData() {
    console.log('Seeding access_guide_data...');

    // Get the first project
    const { data: projects } = await supabase
        .from('landing_page_projects')
        .select('id')
        .limit(1);

    if (!projects || projects.length === 0) {
        console.log('No projects found to seed.');
        return;
    }

    const id = projects[0].id;
    console.log(`Updating project ${id}...`);

    const dummyData = {
        company_name: 'Teste Empresa',
        contact_person: 'João',
        site_url: 'www.teste.com',
        platform: 'WordPress'
    };

    const { error } = await supabase
        .from('landing_page_projects')
        .update({
            access_guide_data: dummyData,
            account_setup_status: 'pending' // Ensure it's pending so we see "Validar" button
        })
        .eq('id', id);

    if (error) {
        console.error('Error updating:', error);
    } else {
        console.log('Successfully updated access_guide_data. Refresh the page to see the buttons.');
    }
}

seedData();
