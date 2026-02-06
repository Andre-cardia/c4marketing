
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

    // Get ALL projects
    const { data: projects } = await supabase
        .from('landing_page_projects')
        .select('id');

    if (!projects || projects.length === 0) {
        console.log('No projects found to seed.');
        return;
    }

    console.log(`Found ${projects.length} projects. Updating all...`);

    const dummyData = {
        company_name: 'Teste Empresa (Seeded)',
        contact_person: 'Admin',
        site_url: 'www.teste.com',
        platform: 'WordPress'
    };

    for (const project of projects) {
        const { error } = await supabase
            .from('landing_page_projects')
            .update({
                access_guide_data: dummyData,
                account_setup_status: 'pending'
            })
            .eq('id', project.id);

        if (error) console.error(`Failed to update ${project.id}:`, error);
        else console.log(`Updated ${project.id}`);
    }

    console.log('Finished updating projects.');
}

seedData();
