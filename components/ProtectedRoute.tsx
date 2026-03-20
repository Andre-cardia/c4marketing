import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '../lib/UserRoleContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

/**
 * Uses UserRoleContext (already resolving auth + role from Supabase)
 * to avoid duplicate fetches, race conditions, and conflicting states.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { userRole, loading } = useUserRole();

    // Wait for the context to resolve auth state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
                Carregando...
            </div>
        );
    }

    // Not authenticated at all
    if (userRole === null) {
        return <Navigate to="/" replace />;
    }

    // Role not authorized for this route
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
        // Route each restricted role to its home page
        if (userRole === 'cliente') {
            return <Navigate to="/client" replace />;
        }
        if (userRole === 'financeiro' || userRole === 'leitor') {
            return <Navigate to="/account" replace />;
        }
        // Fallback: go to dashboard (admin, gestor, etc. hitting a page they can't see)
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
