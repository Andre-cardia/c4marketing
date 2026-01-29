
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-40 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center">
           <img src="/logo.png" alt="C4 Marketing" className="h-14" />
        </div>
        
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#services" className="hover:text-brand-coral transition-colors">Serviços</a>
          <a href="#pricing" className="hover:text-brand-coral transition-colors">Investimento</a>
          <a href="#contract" className="hover:text-brand-coral transition-colors">Termos</a>
          <a href="https://c4marketing.com.br" target="_blank" className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Ver Site</a>
        </nav>
      </div>
    </header>
  );
};

export default Header;
