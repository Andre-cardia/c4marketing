
import React from 'react';
import { LineChart, Layout, ShoppingCart, Users, Globe, Bot, CheckCircle2, Server, Cpu, MessageCircle } from 'lucide-react';
import { TRAFFIC_MANAGEMENT_CONFIG, AI_AGENTS_CONFIG, SERVICES_CONFIG } from '../lib/constants';
import { ServiceCard } from './ServiceCard';

interface ServicesProps {
  services?: { id: string; price: number; details?: string }[] | string[];
}

const Services: React.FC<ServicesProps> = ({ services = ['traffic_management'] }) => {
  // Normalize input to array of IDs for easier checking
  const serviceIds = Array.isArray(services)
    ? services.map((s: any) => typeof s === 'string' ? s : s.id)
    : [];

  const hasService = (id: string) => serviceIds.includes(id);

  const getServiceData = (id: string) => {
    if (!Array.isArray(services)) return null;
    return services.find((s: any) => (typeof s === 'string' ? s === id : s.id === id));
  };

  const platforms = TRAFFIC_MANAGEMENT_CONFIG.platforms;
  const coreWork = TRAFFIC_MANAGEMENT_CONFIG.coreWork;
  const trafficData = getServiceData('traffic_management');
  const showTraffic = hasService('traffic_management');

  const aiData = getServiceData('ai_agents');
  const showAiAgents = hasService('ai_agents');

  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl mb-4">Escopo do Projeto</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Confira os detalhes dos serviços selecionados para o seu crescimento.</p>
        </div>

        {/* Traffic Management Section - Managed separately due to custom layout */}
        {showTraffic && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                <LineChart className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 text-center">{TRAFFIC_MANAGEMENT_CONFIG.title}</h3>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 mb-12">
              {platforms.map((p, idx) => (
                <div key={idx} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-brand-coral/10 text-brand-coral p-3 rounded-2xl">
                      {/* We use SVG here directly because they are distinct logos */}
                      {p.name.includes("Google") ? (
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C9.03,19.27 6.48,16.68 6.48,13.5C6.48,10.31 9.03,7.74 12.19,7.74C13.9,7.74 15.6,8.36 16.67,9.43L18.83,7.27C17.49,5.93 15.15,5 12.19,5C7.5,5 3.75,8.81 3.75,13.5C3.75,18.19 7.5,22 12.19,22C17.43,22 21.5,18.12 21.5,12.5C21.5,11.97 21.44,11.53 21.35,11.1Z" />
                        </svg>
                      ) : (
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3h-2.5v6.8c4.56-.93 8-4.96 8-9.8z" />
                        </svg>
                      )}
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
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {coreWork.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-slate-700">
                    <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>

              {trafficData && (typeof trafficData !== 'string' && (trafficData as any).details) && (
                <div className="mt-6 p-5 bg-blue-50/50 rounded-2xl border border-blue-100/50 text-sm text-blue-900 italic">
                  <strong className="text-blue-600 block mb-1">Detalhamento Adicional da Gestão:</strong> {(trafficData as any).details}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Agents Section */}
        {showAiAgents && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8 justify-center">
              <div className="p-3 bg-brand-coral/10 text-brand-coral rounded-full">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 text-center">{AI_AGENTS_CONFIG.title}</h3>
            </div>
            <p className="text-center text-slate-500 mb-10 max-w-2xl mx-auto">
              Desenvolvemos agentes de inteligência artificial personalizados para atendimento, qualificação de leads e automação de processos, integrando NLP avançado com os sistemas e canais da sua empresa.
            </p>

            {/* Roadmap */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {AI_AGENTS_CONFIG.phases.map((phase) => (
                <div key={phase.number} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-brand-coral/10 text-brand-coral rounded-xl flex items-center justify-center font-black text-sm">
                      {phase.number}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm leading-tight">{phase.title}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">{phase.duration}</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {phase.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-coral mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Included Infrastructure */}
            <div className="bg-slate-900 rounded-3xl p-8 text-white">
              <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
                <Server className="w-5 h-5 text-brand-coral" />
                Infraestrutura e Manutenção Incluídas na Recorrência
              </h4>
              <div className="grid md:grid-cols-2 gap-3">
                {AI_AGENTS_CONFIG.included.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-slate-300 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-brand-coral mt-0.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              {aiData && typeof aiData !== 'string' && (aiData as any).details && (
                <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10 text-sm italic text-slate-300">
                  <strong className="text-brand-coral block mb-1">Detalhamento do Agente:</strong>
                  {(aiData as any).details}
                </div>
              )}
              <p className="mt-4 text-[11px] text-slate-500 italic">
                * Caso o volume de tokens ultrapasse o limite incluído (2M/mês), poderá ser necessário ajuste no valor mensal conforme demanda.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {SERVICES_CONFIG.filter(c => c.id !== 'ai_agents').map((config) => (
            hasService(config.id) && (
              <ServiceCard
                key={config.id}
                config={config}
                selectedService={getServiceData(config.id)}
              />
            )
          ))}
        </div>

      </div>
    </section>
  );
};

export default Services;
