
import React, { useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Services from './components/Services';
import Pricing from './components/Pricing';
import ContractDetails from './components/ContractDetails';
import Footer from './components/Footer';

const App: React.FC = () => {
  const [isAccepted, setIsAccepted] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-3 no-print">
        <button 
          onClick={handlePrint}
          className="bg-brand-dark text-white p-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-2 font-semibold"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          PDF / Imprimir
        </button>
        {!isAccepted && (
          <button 
            onClick={() => setIsAccepted(true)}
            className="bg-brand-coral text-white p-4 px-8 rounded-full shadow-2xl hover:bg-red-500 transition-colors font-bold text-lg"
          >
            Aceitar Proposta
          </button>
        )}
      </div>

      <Header />
      
      <main className="flex-grow">
        <Hero />
        
        <div id="services">
          <Services />
        </div>

        <div id="pricing">
          <Pricing />
        </div>

        <div id="contract">
          <ContractDetails />
        </div>
      </main>

      <Footer isAccepted={isAccepted} />

      {isAccepted && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Proposta Aceita!</h2>
            <p className="text-slate-600 mb-8">Obrigado pela confiança, Marcos Fachinetto. Nossa equipe entrará em contato em breve para iniciar o briefing.</p>
            <button 
              onClick={() => setIsAccepted(false)}
              className="bg-brand-dark text-white px-8 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-colors w-full"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
