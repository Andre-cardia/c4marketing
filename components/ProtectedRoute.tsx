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
    const [userRole, setUserRole] = useState<string | null>(null);
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

        // Verify if local session is still valid on Auth server.
        let activeSession = session;
        let { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) {
                await supabase.auth.signOut();
                setSession(null);
                setAuthorized(false);
                setLoading(false);
                return;
            }
            activeSession = refreshed.session;
            const secondCheck = await supabase.auth.getUser();
            if (secondCheck.error || !secondCheck.data?.user) {
                await supabase.auth.signOut();
                setSession(null);
                setAuthorized(false);
                setLoading(false);
                return;
            }
        }

        setSession(activeSession);

        // Security Check: Is the user email in our allowed list?
        try {
            const { data: userRecord, error } = await supabase
                .from('app_users')
                .select('role')
                .eq('email', activeSession.user.email)
                .single();

            if (error || !userRecord) {
                console.warn('Access Denied: User not found in app_users table');
                await supabase.auth.signOut();
                alert('Acesso negado. Seu usuário não tem permissão para acessar este sistema.');
                setSession(null);
            } else {
                setUserRole(userRecord.role);
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
        if (userRole === 'cliente') {
            return <Navigate to="/client" replace />;
        }
        return <Navigate to="/dashboard" replace />; // Redirect to Dashboard if logged in but unauthorized for specific page
    }

    return <>{children}</>;
};

export default ProtectedRoute;
