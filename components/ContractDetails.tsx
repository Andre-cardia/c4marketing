
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

        </div>
      </div>
    </section>
  );
};

export default ContractDetails;
