import React from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserRole } from '../lib/UserRoleContext';
import { useTheme } from '../lib/ThemeContext';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userRole, loading, fullName, avatarUrl, email } = useUserRole();
  const { darkMode, setDarkMode } = useTheme();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const getUserInitials = () => {
    if (fullName) {
      const names = fullName.split(' ');
      if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase();
      return names[0].substring(0, 2).toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U';
  };

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/dashboard')}>
          <img src="/logo.png" alt="C4 Marketing" className="h-8 dark:brightness-0 dark:invert" />
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <h1 className="font-bold text-slate-700 dark:text-slate-300 text-sm tracking-wide">DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className={`text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            Dashboard
          </button>

          {/* Propostas - only for gestor and comercial */}
          {!loading && (userRole === 'gestor' || userRole === 'comercial') && (
            <button
              onClick={() => navigate('/proposals')}
              className={`text-sm font-medium transition-colors ${location.pathname.startsWith('/proposals') ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Propostas
            </button>
          )}

          <button
            onClick={() => navigate('/projects')}
            className={`text-sm font-medium transition-colors ${location.pathname.startsWith('/projects') ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            Projetos
          </button>

          {/* Usuários - only for gestor */}
          {!loading && userRole === 'gestor' && (
            <button
              onClick={() => navigate('/users')}
              className={`text-sm font-medium transition-colors ${location.pathname.startsWith('/users') ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Usuários
            </button>
          )}

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

          {/* User Profile */}
          <div
            onClick={() => navigate('/account')}
            className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded-full pr-3 transition-colors group"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-600"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-coral/10 text-brand-coral flex items-center justify-center text-xs font-bold border border-brand-coral/20">
                {getUserInitials()}
              </div>
            )}
            <span className="hidden md:block text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-brand-coral">
              {fullName || email?.split('@')[0] || 'Minha Conta'}
            </span>
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="text-slate-400 hover:text-brand-coral p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            title={darkMode ? "Modo Claro" : "Modo Escuro"}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-500 p-2 rounded-full transition-colors"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
