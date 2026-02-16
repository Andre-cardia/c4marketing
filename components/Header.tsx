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
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/dashboard')}>
          <img src="/logo.png" alt="C4 Marketing" className="h-8 dark:brightness-0 dark:invert" />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className={`text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            Dashboard
          </button>

          {/* AI Manager - only for gestor */}
          {/* AI Tools Dropdown - only for gestor */}
          {!loading && userRole === 'gestor' && (
            <div className="relative group">
              <button
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${location.pathname === '/ai-agent' || location.pathname === '/brain'
                    ? 'text-brand-coral'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                <div className="p-0.5 rounded bg-gradient-to-br from-indigo-500 to-purple-600 text-white w-5 h-5 flex items-center justify-center font-bold text-[10px]">AI</div>
                AI Tools
              </button>

              <div className="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 min-w-[240px]">
                  <button
                    onClick={() => navigate('/ai-agent')}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 ${location.pathname === '/ai-agent' ? 'text-brand-coral bg-slate-50 dark:bg-slate-800' : 'text-slate-700 dark:text-slate-300'
                      }`}
                  >
                    <div className="p-1 rounded bg-gradient-to-br from-indigo-500 to-purple-600 text-white w-6 h-6 flex items-center justify-center font-bold text-[10px] shadow-sm">AI</div>
                    <div>
                      <span className="block font-medium">AI Manager</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Gestão Estratégica</span>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/brain')}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 ${location.pathname === '/brain' ? 'text-brand-coral bg-slate-50 dark:bg-slate-800' : 'text-slate-700 dark:text-slate-300'
                      }`}
                  >
                    <div className="p-1 rounded bg-slate-800 text-white w-6 h-6 flex items-center justify-center font-bold text-[10px] shadow-sm">🧠</div>
                    <div>
                      <span className="block font-medium">Fale com o Cérebro</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Segundo Cérebro</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Comercial Dropdown - only for gestor */}
          {!loading && userRole === 'gestor' && (
            <div className="relative group">
              <button
                className={`text-sm font-medium transition-colors ${location.pathname.startsWith('/proposals') || location.pathname.startsWith('/commercial-dashboard') ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                Comercial
              </button>
              <div className="absolute left-0 top-full pt-1 hidden group-hover:block z-50">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 min-w-[180px]">
                  <button
                    onClick={() => navigate('/proposals')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-coral transition-colors"
                  >
                    Propostas
                  </button>
                  <button
                    onClick={() => navigate('/commercial-dashboard')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-coral transition-colors"
                  >
                    Dashboard Comercial
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/projects')}
            className={`text-sm font-medium transition-colors ${location.pathname.startsWith('/projects') ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            Projetos
          </button>

          {/* Dropdown Compromissos */}
          <div className="relative group">
            <button
              className={`text-sm font-medium transition-colors ${location.pathname.startsWith('/meetings') ? 'text-brand-coral' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Compromissos
            </button>
            <div className="absolute left-0 top-full pt-1 hidden group-hover:block z-50">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 min-w-[140px]">
                <button
                  onClick={() => navigate('/meetings')}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-coral transition-colors"
                >
                  Agenda
                </button>
                <a
                  href="https://www.microsoft.com/pt-br/microsoft-365/outlook/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-coral transition-colors"
                >
                  Outlook
                </a>
              </div>
            </div>
          </div>

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
