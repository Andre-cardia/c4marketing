
import React from 'react';
import {
  getWebsiteDeliveryTimelineClause,
  normalizeWebsiteDeliveryTimeline,
  WEBSITE_MAX_LAYOUT_REVISIONS,
} from '../lib/contractTerms';

interface ContractDetailsProps {
  services?: { id: string; price: number; details?: string; deliveryTimeline?: string; paymentTerms?: string; recurringPrice?: number; setupPrice?: number }[] | string[];
}

const ContractDetails: React.FC<ContractDetailsProps> = ({ services = [] }) => {

  // Normalize services
  const normalizedServices = Array.isArray(services)
    ? services.map((s: any) => typeof s === 'string' ? { id: s, price: 0 } : s)
    : [];
  const serviceIds = normalizedServices.map((service: any) => service.id);

  const hasRecurring = serviceIds.includes('traffic_management') || serviceIds.includes('hosting') || serviceIds.includes('ai_agents');
  const hasOneTime = serviceIds.includes('website') || serviceIds.includes('landing_page') || serviceIds.includes('ecommerce') || serviceIds.includes('consulting') || serviceIds.includes('ai_agents');
  const hasWebsite = serviceIds.includes('website');
  const websiteService = normalizedServices.find((service: any) => service.id === 'website');
  const websiteDeliveryTimeline = normalizeWebsiteDeliveryTimeline(websiteService?.deliveryTimeline);

  // Calculate specific deadlines
  const deadlines: string[] = [];
  if (serviceIds.includes('landing_page')) deadlines.push("Landing Page: 7 dias úteis");
  if (serviceIds.includes('website')) deadlines.push(`Web Site: ${websiteDeliveryTimeline || 'prazo definido na proposta e no detalhamento do serviço'}`);
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
      title: "Vigência e Rescisão",
      content: "A vigência contratual segue o prazo definido na proposta. Em caso de rescisão antecipada durante a vigência, pode haver multa equivalente a 50% do saldo remanescente, salvo acordo expresso entre as partes, além do faturamento proporcional do que já tiver sido executado.",
      show: true
    },
    {
      title: "Encerramento Contratual",
      content: "Após o período de vigência, o encerramento pode ocorrer com aviso prévio de 30 dias, sem prejuízo das cláusulas que permanecem válidas após a rescisão.",
      show: true
    },
    {
      title: "Propriedade Intelectual",
      content: "Após a quitação integral, materiais desenvolvidos sob encomenda passam a ser da CONTRATANTE. Metodologia, know-how e estruturas proprietárias da agência permanecem protegidos.",
      show: hasOneTime
    },
    {
      title: "Prazos de Entrega (Projetos)",
      content: hasWebsite
        ? `${deadlineText} ${getWebsiteDeliveryTimelineClause(websiteDeliveryTimeline)} O projeto inclui até ${WEBSITE_MAX_LAYOUT_REVISIONS} rodadas de ajustes e revisões no layout.`
        : deadlineText,
      show: hasOneTime
    },
    {
      title: "Acessos e Migração",
      content: "Para websites, a CONTRATADA deve disponibilizar acessos administrativos, arquivos, banco de dados e backups necessários para gestão ou migração, inclusive em caso de rescisão, em até 5 dias úteis.",
      show: hasWebsite
    },
    {
      title: "Uso de Marca",
      content: "A C4 somente poderá divulgar a marca ou os trabalhos realizados para a CONTRATANTE com autorização prévia e expressa. O cliente pode solicitar a remoção imediata de qualquer conteúdo divulgado.",
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
