import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://YOUR_SUPABASE_URL.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkUser(email) {
    console.log(`Checking status for: ${email}`);

    // Check app_users table
    const { data: appUser, error: appUserError } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .single();

    if (appUserError) {
        console.error('Error fetching app_user:', appUserError.message);
    } else {
        console.log('User found in app_users:', appUser);
    }

    // Attempt to recover password to check auth user existence (indirectly)
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
        console.error('Error attempting password reset (Auth Check):', error.message);
    } else {
        console.log('Password reset email sent successfully (User likely exists in Auth).');
    }
}

checkUser('marcelo.lonzetti@gmail.com');
