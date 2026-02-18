
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

async function checkUser() {
    // 1. Get latest acceptance to find the email
    const { data: acceptances, error: acceptanceError } = await supabase
        .from('acceptances')
        .select('*')
        .limit(1);

    if (acceptanceError) {
        console.error('Error fetching acceptances:', acceptanceError);
        return;
    }

    if (!acceptances || acceptances.length === 0) {
        console.log('No acceptances found.');
        return;
    }

    console.log('Acceptance columns:', Object.keys(acceptances[0]));

    // sorting by id desc as proxy for time if created_at missing
    const { data: latestAcceptances } = await supabase
        .from('acceptances')
        .select('name, email')
        .order('id', { ascending: false })
        .limit(1);

    const latestAcceptance = latestAcceptances ? latestAcceptances[0] : acceptances[0];
    console.log('Latest Acceptance:', latestAcceptance);

    // 2. Check if this user exists in app_users
    const { data: user, error: userError } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', latestAcceptance.email)
        .single();

    if (userError) {
        console.log('Error searching app_users (might not exist):', userError.message);
    } else {
        console.log('User found in app_users:', user);
    }
}

checkUser();
