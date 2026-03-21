
import React from 'react';

interface PricingProps {
  services?: { id: string; price: number; recurringPrice?: number; setupPrice?: number }[] | string[];
}

const Pricing: React.FC<PricingProps> = ({
  services = []
}) => {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Helper to normalize services input
  const normalizedServices = Array.isArray(services)
    ? services.map(s => typeof s === 'string' ? { id: s, price: 0, recurringPrice: 0, setupPrice: 0 } : s)
    : [];

  const recurringServiceIds = ['traffic_management', 'hosting', 'ai_agents'];
  const isRecurringService = (serviceId: string) => recurringServiceIds.includes(serviceId);

  const getRecurringAmount = (service: { id: string; price: number; recurringPrice?: number }) => {
    if (service.id === 'ai_agents') return service.recurringPrice || 0;
    return isRecurringService(service.id) ? service.price : 0;
  };

  const getSetupAmount = (service: { id: string; price: number; setupPrice?: number }) => {
    if (service.id === 'ai_agents') return service.setupPrice || 0;
    return isRecurringService(service.id) ? 0 : service.price;
  };

  // Calculate Recurring Total (Traffic + Hosting + AI Agents)
  const recurringServices = normalizedServices.filter(s => isRecurringService(s.id));
  const recurringTotal = recurringServices.reduce((acc, curr) => acc + getRecurringAmount(curr), 0);

  // Calculate One-Time Total (Website, LP, etc + AI Agents setup)
  const oneTimeServices = normalizedServices.filter(s => !isRecurringService(s.id) || s.id === 'ai_agents');
  const oneTimeTotal = oneTimeServices.reduce((acc, curr) => acc + getSetupAmount(curr), 0);

  const recurringFormatted = formatCurrency(recurringTotal);
  const [currencySymbol, amount] = recurringFormatted.split(/\s(.+)/);
  const safeAmount = amount || '0,00';
  const [mainAmount, centAmount] = safeAmount.split(',');

  const serviceLabels: Record<string, string> = {
    'traffic_management': 'Gestão de Tráfego',
    'hosting': 'Hospedagem',
    'landing_page': 'Landing Page',
    'website': 'Web Site',
    'ecommerce': 'E-commerce',
    'consulting': 'Consultoria',
    'ai_agents': 'Agentes de IA'
  };

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 rounded-[3rem] p-8 lg:p-16 text-white relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute bottom-0 right-0 w-1/3 h-1/2 bg-brand-coral opacity-10 blur-[100px]"></div>

          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black mb-6">Investimento Mensal em <span className="text-brand-coral">Alta Performance</span></h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                Nossa remuneração é justa e focada em resultados. Abaixo você encontra o detalhamento dos valores recorrentes e investimentos pontuais.
              </p>

              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-slate-800/50 p-6 rounded-3xl border border-slate-700">
                  <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-2xl flex items-center justify-center font-bold text-xl">
                    %
                  </div>
                  <div>
                    <h4 className="font-bold text-brand-coral">Compromisso C4</h4>
                    <p className="text-sm text-slate-400">Entrega garantida de landing page e setup de campanhas.</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-800/50 p-6 rounded-3xl border border-slate-700">
                  <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold">Ciclo de Renovação</h4>
                    <p className="text-sm text-slate-400">Contrato de fidelidade para maturação das estratégias.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-3xl p-8 lg:p-12 shadow-2xl relative">
              <div className="absolute -top-6 right-8 bg-brand-coral text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">
                Performance
              </div>

              <div className="mb-8">
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2">Mensalidade Total</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black font-montserrat">{currencySymbol} {mainAmount}<span className="text-lg font-medium">,{centAmount}</span></span>
                  <span className="text-slate-500 font-medium">/mês</span>
                </div>
                <div className="mt-4 space-y-2">
                  {recurringServices.length > 0 ? (
                    recurringServices.map(service => (
                      <div key={service.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <span className="text-slate-600 font-medium">
                          {service.id === 'ai_agents' ? 'Agentes de IA (Recorrência)' : (serviceLabels[service.id] || service.id)}
                        </span>
                        <span className="font-bold text-slate-900">{formatCurrency(getRecurringAmount(service))}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">Nenhum serviço recorrente selecionado.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-200">
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-700">Investimento Único (Setup & Projetos)</span>
                    <span className="font-bold text-brand-coral text-lg">{formatCurrency(oneTimeTotal)}</span>
                  </div>
                  <div className="space-y-1">
                    {oneTimeServices.length > 0 ? (
                      oneTimeServices.map(service => (
                        <div key={service.id} className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">
                            {service.id === 'ai_agents' ? 'Agentes de IA (Setup)' : (serviceLabels[service.id] || service.id)}
                          </span>
                          <span className="font-semibold text-slate-700">{formatCurrency(getSetupAmount(service))}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Nenhum projeto pontual selecionado.</p>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Pagamento</p>
                  <p className="text-slate-700 font-semibold">Boleto ou PIX</p>
                  <p className="text-xs text-brand-coral font-bold mt-1">1º pagamento: 7 dias úteis após o aceite</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
