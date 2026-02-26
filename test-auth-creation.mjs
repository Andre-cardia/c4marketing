import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Let's try .env.local since .env failed before

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    dotenv.config({ path: '.env' });
}

const supabaseUrlFinal = process.env.VITE_SUPABASE_URL;
const supabaseKeyFinal = process.env.VITE_SUPABASE_ANON_KEY;

const tempSupabase = createClient(supabaseUrlFinal, supabaseKeyFinal, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

async function testAuthCreation() {
    console.log('Testing User Creation from API side...');

    const email = 'andre.cardia@gmail.com'; // User's test email
    const password = 'password123';

    // 1. Try to Log In first
    console.log('1. Trying to sign in...');
    const { data: loginData, error: loginError } = await tempSupabase.auth.signInWithPassword({
        email,
        password
    });

    if (loginData?.user) {
        console.log('User already exists in Auth, ID:', loginData.user.id);
    } else {
        console.log('Login failed (or user missing):', loginError?.message);

        // 2. Try to Sign Up
        console.log('2. Trying to sign up...');
        const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: 'User teste' }
            }
        });

        if (signUpError) {
            console.error('Sign Up Error:', signUpError);
        } else {
            console.log('Sign Up Success, User ID:', signUpData?.user?.id);
        }
    }
}

testAuthCreation();
