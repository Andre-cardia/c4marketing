
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // Using Anon key is usually enough for resetPasswordForEmail if allowed, otherwise Service Role.

// For admin/service role actions (like bypassing captcha or rate limits sometimes), simpler to use service role if available, 
// but let's try Anon first as it mimics client-side behavior. 
// Actually, resetPasswordForEmail is public.

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const email = 'andre.cardia@hotmail.com'; // Correcting typo "ansre" -> "andre"

async function sendTestEmail() {
    console.log(`Sending password reset email to ${email}...`);

    // We intentionally DO NOT pass redirectTo to test the Dashboard Configuration.
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
        console.error('Error sending email:', error.message);
    } else {
        console.log('Email sent successfully!');
        console.log('Please check the link in the email. It should start with https://c4marketing.vercel.app');
    }
}

sendTestEmail();
