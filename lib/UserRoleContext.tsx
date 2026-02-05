import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

type UserRole = 'leitor' | 'comercial' | 'gestor' | 'operacional' | null;

interface UserRoleContextType {
    userRole: UserRole;
    fullName: string | null;
    avatarUrl: string | null;
    email: string | null;
    loading: boolean;
    refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export const UserRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userRole, setUserRole] = useState<UserRole>(null);
    const [fullName, setFullName] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
                    .select('role, full_name, avatar_url')
                    .eq('email', session.user.email)
                    .single();

                if (data) {
                    setUserRole(data.role as UserRole);
                    setFullName(data.full_name);
                    setAvatarUrl(data.avatar_url);
                } else {
                    setUserRole(null);
                }
            } else {
                setUserRole(null);
                setEmail(null);
            }
        } catch (error) {
            console.error('Error fetching user role:', error);
            setUserRole(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUserRole();
    }, []);

    return (
        <UserRoleContext.Provider value={{ userRole, fullName, avatarUrl, email, loading, refreshRole: fetchUserRole }}>
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
