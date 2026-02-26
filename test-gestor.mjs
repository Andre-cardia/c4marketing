import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// Fallback to supabaseKey if service key is missing, but it WILL fail. We assume we have service key in local env or we just test something else.
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

async function testGestorInsert() {
    console.log('--- Testing Gestor Insert Flow ---');

    const anonClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const gestorEmail = `gestor_${Date.now()}@example.com`;
    const gestorPassword = 'password123';

    console.log('1. Creating Gestor Auth User:', gestorEmail);
    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
        email: gestorEmail,
        password: gestorPassword,
        options: { data: { full_name: 'Test Gestor' } }
    });

    if (signUpError) {
        console.error('Sign Up Error:', signUpError);
        return;
    }
    const gestorAuthId = signUpData.user.id;
    console.log('Gestor Auth Created:', gestorAuthId);

    // 2. Insert gestor into app_users using service_key (requires service key to bypass RLS!)
    const serviceClient = createClient(supabaseUrl, serviceKey);
    console.log('2. Inserting gestor into app_users with role=gestor...');
    const { error: dbError } = await serviceClient.from('app_users').insert([{
        name: 'Test Gestor',
        email: gestorEmail,
        phone: '0000',
        role: 'gestor'
    }]);

    if (dbError) {
        console.error('Service DB Insert Error (Do you have the service role key?):', dbError);
        // We can't proceed if we can't make them a gestor
        return;
    }
    console.log('Gestor successfully inserted in app_users!');

    // 3. Login with that gestor account
    console.log('3. Logging in as gestor...');
    const gestorClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });
    await gestorClient.auth.signInWithPassword({ email: gestorEmail, password: gestorPassword });

    // 4. Try to insert a new user AS gestor
    const targetEmail = `target_${Date.now()}@example.com`;
    console.log('4. Attempting to insert a user as gestor:', targetEmail);
    const { error: insertError } = await gestorClient.from('app_users').insert([{
        name: 'Target User',
        email: targetEmail,
        phone: '1111',
        role: 'leitor'
    }]);

    if (insertError) {
        console.error('Gestor Insert Error:', insertError);
    } else {
        console.log('Gestor Insert Success! The RLS allows it.');
    }

    // Cleanup: delete them
    console.log('Cleaning up...');
    await serviceClient.from('app_users').delete().eq('email', targetEmail);
    await serviceClient.from('app_users').delete().eq('email', gestorEmail);
    await serviceClient.auth.admin.deleteUser(gestorAuthId);
}

testGestorInsert();
