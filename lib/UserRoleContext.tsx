import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

type UserRole = 'admin' | 'leitor' | 'comercial' | 'gestor' | 'operacional' | null;

interface UserRoleContextType {
    userRole: UserRole;
    fullName: string | null;
    avatarUrl: string | null;
    email: string | null;
    calComLink: string | null;
    loading: boolean;
    refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export const UserRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [fullName, setFullName] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [calComLink, setCalComLink] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserRole = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                setEmail(session.user.email);
                const { data } = await supabase
                    .from('app_users')
                    .select('role, full_name, avatar_url, cal_com_link')
                    .eq('email', session.user.email)
                    .single();

                if (data) {
                    setUserRole(data.role as UserRole);
                    setFullName(data.full_name);
                    setAvatarUrl(data.avatar_url);
                    setCalComLink(data.cal_com_link);
                } else {
                    setUserRole(null);
                }
            } else {
                setUserRole(null);
                setEmail(null);
                setCalComLink(null);
            }
        } catch (error) {
            console.error('Error fetching user role:', error);
            setUserRole(null);
        } finally {
            setLoading(false);
        }
    };

    // Clear all user data when signed out
    const clearUserData = () => {
        setUserRole(null);
        setFullName(null);
        setAvatarUrl(null);
        setCalComLink(null);
        setEmail(null);
    };

    useEffect(() => {
        fetchUserRole();

        // CRITICAL: Listen for auth state changes to update user data on login/logout
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('[UserRoleContext] Auth state changed:', event);

            if (event === 'SIGNED_OUT') {
                // Immediately clear all user data on logout
                clearUserData();
                setLoading(false);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                // Fetch fresh user data on login or token refresh
                fetchUserRole();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <UserRoleContext.Provider value={{ userRole, fullName, avatarUrl, email, calComLink, loading, refreshRole: fetchUserRole }}>
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
