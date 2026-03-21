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

        const normalizedEmail = String(email).trim().toLowerCase()

        // Initialize Supabase with Service Role Key (admin privileges)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const resolveRecoveryRedirectUrl = (): string => {
            const siteUrl = Deno.env.get('SITE_URL') || 'https://c4marketing.vercel.app'
            return siteUrl.includes('localhost')
                ? 'https://c4marketing.vercel.app/recover-password'
                : `${siteUrl}/recover-password`
        }

        const parseRateLimitSeconds = (message: string): number | null => {
            const match = (message || '').match(/after\s+(\d+)\s+seconds?/i)
            if (!match) return null
            const seconds = Number(match[1])
            return Number.isFinite(seconds) ? seconds : null
        }

        const sendRecoveryEmail = async (): Promise<{ ok: true } | { ok: false; message: string; retryAfterSeconds: number | null }> => {
            const { error } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
                redirectTo: resolveRecoveryRedirectUrl(),
            })
            if (!error) return { ok: true }
            const message = error.message || 'Failed to send recovery email'
            return {
                ok: false,
                message,
                retryAfterSeconds: parseRateLimitSeconds(message),
            }
        }

        // --- SELF-HEALING: Check for or create traffic_projects record ---
        // Run this regardless of user existence to ensure data consistency
        try {
            const { data: latestAcceptance } = await supabaseAdmin
                .from('acceptances')
                .select('id, company_name, name')
                .eq('email', normalizedEmail)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestAcceptance) {
                const { data: existingProject } = await supabaseAdmin
                    .from('traffic_projects')
                    .select('id')
                    .eq('acceptance_id', latestAcceptance.id)
                    .single();

                if (!existingProject) {
                    console.log(`Creating missing traffic_project for acceptance ${latestAcceptance.id}`);
                    const { error: projError } = await supabaseAdmin
                        .from('traffic_projects')
                        .insert({
                            acceptance_id: latestAcceptance.id,
                            name: latestAcceptance.company_name || latestAcceptance.name || name,
                            status: 'active'
                        });

                    if (projError) {
                        console.error('Error creating traffic_project:', projError);
                    } else {
                        console.log('traffic_project created successfully.');
                    }
                }
            }
        } catch (projCheckErr) {
            console.error('Error in self-healing project check:', projCheckErr);
            // Continue execution, don't fail user creation
        }
        // ----------------------------------------------------------------

        // 1. Check if user already exists in app_users
        const { data: existingUser } = await supabaseAdmin
            .from('app_users')
            .select('id, email, role')
            .eq('email', normalizedEmail)
            .single()

        if (existingUser) {
            // User already exists - just ensure role is 'cliente'
            if (existingUser.role !== 'cliente') {
                return new Response(
                    JSON.stringify({
                        status: 'existing',
                        message: 'User already exists with a different role. No changes made.',
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            const recovery = await sendRecoveryEmail()
            if (!recovery.ok) {
                return new Response(
                    JSON.stringify({
                        status: 'existing',
                        email_sent: false,
                        error_code: recovery.retryAfterSeconds ? 'over_email_send_rate_limit' : 'email_send_failed',
                        retry_after_seconds: recovery.retryAfterSeconds,
                        message: recovery.retryAfterSeconds
                            ? `Email de recuperação em rate limit. Aguarde ${recovery.retryAfterSeconds}s para tentar novamente.`
                            : `Falha ao enviar email de recuperação: ${recovery.message}`,
                    }),
                    {
                        status: recovery.retryAfterSeconds ? 429 : 502,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    }
                )
            }

            return new Response(
                JSON.stringify({
                    status: 'existing',
                    email_sent: true,
                    message: 'Client user already exists. Recovery email resent.',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Create user in Supabase Auth (with random password — they'll set it via reset email)
        const tempPassword = crypto.randomUUID() + 'Aa1!' // Ensure it meets password requirements
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true, // Auto-confirm to avoid double emails
        })

        if (authError) {
            // If user already exists in Auth but not in app_users, handle gracefully
            if (authError.message?.includes('already been registered')) {
                // Get the existing auth user
                const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
                const existingAuthUser = users?.find(u => u.email?.toLowerCase() === normalizedEmail)

                if (existingAuthUser) {
                    // Insert into app_users with the auth user's ID
                    await supabaseAdmin.from('app_users').insert({
                        id: existingAuthUser.id,
                        email: normalizedEmail,
                        name: name || email.split('@')[0],
                        role: 'cliente',
                    })

                    const recovery = await sendRecoveryEmail()
                    if (!recovery.ok) {
                        return new Response(
                            JSON.stringify({
                                status: 'created',
                                email_sent: false,
                                error_code: recovery.retryAfterSeconds ? 'over_email_send_rate_limit' : 'email_send_failed',
                                retry_after_seconds: recovery.retryAfterSeconds,
                                message: recovery.retryAfterSeconds
                                    ? `Conta criada, mas email em rate limit. Aguarde ${recovery.retryAfterSeconds}s para tentar novamente.`
                                    : `Conta criada, mas falha ao enviar email: ${recovery.message}`,
                            }),
                            {
                                status: recovery.retryAfterSeconds ? 429 : 502,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            }
                        )
                    }

                    return new Response(
                        JSON.stringify({
                            status: 'created',
                            email_sent: true,
                            message: 'Client profile created. Recovery email sent.',
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
            email: normalizedEmail,
            name: name || email.split('@')[0],
            role: 'cliente',
        })

        if (dbError) {
            console.error('Error inserting app_user:', dbError)
            // Don't fail entirely — auth user was created
        }

        const recovery = await sendRecoveryEmail()
        if (!recovery.ok) {
            return new Response(
                JSON.stringify({
                    status: 'created',
                    email_sent: false,
                    error_code: recovery.retryAfterSeconds ? 'over_email_send_rate_limit' : 'email_send_failed',
                    retry_after_seconds: recovery.retryAfterSeconds,
                    message: recovery.retryAfterSeconds
                        ? `Conta criada, mas email em rate limit. Aguarde ${recovery.retryAfterSeconds}s para tentar novamente.`
                        : `Conta criada, mas falha ao enviar email: ${recovery.message}`,
                }),
                {
                    status: recovery.retryAfterSeconds ? 429 : 502,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        return new Response(
            JSON.stringify({
                status: 'created',
                email_sent: true,
                message: 'Client user created/verified. Recovery email sent.',
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
