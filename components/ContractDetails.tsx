
import React from 'react';

const ContractDetails: React.FC = () => {
  const clauses = [
    {
      title: "Prazos e Fidelidade",
      content: "O contrato tem prazo de 6 meses. Rescisão antecipada pelo cliente implica em multa de 50% sobre o valor restante das parcelas."
    },
    {
      title: "Responsabilidades",
      content: "O cliente deve fornecer dados, logos, senhas e informações necessárias. A C4 Marketing não se responsabiliza pelo conteúdo bruto enviado ou normas infringidas pelo cliente nas plataformas."
    },
    {
      title: "Cancelamento",
      content: "Após o período de fidelidade, cancelamento livre com aviso prévio de 15 dias. Arrependimento em até 7 dias úteis gera reembolso dos valores de agência."
    },
    {
      title: "Confidencialidade (LGPD)",
      content: "Ambas as partes se comprometem a manter o sigilo dos dados compartilhados conforme as leis vigentes de proteção de dados (LGPD)."
    }
  ];

  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Cláusulas Importantes</h2>
          <p className="text-slate-600">Transparência total sobre as diretrizes da nossa parceria.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {clauses.map((c, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200">
              <h4 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-brand-coral rounded-full"></span>
                {c.title}
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">{c.content}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="max-w-md">
            <h3 className="text-xl font-bold mb-2">Dados para Pagamento</h3>
            <p className="text-slate-600 text-sm">
              <span className="font-bold">Banco:</span> C6 Bank (0001) | <span className="font-bold">C/C:</span> 19500371-3 <br />
              <span className="font-bold">Titular:</span> C4 Marketing (HAC Assessoria) <br />
              <span className="font-bold">PIX:</span> pix@c4marketing.com.br
            </p>
          </div>
          <div className="flex-shrink-0">
             <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-200">
                <svg className="w-5 h-5 text-brand-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04 inter-2 2 0 00-1.382.723 11.958 11.958 0 00-2.028 9.213c.421 2.501 1.624 4.78 3.39 6.556a11.952 11.952 0 008.618 3.518 11.952 11.952 0 008.618-3.518c1.766-1.776 2.969-4.055 3.39-6.556a11.958 11.958 0 00-2.028-9.213 2 2 0 00-1.382-.723z" />
                </svg>
                <span className="text-xs font-bold uppercase text-slate-500 tracking-tighter">Assinatura Digital Válida (MP 2.200-2/2001)</span>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContractDetails;
