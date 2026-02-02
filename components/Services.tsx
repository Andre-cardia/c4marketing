
import React from 'react';
import { Layout, LineChart, ShoppingCart, Users, Globe } from 'lucide-react';

interface ServicesProps {
  services?: { id: string; price: number }[] | string[];
}

const Services: React.FC<ServicesProps> = ({ services = ['traffic_management'] }) => {
  // Normalize input to array of IDs for easier checking
  const serviceIds = Array.isArray(services)
    ? services.map((s: any) => typeof s === 'string' ? s : s.id)
    : [];

  const hasService = (id: string) => serviceIds.includes(id);

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
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Confira os detalhes dos serviços selecionados para o seu crescimento.</p>
        </div>

        {/* Traffic Management Section */}
        {hasService('traffic_management') && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                <LineChart className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 text-center">Gestão de Tráfego</h3>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 mb-12">
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

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h4 className="text-xl font-bold mb-6">O que está incluído na gestão:</h4>
              <div className="grid md:grid-cols-2 gap-4">
                {coreWork.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-slate-700">
                    <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Landing Page */}
          {hasService('landing_page') && (
            <div className="bg-brand-dark rounded-3xl p-8 text-white relative overflow-hidden flex flex-col justify-center min-h-[300px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-coral opacity-20 -mr-16 -mt-16 rounded-full"></div>
              <div className="bg-brand-coral/20 w-12 h-12 flex items-center justify-center rounded-xl mb-6 text-brand-coral">
                <Layout className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-4">
                Landing Page Premium
              </h3>
              <p className="text-slate-300 mb-6 leading-relaxed">
                Desenvolvemos 1 página de alta conversão focada no produto ou serviço principal, otimizada para dispositivos móveis e com copy persuasivo.
              </p>
              <div className="mt-auto pt-4 border-t border-white/10">
                <span className="text-xs text-slate-400 block mb-1">Item Adicional</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-brand-coral font-montserrat">Incluso</span>
                </div>
              </div>
            </div>
          )}

          {/* Website */}
          {hasService('website') && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col">
              <div className="bg-blue-50 w-12 h-12 flex items-center justify-center rounded-xl mb-6 text-blue-600">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Web Site Institucional
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Site completo com múltiplas páginas (Home, Sobre, Serviços, Contato), blog integrado e painel administrativo. Design exclusivo e otimizado para SEO.
              </p>
              <div className="mt-auto pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 block mb-1">Status</span>
                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Selecionado</span>
              </div>
            </div>
          )}

          {/* E-commerce */}
          {hasService('ecommerce') && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col">
              <div className="bg-purple-50 w-12 h-12 flex items-center justify-center rounded-xl mb-6 text-purple-600">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                E-commerce Completo
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Loja virtual integrada com meios de pagamento e logística. Cadastro de produtos ilimitado, gestão de estoque e área do cliente.
              </p>
              <div className="mt-auto pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 block mb-1">Status</span>
                <span className="text-sm font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">Selecionado</span>
              </div>
            </div>
          )}

          {/* Consulting */}
          {hasService('consulting') && (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col">
              <div className="bg-amber-50 w-12 h-12 flex items-center justify-center rounded-xl mb-6 text-amber-600">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Consultoria de Mkt & Vendas
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Acompanhamento estratégico, definição de processos comerciais, treinamento de equipe e análise profunda de métricas de crescimento.
              </p>
              <div className="mt-auto pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 block mb-1">Status</span>
                <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Selecionado</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </section>
  );
};

export default Services;
