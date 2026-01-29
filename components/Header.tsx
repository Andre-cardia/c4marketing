
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-40 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center">
          {/* Logo C4 Marketing reconstruída em SVG para garantir carregamento */}
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-3">
              {/* Ícone do Funil */}
              <svg width="42" height="34" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="mt-1">
                <path d="M5 10H95L88 22H12L5 10Z" fill="#F06C6C" />
                <path d="M18 28H82L76 40H24L18 28Z" fill="#F06C6C" fillOpacity="0.85" />
                <path d="M31 46H69L64 58H36L31 46Z" fill="#F06C6C" fillOpacity="0.7" />
                <path d="M43 64H57L54 76H46L43 64Z" fill="#F06C6C" fillOpacity="0.5" />
              </svg>
              
              {/* Texto C4 */}
              <svg width="80" height="34" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <text x="0" y="65" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="70" fill="#0F2A3D">C4</text>
                 <rect x="75" y="45" width="20" height="12" fill="#0F2A3D" />
              </svg>
            </div>
            {/* Subtítulo MARKETING */}
            <div className="text-[#0F2A3D] font-bold text-[10px] tracking-[0.45em] ml-[3.4rem] -mt-1 font-montserrat uppercase leading-none">
              Marketing
            </div>
          </div>
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
