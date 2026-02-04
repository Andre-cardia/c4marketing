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
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                const { data } = await supabase
                    .from('app_users')
                    .select('role')
                    .eq('email', session.user.email)
                    .single();

                if (data) {
                    setUserRole(data.role as UserRole);
                } else {
                    setUserRole(null);
                }
            } else {
                setUserRole(null);
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
