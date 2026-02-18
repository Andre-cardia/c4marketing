import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { email, name } = await req.json()

        if (!email) {
            throw new Error('Email is required')
        }

        // Initialize Supabase with Service Role Key (admin privileges)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Check if user already exists in app_users
        const { data: existingUser } = await supabaseAdmin
            .from('app_users')
            .select('id, email, role')
            .eq('email', email.toLowerCase())
            .single()

        if (existingUser) {
            // User already exists - just ensure role is 'cliente'
            if (existingUser.role !== 'cliente') {
                // Don't override existing staff roles
                return new Response(
                    JSON.stringify({
                        status: 'existing',
                        message: 'User already exists with a different role. No changes made.',
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            return new Response(
                JSON.stringify({
                    status: 'existing',
                    message: 'Client user already exists.',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Create user in Supabase Auth (with random password — they'll set it via reset email)
        const tempPassword = crypto.randomUUID() + 'Aa1!' // Ensure it meets password requirements
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.toLowerCase(),
            password: tempPassword,
            email_confirm: true, // Auto-confirm to avoid double emails
        })

        if (authError) {
            // If user already exists in Auth but not in app_users, handle gracefully
            if (authError.message?.includes('already been registered')) {
                // Get the existing auth user
                const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
                const existingAuthUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

                if (existingAuthUser) {
                    // Insert into app_users with the auth user's ID
                    await supabaseAdmin.from('app_users').insert({
                        id: existingAuthUser.id,
                        email: email.toLowerCase(),
                        name: name || email.split('@')[0],
                        role: 'cliente',
                    })

                    // Send password reset (welcome email)
                    const siteUrl = Deno.env.get('SITE_URL') || 'https://c4marketing.vercel.app';
                    const finalRedirectUrl = siteUrl.includes('localhost') ? 'https://c4marketing.vercel.app/client' : `${siteUrl}/client`;

                    await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
                        redirectTo: finalRedirectUrl,
                    })

                    return new Response(
                        JSON.stringify({
                            status: 'created',
                            message: 'Client profile created. Welcome email sent.',
                        }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }
            }
            throw authError
        }

        // 3. Insert into app_users with role 'cliente'
        const { error: dbError } = await supabaseAdmin.from('app_users').insert({
            id: authUser.user.id,
            email: email.toLowerCase(),
            name: name || email.split('@')[0],
            role: 'cliente',
        })

        if (dbError) {
            console.error('Error inserting app_user:', dbError)
            // Don't fail entirely — auth user was created
        }

        // 4. Send password reset email (acts as welcome/invite email)
        const siteUrl = Deno.env.get('SITE_URL') || 'https://c4marketing.vercel.app';
        // Ensure we don't accidentally use localhost in production if env var is wrong
        const finalRedirectUrl = siteUrl.includes('localhost') ? 'https://c4marketing.vercel.app/client' : `${siteUrl}/client`;

        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
            email.toLowerCase(),
            {
                redirectTo: finalRedirectUrl,
            }
        )

        if (resetError) {
            console.error('Error sending reset email:', resetError)
        }

        return new Response(
            JSON.stringify({
                status: 'created',
                message: 'Client user created successfully. Welcome email sent.',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error in create-client-user:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }
})
