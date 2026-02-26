import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

const supabase = createClient(supabaseUrl, serviceKey);

async function testUserInsert() {
    console.log('Testing inserting a user with anon client to see if RLS catches it...');

    const tempSupabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const testEmail = `test_${Date.now()}@example.com`;

    console.log('Attempting sign up with', testEmail);
    const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
        email: testEmail,
        password: 'password123',
        options: { data: { full_name: 'Test User' } }
    });

    if (signUpError) {
        console.error('Sign Up Error:', signUpError);
        return;
    }

    console.log('Sign Up Success:', signUpData.user ? signUpData.user.id : 'No user returned');

    console.log('Inserting into app_users with service role...');
    const serviceSupabase = createClient(supabaseUrl, serviceKey);
    const { error: dbError } = await serviceSupabase.from('app_users').insert([{
        name: 'Test User',
        email: testEmail,
        phone: '123456789',
        role: 'leitor'
    }]);

    if (dbError) {
        console.error('DB Insert Error:', dbError);
    } else {
        console.log('DB Insert Success!');
    }
}

testUserInsert();
