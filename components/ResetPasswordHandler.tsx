
import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const ResetPasswordHandler: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // 1. Check URL hash for recovery mode (Best for initial load)
        if (window.location.hash && window.location.hash.includes('type=recovery')) {
            console.log('Recovery mode detected via hash -> Redirecting to /update-password');
            navigate('/update-password');
            return;
        }

        // 2. Listen for auth state change (Best for SPA navigation)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                console.log('Password recovery event captured -> Redirecting to /update-password');
                navigate('/update-password');
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate]);

    return null; // This component handles logic only, no UI
};

export default ResetPasswordHandler;
