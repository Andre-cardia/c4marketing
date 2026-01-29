
import React from 'react';

const Services: React.FC = () => {
  const platforms = [
    {
      name: "Google Ads",
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C9.03,19.27 6.48,16.68 6.48,13.5C6.48,10.31 9.03,7.74 12.19,7.74C13.9,7.74 15.6,8.36 16.67,9.43L18.83,7.27C17.49,5.93 15.15,5 12.19,5C7.5,5 3.75,8.81 3.75,13.5C3.75,18.19 7.5,22 12.19,22C17.43,22 21.5,18.12 21.5,12.5C21.5,11.97 21.44,11.53 21.35,11.1Z" />
        </svg>
      ),
      channels: ["Rede de Pesquisa (Search)", "Display", "Google Meu Negócio", "YouTube"],
      description: "Capturamos a demanda de quem já está procurando pelo seu serviço."
    },
    {
      name: "Meta Ads",
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3h-2.5v6.8c4.56-.93 8-4.96 8-9.8z" />
        </svg>
      ),
      channels: ["Facebook Ads", "Instagram Ads"],
      description: "Geramos desejo e autoridade interrompendo a navegação do seu público ideal."
    }
  ];

  const coreWork = [
    "Criação de novas campanhas",
    "Otimização constante de lances e CTR",
    "Acompanhamento e monitoramento diário",
    "Suporte prioritário em horário comercial",
    "Relatórios mensais de performance (ROAS, CPC, CPA)",
    "Implementação em até 5 dias úteis pós-briefing"
  ];

  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl mb-4">Escopo do Projeto</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Tudo que sua empresa precisa para dominar os canais digitais de forma estratégica e lucrativa.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-16">
          {platforms.map((p, idx) => (
            <div key={idx} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-brand-coral/10 text-brand-coral p-3 rounded-2xl">
                  {p.icon}
                </div>
                <h3 className="text-2xl font-bold">{p.name}</h3>
              </div>
              <p className="text-slate-600 mb-6">{p.description}</p>
              <div className="flex flex-wrap gap-2">
                {p.channels.map((c, i) => (
                  <span key={i} className="bg-slate-50 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold border border-slate-200">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-brand-dark text-white flex items-center justify-center text-sm">01</span>
              Gestão de Tráfego 360º
            </h3>
            <ul className="space-y-4">
              {coreWork.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-700">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="order-1 md:order-2 bg-brand-dark rounded-3xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-coral opacity-20 -mr-16 -mt-16 rounded-full"></div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-white text-brand-dark flex items-center justify-center text-sm font-bold">02</span>
              Landing Page Premium
            </h3>
            <p className="text-slate-300 mb-6 leading-relaxed">
              Desenvolvemos 1 página de alta conversão focada no produto ou serviço principal, otimizada para dispositivos móveis e com copy persuasivo para maximizar o retorno das campanhas.
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">Investimento Único:</span>
              <span className="text-2xl font-bold text-brand-coral font-montserrat">R$ 700,00</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Services;
