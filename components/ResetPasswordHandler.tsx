
import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const ResetPasswordHandler: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const hasRecoveryInHash =
            window.location.hash.includes('type=recovery') ||
            hashParams.has('access_token') ||
            hashParams.has('refresh_token');
        const searchParams = new URLSearchParams(window.location.search);
        const hasRecoveryInQuery =
            searchParams.get('type') === 'recovery' ||
            searchParams.has('token_hash') ||
            searchParams.has('code');

        const redirectToUpdatePasswordPreservingTokens = () => {
            if (window.location.pathname === '/recover-password' || window.location.pathname === '/update-password') return;
            const target = `/recover-password${window.location.search}${window.location.hash}`;
            console.log('Recovery mode detected -> Redirecting with tokens preserved:', target);
            navigate(target, { replace: true });
        };

        // 1. Check URL hash/query for recovery mode (Best for initial load)
        if (hasRecoveryInHash || hasRecoveryInQuery) {
            redirectToUpdatePasswordPreservingTokens();
            return;
        }

        // 2. Listen for auth state change (Best for SPA navigation)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                console.log('Password recovery event captured -> Redirecting to /recover-password');
                redirectToUpdatePasswordPreservingTokens();
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate]);

    return null; // This component handles logic only, no UI
};

export default ResetPasswordHandler;
