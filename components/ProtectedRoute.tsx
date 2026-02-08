import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                setSession(null);
                setAuthorized(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const checkAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            setLoading(false);
            return;
        }

        setSession(session);

        // Security Check: Is the user email in our allowed list?
        try {
            const { data: userRecord, error } = await supabase
                .from('app_users')
                .select('role')
                .eq('email', session.user.email)
                .single();

            if (error || !userRecord) {
                console.warn('Access Denied: User not found in app_users table');
                await supabase.auth.signOut();
                alert('Acesso negado. Seu usuário não tem permissão para acessar este sistema.');
                setSession(null);
            } else {
                // Check if role is allowed
                if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRecord.role)) {
                    console.warn(`Access Denied: Role ${userRecord.role} not in allowed list [${allowedRoles}]`);
                    setAuthorized(false);
                    // Optional: redirect to dashboard or show unauthorized message
                    // For now, we'll just set authorized to false which redirects to /
                } else {
                    setAuthorized(true);
                }
            }
        } catch (err) {
            console.error('Error verifying user:', err);
            setSession(null);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Carregando...</div>;
    }

    if (!session) {
        return <Navigate to="/" replace />; // Redirect to Home/Login
    }

    if (!authorized) {
        return <Navigate to="/dashboard" replace />; // Redirect to Dashboard if logged in but unauthorized for specific page
    }

    return <>{children}</>;
};

export default ProtectedRoute;
