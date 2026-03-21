import React from 'react';

interface HeroProps {
  companyName?: string;
  responsibleName?: string;
  createdAt?: string;
  contractDuration?: number;
  services?: { id: string; price: number }[] | string[];
}

const Hero: React.FC<HeroProps> = ({
  companyName = "Amplexo Diesel Service",
  responsibleName = "Marcos Fachinetto",
  createdAt,
  contractDuration = 6,
  services = []
}) => {
  const displayDate = createdAt
    ? new Date(createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Normalize services
  const serviceIds = Array.isArray(services)
    ? services.map((s: any) => typeof s === 'string' ? s : s.id)
    : [];

  const hasTraffic = serviceIds.includes('traffic_management');
  const hasSiteOrLP = serviceIds.includes('website') || serviceIds.includes('landing_page') || serviceIds.includes('ecommerce');
  const hasAIAgents = serviceIds.includes('ai_agents');

  const pillars: string[] = [];
  if (hasTraffic) pillars.push('anúncios segmentados no Google Ads e Meta Ads');
  if (hasSiteOrLP) pillars.push('criação de Landing Pages de Alta Performance e Sites');
  if (hasAIAgents) pillars.push('implementação de Agentes de IA');

  const joinPillars = (items: string[]) => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} e ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  };

  let introText = "";
  if (pillars.length > 0) {
    introText = `Esta proposta apresenta uma estratégia integrada de crescimento, combinando ${joinPillars(pillars)} para acelerar vendas, fortalecer a autoridade digital e gerar resultados exponenciais para a sua empresa.`;
  } else {
    introText = "Esta proposta apresenta soluções estratégicas personalizadas para o crescimento do seu negócio no ambiente digital.";
  }

  return (
    <section className="relative overflow-hidden bg-white py-16 lg:py-24">
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[600px] h-[600px] bg-brand-coral/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-blue-50 rounded-full blur-3xl"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-coral/10 text-brand-coral text-xs font-bold uppercase tracking-widest mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-coral opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-coral"></span>
            </span>
            Proposta de Performance Digital
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] mb-8">
            Escalando os Resultados da <span className="text-brand-coral">{companyName}</span>
          </h1>

          <div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center text-slate-600 mb-12">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold mb-1 opacity-50">Para:</p>
              <p className="text-lg font-semibold text-slate-800">{responsibleName}</p>
            </div>
            <div className="w-px h-12 bg-slate-200 hidden sm:block"></div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold mb-1 opacity-50">Data:</p>
              <p className="text-lg font-semibold text-slate-800">{displayDate}</p>
            </div>
            <div className="w-px h-12 bg-slate-200 hidden sm:block"></div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold mb-1 opacity-50">Vigência:</p>
              <p className="text-lg font-semibold text-slate-800">{contractDuration} Meses</p>
            </div>
          </div>

          <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mb-10">
            {introText}
          </p>
        </div>
      </div>
    </section>
  );
};

export default Hero;
