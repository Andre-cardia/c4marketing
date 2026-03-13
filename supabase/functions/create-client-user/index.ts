import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const buildJsonResponse = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

const isAlreadyRegisteredMessage = (value?: string | null) =>
    Boolean(
        value && [
            /already\s+been\s+registered/i,
            /already\s+registered/i,
            /already\s+exists/i,
            /user\s+already\s+exists/i,
        ].some((pattern) => pattern.test(value))
    )

const findAuthUserByEmail = async (supabaseAdmin: ReturnType<typeof createClient>, email: string) => {
    const normalizedEmail = email.toLowerCase()

    for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })

        if (error) {
            console.error('Error listing auth users:', error)
            return null
        }

        const users = data?.users ?? []
        const existingAuthUser = users.find((user) => user.email?.toLowerCase() === normalizedEmail)
        if (existingAuthUser) {
            return existingAuthUser
        }

        if (users.length < 200) {
            break
        }
    }

    return null
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

        // --- SELF-HEALING: Check for or create traffic_projects record ---
        // Run this regardless of user existence to ensure data consistency
        try {
            const { data: latestAcceptance } = await supabaseAdmin
                .from('acceptances')
                .select('id, company_name, name')
                .eq('email', email.toLowerCase())
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
            .eq('email', email.toLowerCase())
            .single()

        if (existingUser) {
            // User already exists - just ensure role is 'cliente'
            if (existingUser.role !== 'cliente') {
                return buildJsonResponse({
                    status: 'existing',
                    message: 'User already exists with a different role. No changes made.',
                })
            }
            // Send password reset email (acts as welcome/invite email) - even if existing, maybe they forgot password?
            // Optional: Uncomment to resend invite for existing users
            const siteUrl = Deno.env.get('SITE_URL') || 'https://c4marketing.vercel.app';
            const finalRedirectUrl = siteUrl.includes('localhost') ? 'https://c4marketing.vercel.app/client' : `${siteUrl}/client`;
            await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
                redirectTo: finalRedirectUrl,
            })

            return buildJsonResponse({
                status: 'existing',
                message: 'Client user already exists. Project check complete. Welcome email resent.',
            })
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
            if (isAlreadyRegisteredMessage(authError.message)) {
                const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email)

                if (existingAuthUser) {
                    const { error: upsertProfileError } = await supabaseAdmin
                        .from('app_users')
                        .upsert({
                            id: existingAuthUser.id,
                            email: email.toLowerCase(),
                            name: name || email.split('@')[0],
                            role: 'cliente',
                        })

                    if (upsertProfileError) {
                        console.error('Error upserting app_user for existing auth user:', upsertProfileError)
                    }
                }

                const siteUrl = Deno.env.get('SITE_URL') || 'https://c4marketing.vercel.app';
                const finalRedirectUrl = siteUrl.includes('localhost') ? 'https://c4marketing.vercel.app/update-password' : `${siteUrl}/update-password`;
                const { error: resetExistingUserError } = await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
                    redirectTo: finalRedirectUrl,
                })

                if (resetExistingUserError) {
                    console.error('Error sending reset email for existing auth user:', resetExistingUserError)
                }

                return buildJsonResponse({
                    status: 'existing',
                    message: existingAuthUser
                        ? 'Client user already exists. Existing profile verified and access email sent.'
                        : 'Client user already exists in authentication. Access email sent.',
                })
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
        const finalRedirectUrl = siteUrl.includes('localhost') ? 'https://c4marketing.vercel.app/update-password' : `${siteUrl}/update-password`;

        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
            email.toLowerCase(),
            {
                redirectTo: finalRedirectUrl,
            }
        )

        if (resetError) {
            console.error('Error sending reset email:', resetError)
        }

        return buildJsonResponse({
            status: 'created',
            message: 'Client user created/verified. Project check complete. Welcome email sent.',
        })

    } catch (error) {
        console.error('Error in create-client-user:', error)
        if (isAlreadyRegisteredMessage(error.message)) {
            return buildJsonResponse({
                status: 'existing',
                message: 'Client user already exists in the system.',
            })
        }
        return buildJsonResponse({ error: error.message }, 400)
    }
})
