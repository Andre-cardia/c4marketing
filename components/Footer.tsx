
import React from 'react';

interface FooterProps {
  isAccepted: boolean;
}

const Footer: React.FC<FooterProps> = ({ isAccepted }) => {
  return (
    <footer className="bg-white py-12 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12 mb-12">
          <div className="max-w-xs">
            <div className="flex items-center mb-6">
              {/* Logo C4 Marketing reconstruída em SVG para o rodapé */}
              <div className="flex flex-col justify-center scale-90 origin-left">
                <div className="flex items-center gap-3">
                  <svg width="42" height="34" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="mt-1">
                    <path d="M5 10H95L88 22H12L5 10Z" fill="#F06C6C" />
                    <path d="M18 28H82L76 40H24L18 28Z" fill="#F06C6C" fillOpacity="0.85" />
                    <path d="M31 46H69L64 58H36L31 46Z" fill="#F06C6C" fillOpacity="0.7" />
                    <path d="M43 64H57L54 76H46L43 64Z" fill="#F06C6C" fillOpacity="0.5" />
                  </svg>
                  
                  <svg width="80" height="34" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                     <text x="0" y="65" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="70" fill="#0F2A3D">C4</text>
                     <rect x="75" y="45" width="20" height="12" fill="#0F2A3D" />
                  </svg>
                </div>
                <div className="text-[#0F2A3D] font-bold text-[10px] tracking-[0.45em] ml-[3.4rem] -mt-1 font-montserrat uppercase leading-none opacity-90">
                  Marketing
                </div>
              </div>
            </div>
            <p className="text-slate-500 text-sm">
              Expertise em performance e aceleração de negócios através de mídia paga e tecnologia.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:gap-16">
            <div className="space-y-4">
              <h5 className="font-bold text-xs uppercase tracking-widest text-slate-400">Contato</h5>
              <p className="text-sm text-slate-600">comercial@c4marketing.com.br</p>
              <p className="text-sm text-slate-600">Florianópolis, SC</p>
            </div>
            <div className="space-y-4 text-right print-only">
               <h5 className="font-bold text-xs uppercase tracking-widest text-slate-400">Assinatura Amplexo Diesel Service</h5>
               <div className="h-10 border-b border-slate-300 w-48 ml-auto"></div>
               <p className="text-[10px] text-slate-400">Marcos Fachinetto</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-slate-100 gap-4">
          <p className="text-xs text-slate-400">© 2025 C4 Marketing - HAC Assessoria e Consultoria LTDA (CNPJ 24.043.876/0001-83)</p>
          <div className="flex gap-6 text-xs text-slate-400">
            <a href="#" className="hover:text-brand-coral">Termos de Uso</a>
            <a href="#" className="hover:text-brand-coral">Privacidade</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
