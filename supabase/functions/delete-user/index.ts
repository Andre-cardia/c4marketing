import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userId } = await req.json()

        if (!userId) {
            throw new Error('userId is required')
        }

        // Verify the caller is an authenticated gestor/admin
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const callerSupabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user: caller } } = await callerSupabase.auth.getUser()
        if (!caller) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check caller is gestor or admin
        const { data: callerProfile } = await callerSupabase
            .from('app_users')
            .select('role')
            .eq('id', caller.id)
            .single()

        if (!callerProfile || !['gestor', 'admin'].includes(callerProfile.role)) {
            return new Response(
                JSON.stringify({ error: 'Forbidden: only gestor/admin can delete users' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Prevent self-deletion
        if (caller.id === userId) {
            return new Response(
                JSON.stringify({ error: 'Cannot delete your own account' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Delete from app_users (public profile)
        const { error: dbError } = await supabaseAdmin
            .from('app_users')
            .delete()
            .eq('id', userId)

        if (dbError) {
            console.error('Error deleting from app_users:', dbError)
            throw dbError
        }

        // 2. Delete from auth.users (removes the email from Auth permanently)
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (authError) {
            console.error('Error deleting from auth.users:', authError)
            throw authError
        }

        return new Response(
            JSON.stringify({ status: 'deleted', message: 'User deleted from Auth and database.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error in delete-user:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
