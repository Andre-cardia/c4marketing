import React from 'react';

interface PricingProps {
  monthlyFee?: number;
  setupFee?: number;
  mediaLimit?: number;
  contractDuration?: number;
}

const Pricing: React.FC<PricingProps> = ({
  monthlyFee = 2500,
  setupFee = 700,
  mediaLimit = 5000,
  contractDuration = 6
}) => {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const monthlyFeeFormatted = formatCurrency(monthlyFee);
  const [currencySymbol, amount] = monthlyFeeFormatted.split(/\s(.+)/);
  const [mainAmount, centAmount] = amount.split(',');

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
                Nossa remuneração é justa e focada em resultados. O valor de agência cobre a gestão de mídia paga para investimentos de até {formatCurrency(mediaLimit)} mensais nas plataformas.
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
                    <p className="text-sm text-slate-400">Contrato inicial de {contractDuration} meses para maturação das estratégias.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-3xl p-8 lg:p-12 shadow-2xl relative">
              <div className="absolute -top-6 right-8 bg-brand-coral text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">
                Performance
              </div>

              <div className="mb-8">
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-2">Mensalidade Fixa</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black font-montserrat">{currencySymbol} {mainAmount}<span className="text-lg font-medium">,{centAmount}</span></span>
                  <span className="text-slate-500 font-medium">/mês</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">Valor integral de agência para gestão estratégica.</p>
              </div>

              <div className="border-t border-slate-100 pt-8 mb-8 space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Gestão de Canais (Google + Meta)</span>
                  <span className="font-bold text-green-600">Incluso</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Otimização Semanal</span>
                  <span className="font-bold text-green-600">Incluso</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Relatórios de Métricas</span>
                  <span className="font-bold text-green-600">Incluso</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Teto de Mídia Gerenciada</span>
                  <span className="font-bold">{formatCurrency(mediaLimit)}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center">
                  <span className="font-bold text-slate-700">Landing Page (Setup)</span>
                  <span className="font-bold text-brand-coral">{formatCurrency(setupFee)}</span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Pagamento</p>
                  <p className="text-slate-700 font-semibold">Boleto ou PIX</p>
                  <p className="text-xs text-brand-coral font-bold mt-1">Vencimento mensal recorrente</p>
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
