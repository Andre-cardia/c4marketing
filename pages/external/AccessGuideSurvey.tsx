import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Shield, Globe, Server, User, Key } from 'lucide-react';

const SECTIONS = [
    {
        id: 'client_info',
        title: '1. Informações do Cliente',
        icon: User,
        questions: [
            { id: 'company_name', label: 'Nome da empresa / marca:', type: 'text' },
            { id: 'contact_person', label: 'Responsável pelo contato (nome e telefone):', type: 'text' },
            { id: 'contact_email', label: 'E-mail principal do cliente:', type: 'email' }
        ]
    },
    {
        id: 'site_info',
        title: '2. Informações do Site',
        icon: Globe,
        questions: [
            { id: 'site_url', label: 'URL do site:', type: 'text' },
            { id: 'creation_date', label: 'Data de criação do site (aproximada):', type: 'text' },
            {
                id: 'platform',
                label: 'Plataforma / linguagem usada no site:',
                type: 'radio',
                options: ['WordPress', 'HTML/CSS/JS puro', 'Landing page Builders', 'Webflow', 'Shopify', 'Wix', 'Outro']
            },
            { id: 'platform_other', label: 'Qual outra plataforma?', type: 'text', condition: { questionId: 'platform', value: 'Outro' } }
        ]
    },
    {
        id: 'admin_access',
        title: '3. Acesso ao Painel do Site',
        icon: Key,
        questions: [
            { id: 'cms_system', label: 'Sistema de gerenciamento do site (CMS):', type: 'text' },
            { id: 'admin_url', label: 'URL de acesso ao painel admin:', type: 'text' },
            { id: 'admin_user', label: 'Usuário Admin:', type: 'text' },
            { id: 'admin_email', label: 'E-mail Admin:', type: 'text' },
            { id: 'admin_password', label: 'Senha do administrador (caso autorizado):', type: 'text', placeholder: 'Deixe em branco se preferir enviar por outro meio' },
            {
                id: '2fa_enabled',
                label: 'Autenticação de 2 fatores (2FA) ativada?',
                type: 'radio',
                options: ['Sim', 'Não']
            },
            { id: '2fa_instructions', label: 'Se sim, como desativar/gerar código:', type: 'text', condition: { questionId: '2fa_enabled', value: 'Sim' } }
        ]
    },
    {
        id: 'hosting',
        title: '4. Hospedagem',
        icon: Server,
        questions: [
            {
                id: 'hosting_provider',
                label: 'Provedor de hospedagem atual:',
                type: 'radio',
                options: ['HostGator', 'Locaweb', 'UOL Host', 'KingHost', 'GoDaddy', 'AWS', 'Google Cloud', 'DigitalOcean', 'Hostinger', 'RedeHost', 'Outra']
            },
            { id: 'hosting_other', label: 'Qual outra hospedagem?', type: 'text', condition: { questionId: 'hosting_provider', value: 'Outra' } },
            { id: 'hosting_url', label: 'URL / painel da hospedagem:', type: 'text' },
            { id: 'hosting_user', label: 'Usuário Hospedagem:', type: 'text' },
            { id: 'hosting_email', label: 'E-mail Hospedagem:', type: 'text' },
            { id: 'hosting_password', label: 'Senha Hospedagem:', type: 'text' },
            {
                id: 'ftp_available',
                label: 'FTP / SFTP (acesso ao servidor):',
                type: 'radio',
                options: ['Disponível', 'Não disponível']
            },
            { id: 'ftp_host', label: 'Host FTP:', type: 'text', condition: { questionId: 'ftp_available', value: 'Disponível' } },
            { id: 'ftp_port', label: 'Porta FTP:', type: 'text', condition: { questionId: 'ftp_available', value: 'Disponível' } },
            { id: 'ftp_user', label: 'Usuário FTP:', type: 'text', condition: { questionId: 'ftp_available', value: 'Disponível' } },
            { id: 'ftp_pass', label: 'Senha FTP:', type: 'text', condition: { questionId: 'ftp_available', value: 'Disponível' } },
            {
                id: 'email_panel',
                label: 'Painel de e-mail vinculado ao domínio?',
                type: 'radio',
                options: ['Sim', 'Não']
            },
            { id: 'email_link', label: 'Link de acesso e-mail:', type: 'text', condition: { questionId: 'email_panel', value: 'Sim' } },
            { id: 'email_user', label: 'Usuário e-mail:', type: 'text', condition: { questionId: 'email_panel', value: 'Sim' } },
            { id: 'email_pass', label: 'Senha e-mail:', type: 'text', condition: { questionId: 'email_panel', value: 'Sim' } },
        ]
    },
    {
        id: 'domain',
        title: '5. Domínio',
        icon: Globe,
        questions: [
            {
                id: 'registrar',
                label: 'Registro do domínio feito em:',
                type: 'radio',
                options: ['Registro.br', 'GoDaddy', 'Locaweb', 'UOL Host', 'Outro']
            },
            { id: 'registrar_other', label: 'Qual outro registrador?', type: 'text', condition: { questionId: 'registrar', value: 'Outro' } },
            { id: 'registrar_user', label: 'Login do registrador (E-mail/ID):', type: 'text' },
            { id: 'registrar_pass', label: 'Senha do registrador:', type: 'text' },
            { id: 'dns_config', label: 'DNS configurado (servidor de nomes):', type: 'text' }
        ]
    },
    {
        id: 'observations',
        title: '6. Observações Importantes',
        icon: Shield,
        questions: [
            { id: 'integrations', label: 'Existem integrações/dependências especiais?', type: 'textarea', placeholder: 'API, Gateways, CRM, Pixel...' },
            { id: 'security_rules', label: 'Alguma regra especial de segurança?', type: 'textarea' },
            {
                id: 'change_password',
                label: 'Senha principal deve ser alterada após uso?',
                type: 'radio',
                options: ['Sim', 'Não']
            },
            {
                id: 'password_delivery',
                label: 'Método de envio das senhas:',
                type: 'radio',
                options: ['Formulário (este)', 'Gerenciador de senhas (LastPass/Bitwarden)', 'E-mail seguro', 'Outro']
            }
        ]
    }
];

const AccessGuideSurvey: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const type = searchParams.get('type') as 'lp' | 'website'; // 'lp' or 'website'

    const [currentSection, setCurrentSection] = useState(0);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadSurvey = async () => {
            if (!id || !type) return;
            try {
                const table = type === 'lp' ? 'landing_page_projects' : 'website_projects';
                const { data } = await supabase
                    .from(table)
                    .select('access_guide_data, account_setup_status')
                    .eq('id', id)
                    .single();

                if (data) {
                    if (data.access_guide_data) {
                        setAnswers(data.access_guide_data);
                    }
                    if (data.account_setup_status === 'completed') {
                        setCompleted(true);
                    }
                }
            } catch (err) {
                console.error('Error loading survey:', err);
            } finally {
                setLoading(false);
            }
        };
        loadSurvey();
    }, [id, type]);

    const handleAnswerChange = (qId: string, value: any) => {
        setAnswers(prev => ({ ...prev, [qId]: value }));
    };

    const handleNext = async () => {
        if (currentSection < SECTIONS.length - 1) {
            setCurrentSection(prev => prev + 1);
            window.scrollTo(0, 0);
        } else {
            await submitSurvey();
        }
    };

    const submitSurvey = async () => {
        if (!id || !type) return;
        setLoading(true);
        try {
            const table = type === 'lp' ? 'landing_page_projects' : 'website_projects';
            const { error: updateError } = await supabase
                .from(table)
                .update({
                    access_guide_data: answers,
                    // account_setup_status: 'completed' // Removed auto-completion to allow manual validation
                })
                .eq('id', id);

            if (updateError) throw updateError;
            setCompleted(true);
        } catch (err: any) {
            console.error(err);
            setError('Erro ao salvar respostas. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-coral"></div></div>;

    if (completed) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-800 mb-4">Dados Enviados!</h1>
                    <p className="text-slate-600 mb-8">Recebemos suas informações de acesso com segurança. Nossa equipe iniciará as configurações.</p>
                </div>
            </div>
        );
    }

    const section = SECTIONS[currentSection];
    const progress = ((currentSection + 1) / SECTIONS.length) * 100;
    const Icon = section.icon;

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8 text-center">
                    <img src="/logo.png" alt="Logo" className="h-10 mx-auto mb-6" />
                    <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
                        <div className="bg-brand-coral h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="text-sm font-bold text-slate-500 uppercase">Seção {currentSection + 1} de {SECTIONS.length}</span>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
                    <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-100">
                        <div className="p-3 bg-brand-coral/10 rounded-xl text-brand-coral">
                            <Icon size={28} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800">{section.title}</h2>
                    </div>

                    <div className="space-y-8">
                        {section.questions.map((q) => {
                            // Conditional rendering
                            if (q.condition) {
                                const dependentValue = answers[q.condition.questionId];
                                if (dependentValue !== q.condition.value) return null;
                            }

                            return (
                                <div key={q.id}>
                                    <label className="block text-lg font-medium text-slate-700 mb-3">{q.label}</label>

                                    {['text', 'email', 'password'].includes(q.type) && (
                                        <input
                                            type={q.type}
                                            className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral outline-none"
                                            value={answers[q.id] || ''}
                                            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                            placeholder={q.placeholder || ''}
                                        />
                                    )}

                                    {q.type === 'textarea' && (
                                        <textarea
                                            rows={3}
                                            className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral outline-none"
                                            value={answers[q.id] || ''}
                                            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                            placeholder={q.placeholder || ''}
                                        />
                                    )}

                                    {q.type === 'radio' && (
                                        <div className="space-y-2">
                                            {q.options?.map(opt => (
                                                <label key={opt} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name={q.id}
                                                        value={opt}
                                                        checked={answers[q.id] === opt}
                                                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                                        className="w-5 h-5 text-brand-coral border-gray-300 focus:ring-brand-coral"
                                                    />
                                                    <span className="text-slate-700">{opt}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {error && <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2"><AlertCircle size={20} />{error}</div>}

                    <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between">
                        <button
                            onClick={() => setCurrentSection(prev => prev - 1)}
                            disabled={currentSection === 0}
                            className={`flex items-center gap-2 px-6 py-3 font-bold rounded-xl transition-colors ${currentSection === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                            <ArrowLeft size={20} /> Voltar
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={loading}
                            className="flex items-center gap-2 px-8 py-3 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 shadow-lg transition-all"
                        >
                            {loading ? 'Salvando...' : currentSection === SECTIONS.length - 1 ? 'Enviar Guia' : 'Próxima Seção'}
                            {!loading && currentSection < SECTIONS.length - 1 && <ArrowRight size={20} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccessGuideSurvey;
