import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('Testing Supabase Connection...');
console.log('URL:', supabaseUrl);
console.log('Key length:', supabaseAnonKey ? supabaseAnonKey.length : 0);
// Don't log the full key for security, but maybe the prefix
console.log('Key prefix:', supabaseAnonKey ? supabaseAnonKey.substring(0, 15) + '...' : 'MISSING');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    try {
        // Attempt to fetch something public or check health
        // Trying to access 'app_users' might fail if RLS is strict and we are anon, 
        // but we should get a 401 or similar, not "Failed to fetch" (network error).
        // A better check is just accessing the auth endpoint or a public table.
        // Let's try auth.getSession() which should always work (returns null session)

        console.log('1. Testing Auth Session...');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
            console.error('Auth Session Error:', sessionError);
        } else {
            console.log('Auth Session Success (should be null or session):', sessionData.session ? 'Session Found' : 'No Session (Expected)');
        }

        console.log('2. Testing Database Select (app_users count)...');
        const { count, error: dbError } = await supabase
            .from('app_users')
            .select('*', { count: 'exact', head: true });

        if (dbError) {
            console.error('Database Error:', dbError);
        } else {
            console.log('Database Connection Success. Count:', count);
        }

        console.log('3. Attempting SignIn with dummy credentials...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: 'test@example.com',
            password: 'wrongpassword123'
        });

        if (signInError) {
            console.log('SignIn Response:', signInError.message); // Should be "Invalid login credentials"
        } else {
            console.log('SignIn Unexpected Success:', signInData);
        }

    } catch (err) {
        console.error('Unexpected Exception:', err);
    }
}

testConnection();
