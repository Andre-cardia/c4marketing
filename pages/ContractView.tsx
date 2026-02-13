import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Header from '../components/Header';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import logo from '../assets/logo.png';

interface Proposal {
    id: number;
    company_name: string;
    responsible_name: string;
    cnpj?: string; // Assuming we might have this from acceptance or just use placeholder
    cpf?: string;
    monthly_fee: number;
    setup_fee: number;
    contract_duration: number;
    created_at: string;
    services?: { id: string; price: number; details?: string }[] | string[];
    accepted_at?: string;
    is_legacy?: boolean;
}

interface ContractTemplate {
    id: string;
    service_id: string;
    title: string;
    content: string;
}

const ContractView: React.FC = () => {
    const { slug, id } = useParams<{ slug?: string; id?: string }>();
    const navigate = useNavigate();
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [templates, setTemplates] = useState<ContractTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchContractData();
    }, [slug]);

    const fetchContractData = async () => {
        try {
            let proposalData = null;
            let loadedTemplates: ContractTemplate[] = [];
            let acceptanceInfo = null;

            // CASE 1: Viewing via Acceptance ID (Snapshot or Linked Proposal)
            if (id) {
                const { data: acceptance, error: accError } = await supabase
                    .from('acceptances')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (accError) throw accError;
                acceptanceInfo = acceptance;

                if (acceptance.contract_snapshot) {
                    // Use Snapshot Data (Independent)
                    console.log('Using Contract Snapshot');
                    proposalData = acceptance.contract_snapshot.proposal;
                    loadedTemplates = acceptance.contract_snapshot.templates || [];

                    // Override with accurate acceptance data just in case
                    if (proposalData) {
                        proposalData.accepted_at = acceptance.timestamp;
                    }

                } else if (acceptance.proposal_id) {
                    // Fallback to Live Proposal (for old records)
                    const { data: liveProposal, error: propError } = await supabase
                        .from('proposals')
                        .select('*')
                        .eq('id', acceptance.proposal_id)
                        .single();

                    if (!propError) proposalData = liveProposal;
                }
            }
            // CASE 2: Viewing via Proposal Slug (Live Proposal)
            else if (slug) {
                const { data: liveProposal, error: propError } = await supabase
                    .from('proposals')
                    .select('*')
                    .eq('slug', slug)
                    .single();

                if (propError) throw propError;
                proposalData = liveProposal;

                // Check if it has been accepted to show accurate data
                const { data: acceptanceData } = await supabase
                    .from('acceptances')
                    .select('*')
                    .eq('proposal_id', liveProposal.id)
                    .order('timestamp', { ascending: false })
                    .limit(1)
                    .single();

                if (acceptanceData) acceptanceInfo = acceptanceData;
            }

            // If we have acceptance info but no proposal data (e.g. restored record), create comprehensive placeholder
            if (!proposalData && acceptanceInfo) {
                console.log('Generating placeholder proposal from acceptance data');
                proposalData = {
                    id: 0, // Placeholder ID
                    slug: '',
                    company_name: acceptanceInfo.company_name,
                    responsible_name: acceptanceInfo.name,
                    cnpj: acceptanceInfo.cnpj,
                    cpf: acceptanceInfo.cpf,
                    monthly_fee: 0,
                    setup_fee: 0,
                    contract_duration: 0,
                    created_at: acceptanceInfo.timestamp,
                    accepted_at: acceptanceInfo.timestamp,
                    services: ["Contrato Restaurado / Legacy"], // Placaholder service
                    is_legacy: true // Flag to render simplified view
                };
            }

            if (!proposalData) throw new Error("Contract data not found");

            // Apply Acceptance Overrides (Final Client Details)
            if (acceptanceInfo) {
                proposalData = {
                    ...proposalData,
                    company_name: acceptanceInfo.company_name || proposalData.company_name,
                    responsible_name: acceptanceInfo.name || proposalData.responsible_name,
                    cnpj: acceptanceInfo.cnpj || proposalData.cnpj,
                    cpf: acceptanceInfo.cpf || proposalData.cpf,
                    accepted_at: acceptanceInfo.timestamp
                };
            }

            setProposal(proposalData);

            // Load templates if not already loaded from snapshot
            // Skip for legacy/placeholder proposals which don't have real service IDs
            if (loadedTemplates.length === 0 && proposalData.services && !proposalData.is_legacy) {
                const serviceIds = Array.isArray(proposalData.services)
                    ? proposalData.services.map((s: any) => typeof s === 'string' ? s : s.id)
                    : [];

                if (serviceIds.length > 0) {
                    const { data: templatesData } = await supabase
                        .from('contract_templates')
                        .select('*')
                        .in('service_id', serviceIds);

                    if (templatesData) loadedTemplates = templatesData;
                }
            }
            setTemplates(loadedTemplates);

        } catch (error) {
            console.error('Error fetching contract data:', error);
            // Only alert if we really couldn't get ANY data
            alert('Erro ao carregar dados do contrato. Pode ter sido excluído.');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const generatePDF = async () => {
        const element = document.getElementById('contract-content');
        if (!element) return;

        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Contrato_${proposal?.company_name}.pdf`);
    };

    if (loading) return <div className="p-8 text-center">Carregando contrato...</div>;
    if (!proposal) return <div className="p-8 text-center">Proposta não encontrada.</div>;

    const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="min-h-screen bg-slate-100 print:bg-white">
            <div className="print:hidden">
                <Header />
                <div className="max-w-4xl mx-auto px-8 py-6 flex justify-between items-center">
                    <button onClick={() => navigate(slug ? `/p/${slug}` : '/')} className="flex items-center gap-2 text-slate-600 hover:text-brand-coral">
                        <ArrowLeft className="w-5 h-5" /> {slug ? 'Voltar para Proposta' : 'Voltar'}
                    </button>
                    <div className="flex gap-4">
                        <button onClick={handlePrint} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-bold shadow-sm">
                            <Printer className="w-5 h-5" /> Imprimir
                        </button>
                        <button onClick={generatePDF} className="flex items-center gap-2 bg-brand-coral text-white px-4 py-2 rounded-lg hover:bg-red-500 font-bold shadow-md">
                            <Download className="w-5 h-5" /> Baixar PDF
                        </button>
                    </div>
                </div>
            </div>

            <div id="contract-content" className="max-w-4xl mx-auto bg-white p-12 md:p-16 my-8 shadow-xl print:shadow-none print:my-0 print:p-0 text-slate-900 leading-relaxed text-justify">

                {/* Header */}
                {/* Header */}
                <div className="text-center border-b border-slate-200 pb-8 mb-12">
                    <img src={logo} alt="C4 Marketing" className="h-12 mx-auto mb-6" />
                    <h1 className="text-2xl font-black uppercase tracking-wide mb-2">Contrato de Prestação de Serviços de Marketing e Tecnologia</h1>
                    <p className="text-slate-500 font-medium text-sm">Instrumento Particular de Contrato</p>
                </div>

                {/* 1. Identification */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">1. Das Partes Contratantes</h2>
                    <div className="bg-slate-50 p-6 rounded-lg text-sm border border-slate-100">
                        <p className="mb-4">
                            <strong>CONTRATADA:</strong> <span className="uppercase">C4 Marketing (HAC ASSESSORIA E CONSULTORIA LTDA)</span>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 24.043.876/0001-83, com sede em Florianópolis/SC.
                        </p>
                        <p>
                            <strong>CONTRATANTE:</strong> <span className="uppercase">{proposal.company_name}</span>, neste ato representada por seu responsável legal <strong>{proposal.responsible_name}</strong>{proposal.cnpj ? `, inscrita no CNPJ/MF sob o nº ${proposal.cnpj}` : ''}.
                        </p>
                        <p className="mt-4 italic text-slate-500">
                            As partes acima identificadas têm, entre si, justo e contratado o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas seguintes e pelas condições descritas no presente instrumento.
                        </p>
                    </div>
                </div>

                {/* 2. Object (Service Schedules) */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">2. Do Objeto do Contrato</h2>
                    <p className="mb-4 text-sm">
                        2.1. O presente contrato tem por objeto a prestação de serviços especializados descritos detalhadamente abaixo, conforme selecionado na Proposta Comercial{proposal.id > 0 ? ` nº ${proposal.id.toString().padStart(6, '0')}` : ''}:
                    </p>

                    {(proposal.is_legacy || proposal.id === 0) ? (
                        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 text-orange-700">
                            <p className="font-bold">Certificado de Aceite Digital e Acordo Comercial</p>
                            <p className="text-sm mt-1">
                                Este registro comprova o aceite digital e a vigência do acordo comercial entre as partes.
                                O detalhamento técnico original dos serviços não está disponível nesta visualização recuperada,
                                mas a validade jurídica do aceite permanece inalterada conforme dados de identificação e timestamp
                                registrados.
                            </p>
                        </div>
                    ) : templates.length > 0 ? (
                        <div className="space-y-6">
                            {templates.map((template, index) => {
                                const serviceDetail = Array.isArray(proposal.services)
                                    ? (proposal.services as any[]).find(s => s.id === template.service_id)?.details
                                    : null;

                                return (
                                    <div key={template.id} className="pl-4 border-l-2 border-slate-200">
                                        <h3 className="font-bold text-md mb-2 text-slate-800 uppercase">2.{index + 2}. {template.title}</h3>
                                        <div className="text-sm whitespace-pre-wrap font-sans text-slate-600 leading-relaxed text-justify">
                                            {template.content.replace(/^### .*$/gm, '').trim()}
                                        </div>
                                        {serviceDetail && (
                                            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm italic text-slate-600">
                                                <strong>Detalhamento Adicional:</strong> {serviceDetail}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-red-500 italic text-sm">Serviços descritos conforme anexo técnico da proposta.</p>
                    )}
                </div>

                {/* 3. Obligations */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">3. Das Obrigações e Responsabilidades</h2>

                    <h3 className="font-bold text-sm mb-2 text-slate-800">3.1. Da CONTRATADA:</h3>
                    <ul className="list-disc pl-5 mb-4 text-sm text-slate-700 space-y-1">
                        <li>Executar os serviços contratados com zelo e qualidade técnica, cumprindo os prazos estabelecidos.</li>
                        <li>Manter sigilo sobre todas as informações fornecidas pela CONTRATANTE.</li>
                        <li>Fornecer relatórios mensais de desempenho para serviços recorrentes.</li>
                        <li>Utilizar ferramentas e softwares licenciados e adequados para a execução dos trabalhos.</li>
                    </ul>

                    <h3 className="font-bold text-sm mb-2 text-slate-800">3.2. Da CONTRATANTE:</h3>
                    <ul className="list-disc pl-5 mb-4 text-sm text-slate-700 space-y-1">
                        <li>Fornecer todas as informações, acessos, senhas e materiais (logos, imagens, textos) necessários em até 5 dias úteis após a solicitação.</li>
                        <li>Efetuar os pagamentos nas datas acordadas.</li>
                        <li>Responsabilizar-se inteiramente pela veracidade e legalidade do conteúdo fornecido para publicação ou inserção nos sites/anúncios.</li>
                        <li>Custear diretamente os valores de investimento em mídia (Google Ads, Meta Ads), que não se confundem com os honorários da CONTRATADA.</li>
                    </ul>
                </div>

                {/* 4. Values */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">4. Do Preço e Condições de Pagamento</h2>
                    <p className="mb-2 text-sm">4.1. Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA:</p>

                    <div className="bg-slate-50 p-4 rounded border border-slate-100 mb-4">
                        {(proposal.is_legacy || proposal.id === 0) ? (
                            <p className="text-sm italic text-slate-500">
                                * Valores e condições de pagamento estão arquivados no registro financeiro original e não constam nesta visualização recuperada.
                            </p>
                        ) : (
                            <>
                                {proposal.monthly_fee > 0 && (
                                    <p className="mb-2 text-sm">
                                        <strong>a) Honorários Mensais (Recorrente):</strong> {proposal.monthly_fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, a serem pagos mensalmente via Boleto Bancário ou PIX (chave: pix2@c4marketing.com.br) até o dia 10 de cada mês.
                                    </p>
                                )}

                                {proposal.setup_fee > 0 && (
                                    <div className="mb-0 text-sm">
                                        <p><strong>{proposal.monthly_fee > 0 ? 'b)' : 'a)'} Setup / Implementação (Único):</strong> {proposal.setup_fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, a ser pago conforme negociado na proposta.</p>
                                        {Array.isArray(proposal.services) && (proposal.services as any[]).some(s => s.id === 'website') && (
                                            <p className="mt-1 text-xs text-slate-500 italic">
                                                * Para o serviço de Web Site Institucional, o pagamento será realizado em duas parcelas: 50% no ato do aceite e os 50% restantes na entrega do projeto.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <p className="text-sm mb-2">4.2. O pagamento da primeira parcela (ou valor integral, conforme o caso) deverá ser realizado em até 7 (sete) dias úteis após o aceite digital desta proposta.</p>
                    <p className="text-sm mb-2">4.3. O atraso no pagamento acarretará multa de 2% (dois por cento) e juros de mora de 1% (um por cento) ao mês.</p>
                    <p className="text-sm">4.4. A inadimplência superior a 10 (dez) dias permitirá a suspensão imediata dos serviços até a regularização.</p>
                </div>

                {/* 5. Term and Termination */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">5. Da Vigência e Rescisão</h2>
                    <p className="mb-2 text-sm">
                        5.1. O presente contrato tem prazo de <strong>{proposal.contract_duration} meses</strong>, iniciando-se na data de aceite deste instrumento.
                    </p>
                    <p className="mb-2 text-sm">
                        5.2. Para serviços recorrentes (Gestão de Tráfego, Hospedagem), o contrato renova-se automaticamente por iguais períodos, caso não haja manifestação em contrário com 30 (trinta) dias de antecedência.
                    </p>
                    {Array.isArray(proposal.services) && (proposal.services as any[]).some(s => s.id === 'traffic_management') && (
                        <p className="mb-2 text-sm">
                            5.3. <strong>Da Multa por Fidelidade:</strong> Em caso de rescisão antecipada imotivada por parte da CONTRATANTE antes do término do período de vigência para o serviço de Gestão de Tráfego, será devida multa equivalente a 50% (cinquenta por cento) do valor das mensalidades restantes deste serviço.
                        </p>
                    )}
                    <p className="mb-2 text-sm">
                        5.4. Após o período de vigência/fidelidade, o contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias, sem ônus.
                    </p>
                </div>

                {/* 6. Intellectual Property */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">6. Da Propriedade Intelectual</h2>
                    <p className="mb-2 text-sm">
                        6.1. Todos os materiais criados (códigos, layouts, artes) especificamente para a CONTRATANTE serão de sua propriedade após a quitação integral do contrato.
                    </p>
                    <p className="mb-2 text-sm">
                        6.2. A metodologia, segredos de negócio, estruturas de campanha e conhecimento técnico (know-how) aplicados pela CONTRATADA permanecem de sua exclusiva propriedade intelectual.
                    </p>
                </div>

                {/* 7. LGPD & Confidentiality */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">7. Da Confidencialidade e Proteção de Dados</h2>
                    <p className="mb-2 text-sm">
                        7.1. As partes obrigam-se a manter o mais absoluto sigilo sobre quaisquer dados, informações, documentos e especificações técnicas e comerciais que venham a ter acesso em razão deste contrato.
                    </p>
                    <p className="mb-2 text-sm">
                        7.2. As partes declaram estar em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), comprometendo-se a tratar dados pessoais apenas para os fins estritos deste contrato.
                    </p>
                </div>

                {/* 8. Forum */}
                <div className="mb-12">
                    <h2 className="text-lg font-bold mb-4 uppercase text-slate-900 border-l-4 border-brand-coral pl-3">8. Do Foro</h2>
                    <p className="text-sm">
                        8.1. E por estarem assim justos e contratados, as partes elegem o Foro da Comarca de Florianópolis/SC para dirimir quaisquer dúvidas ou litígios oriundos deste Contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
                    </p>
                </div>

                {/* Signatures */}
                <div className="mt-20 pt-10 border-t border-slate-200 grid grid-cols-2 gap-12 text-center break-inside-avoid">
                    <div>
                        <div className="border-t border-slate-900 w-3/4 mx-auto mb-2"></div>
                        <p className="font-bold text-sm">C4 Marketing</p>
                        <p className="text-xs text-slate-500">CNPJ: 48.005.917/0001-57</p>
                    </div>
                    <div>
                        <div className="border-t border-slate-900 w-3/4 mx-auto mb-2"></div>
                        <p className="font-bold text-sm">{proposal.company_name}</p>
                        <p className="text-xs text-slate-500">{proposal.responsible_name}</p>
                        {proposal.accepted_at && (
                            <p className="text-xs text-slate-400 mt-1">
                                Aceite Digital em {new Date(proposal.accepted_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        )}
                    </div>
                </div>

                <div className="text-center mt-12 text-[10px] text-slate-400 print:hidden">
                    <p>Este documento é uma minuta contratual gerada eletronicamente pelo sistema C4 Marketing.</p>
                </div>

            </div>
        </div >
    );
};

export default ContractView;
