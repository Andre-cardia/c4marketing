
import React from 'react';

interface ContractDetailsProps {
  services?: { id: string; price: number }[] | string[];
}

const ContractDetails: React.FC<ContractDetailsProps> = ({ services = [] }) => {

  // Normalize services
  const serviceIds = Array.isArray(services)
    ? services.map((s: any) => typeof s === 'string' ? s : s.id)
    : [];

  const hasRecurring = serviceIds.includes('traffic_management') || serviceIds.includes('hosting') || serviceIds.includes('ai_agents');
  const hasOneTime = serviceIds.includes('website') || serviceIds.includes('landing_page') || serviceIds.includes('ecommerce') || serviceIds.includes('consulting') || serviceIds.includes('ai_agents');

  // Calculate specific deadlines
  const deadlines: string[] = [];
  if (serviceIds.includes('landing_page')) deadlines.push("Landing Page: 7 dias úteis");
  if (serviceIds.includes('website')) deadlines.push("Web Site: 30 dias úteis");
  if (serviceIds.includes('ecommerce')) deadlines.push("E-commerce: 60 dias úteis");
  if (serviceIds.includes('ai_agents')) deadlines.push("Agentes de IA (setup): até 15 dias úteis");

  const deadlineText = deadlines.length > 0
    ? `Prazos estimados após recebimento do material: ${deadlines.join('; ')}.`
    : "O prazo de entrega inicia-se após o recebimento de todo o material (briefing, textos e imagens) por parte do cliente.";

  const clauses = [
    {
      title: "Responsabilidades",
      content: "O cliente deve fornecer dados, logos, senhas e informações necessárias. A C4 Marketing não se responsabiliza pelo conteúdo bruto enviado ou normas infringidas pelo cliente nas plataformas.",
      show: true
    },
    {
      title: "Prazos e Fidelidade",
      content: "O contrato tem prazo de 6 meses para serviços recorrentes. Rescisão antecipada implica em multa de 50% sobre o valor restante das parcelas mensais.",
      show: hasRecurring
    },
    {
      title: "Cancelamento de Recorrência",
      content: "Após o período de fidelidade, cancelamento livre com aviso prévio de 15 dias. Arrependimento em até 7 dias úteis gera reembolso dos valores de agência.",
      show: hasRecurring
    },
    {
      title: "Propriedade Intelectual",
      content: "Para desenvolvimento de sites e LPs, após a quitação integral, o cliente detém os direitos de uso do layout e código. Estratégias de campanhas permanecem propriedade intelectual da agência.",
      show: hasOneTime
    },
    {
      title: "Prazos de Entrega (Projetos)",
      content: deadlineText,
      show: hasOneTime
    },
    {
      title: "Confidencialidade (LGPD)",
      content: "Ambas as partes se comprometem a manter o sigilo dos dados compartilhados conforme as leis vigentes de proteção de dados (LGPD).",
      show: true
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
          {clauses.filter(c => c.show).map((c, i) => (
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
