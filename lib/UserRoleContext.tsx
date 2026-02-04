import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

type UserRole = 'leitor' | 'comercial' | 'gestor' | null;

interface UserRoleContextType {
    userRole: UserRole;
    loading: boolean;
    refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export const UserRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserRole = async () => {
        console.log('[UserRoleContext] fetchUserRole started');
        setLoading(true);
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            console.log('[UserRoleContext] Session:', session?.user?.email, 'Error:', sessionError);

            if (session?.user?.email) {
                console.log('[UserRoleContext] Fetching role for email:', session.user.email);
                const { data, error } = await supabase
                    .from('app_users')
                    .select('role')
                    .eq('email', session.user.email)
                    .single();

                console.log('[UserRoleContext] App Users response:', data, 'Error:', error);

                if (data) {
                    console.log('[UserRoleContext] Setting role to:', data.role);
                    setUserRole(data.role as UserRole);
                } else {
                    console.log('[UserRoleContext] No user data found, setting role to null');
                    setUserRole(null);
                }
            } else {
                console.log('[UserRoleContext] No active session');
                setUserRole(null);
            }
        } catch (error) {
            console.error('[UserRoleContext] Error fetching user role:', error);
            setUserRole(null);
        } finally {
            console.log('[UserRoleContext] Loading set to false');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUserRole();
    }, []);

    return (
        <UserRoleContext.Provider value={{ userRole, loading, refreshRole: fetchUserRole }}>
            {children}
        </UserRoleContext.Provider>
    );
};

export const useUserRole = () => {
    const context = useContext(UserRoleContext);
    if (context === undefined) {
        throw new Error('useUserRole must be used within a UserRoleProvider');
    }
    return context;
};
