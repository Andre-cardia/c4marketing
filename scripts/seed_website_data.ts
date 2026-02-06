
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

async function seedWebsiteData() {
    console.log('Seeding access_guide_data for websites...');

    // Get the first website project
    const { data: projects } = await supabase
        .from('website_projects')
        .select('id')
        .limit(1);

    if (!projects || projects.length === 0) {
        console.log('No website projects found to seed.');
        return;
    }

    const id = projects[0].id;
    console.log(`Updating website project ${id}...`);

    const dummyData = {
        company_name: 'Teste Site Empresa',
        contact_person: 'Maria',
        site_url: 'www.site.com',
        platform: 'Wix'
    };

    const { error } = await supabase
        .from('website_projects')
        .update({
            access_guide_data: dummyData,
            account_setup_status: 'pending'
        })
        .eq('id', id);

    if (error) {
        console.error('Error updating:', error);
    } else {
        console.log('Successfully updated access_guide_data for WEBSITE. Refresh the page.');
    }
}

seedWebsiteData();
