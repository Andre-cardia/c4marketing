import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

type UserRole = 'admin' | 'leitor' | 'comercial' | 'gestor' | 'operacional' | 'cliente' | null;

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

    const logAccess = async (userId: string, userEmail: string) => {
        const THROTTLE_MINUTES = 15;
        const lastLogKey = `lastAccessLog_${userId}`;
        const lastLogTime = localStorage.getItem(lastLogKey);
        const now = new Date().getTime();

        if (lastLogTime && (now - parseInt(lastLogTime)) < THROTTLE_MINUTES * 60 * 1000) {
            return; // Skip if logged recently
        }

        try {
            await supabase.from('access_logs').insert({
                user_id: userId,
                user_email: userEmail
            });
            localStorage.setItem(lastLogKey, now.toString());
        } catch (error) {
            console.error('Error logging access:', error);
        }
    };

    const fetchUserRole = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                let activeSession = session;
                const firstUserCheck = await supabase.auth.getUser();
                if (firstUserCheck.error || !firstUserCheck.data?.user) {
                    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
                    if (refreshError || !refreshed.session) {
                        clearUserData();
                        return;
                    }
                    activeSession = refreshed.session;
                    const secondUserCheck = await supabase.auth.getUser();
                    if (secondUserCheck.error || !secondUserCheck.data?.user) {
                        clearUserData();
                        return;
                    }
                }

                setEmail(activeSession.user.email ?? null);
                const { data } = await supabase
                    .from('app_users')
                    .select('role, full_name, avatar_url, cal_com_link')
                    .eq('email', activeSession.user.email)
                    .single();

                if (data) {
                    setUserRole(data.role as UserRole);
                    setFullName(data.full_name);
                    setAvatarUrl(data.avatar_url);
                    setCalComLink(data.cal_com_link);

                    // Log access
                    if (activeSession.user.email) {
                        logAccess(activeSession.user.id, activeSession.user.email);
                    }
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
            console.log('User role fetch complete');
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
