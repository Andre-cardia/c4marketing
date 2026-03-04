import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingSupabaseEnvVars = [
    !supabaseUrl ? 'VITE_SUPABASE_URL (ou SUPABASE_URL no .env)' : null,
    !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY (ou SUPABASE_ANON_KEY no .env)' : null,
].filter(Boolean) as string[];

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co';
export const supabaseConfigError = missingSupabaseEnvVars.length
    ? `Variáveis ausentes: ${missingSupabaseEnvVars.join(', ')}.`
    : null;

if (!isSupabaseConfigured) {
    console.warn('Supabase credentials missing or invalid. Authentication will fail.');
}

// Use placeholders to prevent crash if env vars are missing
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder';

export const supabase = createClient(url, key);
