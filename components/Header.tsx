import React from 'react';
import { LogOut, Moon, Sun, Menu as MenuIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserRole } from '../lib/UserRoleContext';
import { useTheme } from '../lib/ThemeContext';
import DigitalClock from './DigitalClock';

interface HeaderProps {
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { loading, fullName, avatarUrl, email } = useUserRole();
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
    <header className="bg-transparent sticky top-0 z-40 transition-all duration-200">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-slate-500 dark:text-neutral-400 hover:text-brand-coral transition-colors"
          >
            <MenuIcon size={24} />
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">

          <div className="flex items-center gap-1">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="text-slate-400 dark:text-neutral-500 hover:text-brand-coral p-2 rounded-full hover:bg-slate-100 dark:hover:bg-neutral-800 transition-all"
              title={darkMode ? "Modo Claro" : "Modo Escuro"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              onClick={handleLogout}
              className="text-slate-500 dark:text-neutral-500 hover:text-red-500 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
