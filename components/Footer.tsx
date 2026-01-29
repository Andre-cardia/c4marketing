
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
              <img src="/logo.png" alt="C4 Marketing" className="h-12" />
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

          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-slate-100 gap-4">
          <p className="text-xs text-slate-400">© 2025 C4 Marketing - HAC Assessoria e Consultoria LTDA (CNPJ 24.043.876/0001-83)</p>
          <div className="flex gap-6 text-xs text-slate-400">
            <a href="https://c4marketing.com.br/politicas-de-privacidade/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-coral">Termos de Uso</a>
            <a href="https://c4marketing.com.br/politicas-de-privacidade/" target="_blank" rel="noopener noreferrer" className="hover:text-brand-coral">Privacidade</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
