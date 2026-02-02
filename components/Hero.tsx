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

  let introText = "";
  if (hasTraffic && hasSiteOrLP) {
    introText = "Esta proposta apresenta a estratégia completa de aceleração de vendas, combinando autoridade digital através de uma nova presença web e anúncios segmentados no Google e Meta.";
  } else if (hasTraffic) {
    introText = "Esta proposta apresenta a estratégia de aceleração de vendas e autoridade digital através de anúncios segmentados no Google e Meta, além de uma estrutura otimizada de conversão.";
  } else if (hasSiteOrLP) {
    introText = "Esta proposta apresenta o projeto de desenvolvimento da sua nova presença digital, focada em design premium, alta performance e otimização para conversão de visitantes em clientes.";
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
