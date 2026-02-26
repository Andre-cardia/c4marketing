import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Briefcase,
    FileText,
    Users,
    Calendar,
    Brain,
    Settings,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
    Sparkles,
    BarChart3,
    Target,
    LogOut,
    Activity
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserRole } from '../lib/UserRoleContext';
import DigitalClock from './DigitalClock';
import { supabase } from '../lib/supabase';

interface SidebarProps {
    isMobileOpen: boolean;
    setIsMobileOpen: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, setIsMobileOpen }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { userRole, loading, fullName, avatarUrl, email: userEmail } = useUserRole();

    // Load collapse state from localStorage
    useEffect(() => {
        const savedState = localStorage.getItem('sidebar-collapsed');
        if (savedState) setIsCollapsed(savedState === 'true');
    }, []);

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('sidebar-collapsed', String(newState));
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const navItems = [
        {
            label: 'Dashboard',
            icon: LayoutDashboard,
            path: '/dashboard',
            roles: ['admin', 'gestor', 'operacional', 'comercial']
        },
        {
            label: 'Segundo Cérebro',
            icon: Brain,
            path: '/brain',
            roles: ['gestor'],
            isIA: true
        },
        {
            label: 'Agente Tráfego',
            icon: Target,
            path: '/traffic-agent',
            roles: ['admin', 'gestor', 'operacional'],
            isIA: true
        },
        {
            label: 'Telemetria IA',
            icon: Activity,
            path: '/brain-telemetry',
            roles: ['gestor'],
            isIA: true
        },
        {
            label: 'Propostas',
            icon: FileText,
            path: '/proposals',
            roles: ['gestor', 'comercial']
        },
        {
            label: 'Dashboard Fin.',
            icon: BarChart3,
            path: '/commercial-dashboard',
            roles: ['gestor', 'comercial']
        },
        {
            label: 'Projetos',
            icon: Briefcase,
            path: '/projects',
            roles: ['admin', 'gestor', 'operacional']
        },
        {
            label: 'Agenda',
            icon: Calendar,
            path: '/meetings',
            roles: ['admin', 'gestor', 'comercial', 'operacional']
        },
        {
            label: 'Usuários',
            icon: Users,
            path: '/users',
            roles: ['gestor']
        },
    ];

    const filteredItems = navItems.filter(item =>
        !item.roles || item.roles.includes(userRole || '')
    );

    const isActive = (path: string) => location.pathname === path;

    const getUserInitials = () => {
        if (fullName) {
            const names = fullName.split(' ');
            if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase();
            return names[0].substring(0, 2).toUpperCase();
        }
        if (userEmail) return userEmail.substring(0, 2).toUpperCase();
        return 'U';
    };

    const SidebarContent = (
        <div className={`h-full flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 transition-all duration-300 overflow-x-hidden ${isCollapsed ? 'w-20' : 'w-64'}`}>
            {/* Logo Section */}
            <div className={`flex flex-col justify-center transition-all duration-300 border-b border-neutral-100 dark:border-neutral-800 ${isCollapsed ? 'h-16 items-center px-2' : 'h-24 items-center px-6'}`}>
                <div className="flex flex-col items-center gap-0.5 overflow-hidden w-full">
                    <span className="font-montserrat font-extrabold text-neutral-900 dark:text-white text-lg tracking-tighter whitespace-nowrap">
                        {isCollapsed ? 'G4' : 'GRUPO C4'}
                    </span>
                    {!isCollapsed && (
                        <div className="scale-75 opacity-80">
                            <DigitalClock />
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {filteredItems.map((item) => (
                    <button
                        key={item.path}
                        onClick={() => {
                            navigate(item.path);
                            setIsMobileOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-c4 transition-all duration-200 group relative
              ${isActive(item.path)
                                ? 'bg-brand-coral text-white shadow-lg shadow-brand-coral/20'
                                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                            }`}
                        title={isCollapsed ? item.label : ''}
                    >
                        <item.icon size={20} className={`min-w-[20px] ${isActive(item.path) ? 'text-white' : (item as any).isIA ? 'text-brand-coral' : ''}`} />
                        {!isCollapsed && (
                            <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                                {item.label}
                            </span>
                        )}

                        {/* Tooltip for collapsed mode */}
                        {isCollapsed && (
                            <div className="absolute left-full ml-4 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-neutral-800 shadow-xl">
                                {item.label}
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {/* Collapse Toggle (Desktop only) */}
            <div className="hidden lg:block p-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                    onClick={toggleCollapse}
                    className="w-full flex items-center justify-center p-2 rounded-c4 bg-neutral-50 dark:bg-neutral-850 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                >
                    {isCollapsed ? <ChevronRight size={18} /> : (
                        <div className="flex items-center gap-2">
                            <ChevronLeft size={18} />
                            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Recolher</span>
                        </div>
                    )}
                </button>
            </div>

            {/* User Info / Profile Section */}
            <div className="p-4 border-t border-neutral-100 dark:border-neutral-800">
                <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                    <button
                        onClick={() => navigate('/account')}
                        className={`flex items-center gap-3 p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group ${isCollapsed ? '' : 'flex-1'}`}
                        title={isCollapsed ? fullName || 'Minha Conta' : ''}
                    >
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-neutral-200 dark:border-neutral-700" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-brand-coral/10 text-brand-coral flex items-center justify-center text-xs font-bold border border-brand-coral/20">
                                {getUserInitials()}
                            </div>
                        )}
                        {!isCollapsed && (
                            <div className="text-left overflow-hidden">
                                <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">{fullName || 'Usuário'}</p>
                                <p className="text-[10px] text-neutral-500 uppercase font-black tracking-widest leading-tight">Configurações</p>
                            </div>
                        )}
                    </button>

                    {!isCollapsed && (
                        <button
                            onClick={handleLogout}
                            className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                            title="Sair"
                        >
                            <LogOut size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden lg:block sticky top-0 h-screen z-40">
                {SidebarContent}
            </aside>

            {/* Mobile Drawer */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsMobileOpen(false)}
            >
                <div
                    className={`absolute left-0 top-0 h-full w-72 transform transition-transform duration-300 ease-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="h-full relative">
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="absolute right-[-48px] top-4 p-2 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-white rounded-r-lg border-y border-r border-neutral-200 dark:border-neutral-800 shadow-xl"
                        >
                            <X size={24} />
                        </button>
                        <div className="h-full">
                            {SidebarContent}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
