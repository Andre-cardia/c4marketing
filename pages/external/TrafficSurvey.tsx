import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';

const SECTIONS = [
    {
        id: 'business',
        title: 'Seção 1: O Negócio e a Oferta',
        questions: [
            { id: 'q1', label: '1. Qual é o principal produto/serviço que impulsiona o faturamento hoje?', type: 'text' },
            { id: 'q2', label: '2. Quais produtos têm a maior margem de lucro?', type: 'text' },
            { id: 'q3', label: '3. Qual o ticket médio de uma venda?', type: 'text' },
            { id: 'q4', label: '4. Modelo de Negócio', type: 'radio', options: ['B2B (Venda para empresas)', 'B2C (Venda para consumidor final)', 'Ambos'] },
            { id: 'q5', label: '5. Processo de Vendas (Como é o atendimento?)', type: 'radio', options: ['Venda Automática (E-commerce)', 'Equipe Comercial/SDR', 'WhatsApp Humanizado', 'WhatsApp Bot'] }
        ]
    },
    {
        id: 'icp',
        title: 'Seção 2: Perfil do Cliente Ideal (ICP)',
        questions: [
            { id: 'q6', label: '6. Dados Demográficos (Idade, Gênero, etc.)', type: 'textarea' },
            { id: 'q7', label: '7. Onde ele mora?', type: 'radio', options: ['Brasil Todo', 'Apenas Cidade/Estado', 'Raio específico (Negócio Local)'] },
            { id: 'q8', label: '8. Profissão/Cargo Específico?', type: 'text' },
            { id: 'q9', label: '9. Interesses e Hobbies', type: 'textarea' }
        ]
    },
    {
        id: 'psychology',
        title: 'Seção 3: Psicologia de Compra',
        questions: [
            { id: 'q10', label: '10. Origem dos melhores clientes hoje', type: 'text' },
            { id: 'q11', label: '11. Nível de Consciência do Cliente', type: 'radio', options: ['Já sabe que precisa (Busca ativa)', 'Sabe que tem problema, mas não a solução', 'Não sabe que tem problema (Impulso)', 'Já conhece a marca (Retargeting)'] },
            { id: 'q12', label: '12. Fator Decisório (O que faz fechar?)', type: 'text' },
            { id: 'q13', label: '13. Sazonalidade (Meses de pico/baixa)', type: 'text' }
        ]
    },
    {
        id: 'pain',
        title: 'Seção 4: Dores, Desejos e Objeções',
        questions: [
            { id: 'q14', label: '14. A Dor Latente (Problema que tira o sono)', type: 'textarea' },
            { id: 'q15', label: '15. O Sonho/Desejo (Resultado perfeito)', type: 'textarea' },
            { id: 'q16', label: '16. Objeções Universais (Por que NÃO compraria?)', type: 'checkbox', options: ['Está caro', 'Não confio na entrega', 'Vou ver com sócio/esposa', 'Não sei se funciona para mim'] },
            { id: 'q17', label: '17. O Grande Diferencial (Por que você?)', type: 'textarea' },
            { id: 'q18', label: '18. Inimigo Comum (Mito de mercado)', type: 'text' }
        ]
    },
    {
        id: 'filtering',
        title: 'Seção 5: Filtragem (Anti-Persona)',
        questions: [
            { id: 'q19', label: '19. Quem NÃO é seu cliente? (Perfil indesejado)', type: 'textarea' }
        ]
    },
    {
        id: 'investment',
        title: 'Seção 6: Estrutura e Investimento',
        questions: [
            { id: 'q20', label: '20. Histórico de Anúncios', type: 'radio', options: ['Nunca', 'Sim, sozinho', 'Sim, com agência (detalhar)'] },
            { id: 'q21', label: '21. Verba Inicial Mensal (Apenas Mídia)', type: 'text' },
            { id: 'q22', label: '22. Consegue gravar vídeos/fotos?', type: 'text' },
            { id: 'q23', label: '23. Ativos Disponíveis', type: 'checkbox', options: ['Site / Landing Page', 'Instagram engajado', 'Lista de E-mails/Clientes', 'Branding Book'] },
            { id: 'q24', label: '24. Oferta Irresistível (Possível criar?)', type: 'text' }
        ]
    }
];

const TrafficSurvey: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [currentSection, setCurrentSection] = useState(0);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [completed, setCompleted] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [error, setError] = useState('');
    const [companyName, setCompanyName] = useState('');

    useEffect(() => {
        const loadSurvey = async () => {
            if (!id) return;
            try {
                const { data, error } = await supabase
                    .from('traffic_projects')
                    .select(`
                        survey_data, 
                        survey_status,
                        acceptance_id,
                        acceptances!inner(company_name)
                    `)
                    .eq('id', id)
                    .single();

                if (data) {
                    if (data.survey_data) {
                        setAnswers(data.survey_data);
                    }
                    // Set company name from acceptance
                    if (data.acceptances) {
                        const acceptance = Array.isArray(data.acceptances) ? data.acceptances[0] : data.acceptances;
                        if (acceptance?.company_name) {
                            setCompanyName(acceptance.company_name);
                        }
                    }
                    if (data.survey_status === 'completed') {
                        setIsLocked(true);
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
    }, [id]);

    const handleAnswerChange = (qId: string, value: any) => {
        if (isLocked) return;
        setAnswers(prev => ({ ...prev, [qId]: value }));
    };

    const handleCheckboxChange = (qId: string, option: string, checked: boolean) => {
        if (isLocked) return;
        const current = answers[qId] || [];
        if (checked) {
            handleAnswerChange(qId, [...current, option]);
        } else {
            handleAnswerChange(qId, current.filter((item: string) => item !== option));
        }
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
        if (!id) return;
        setLoading(true);
        try {
            const { error: updateError } = await supabase
                .from('traffic_projects')
                .update({
                    survey_data: answers,
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

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-coral"></div>
            </div>
        );
    }

    if (completed) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full text-center">
                    <div className={`w-20 h-20 ${isLocked ? 'bg-green-100' : 'bg-blue-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                        <CheckCircle className={`w-10 h-10 ${isLocked ? 'text-green-600' : 'text-blue-600'}`} />
                    </div>

                    <h1 className="text-3xl font-bold text-slate-800 mb-4">
                        {isLocked ? 'Pesquisa Validada!' : 'Respostas Salvas!'}
                    </h1>

                    <p className="text-slate-600 mb-8">
                        {isLocked
                            ? 'As informações já foram validadas pelo gestor e estão sendo utilizadas na estratégia. Não é possível mais editar.'
                            : 'Suas respostas foram registradas. Você pode voltar e editar se necessário enquanto nossa equipe analisa.'}
                    </p>

                    {!isLocked && (
                        <button
                            onClick={() => setCompleted(false)}
                            className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 mx-auto"
                        >
                            <ArrowLeft size={18} />
                            Revisar / Editar Respostas
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const section = SECTIONS[currentSection];
    const progress = ((currentSection + 1) / SECTIONS.length) * 100;

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                {/* Intro Disclaimer */}
                {currentSection === 0 && (
                    <div className="mb-8 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl">
                        <p className="text-blue-800 text-sm">
                            <strong>Importante:</strong> As respostas desta pesquisa são referentes ao <strong>seu Negócio (Cliente)</strong> como um todo.
                            Essas informações servirão de base para todos os serviços contratados (Tráfego, Social, Web, etc), garantindo uma estratégia unificada.
                        </p>
                    </div>
                )}
                {/* Header */}
                <div className="mb-8 text-center">
                    <img src="/logo.png" alt="Logo" className="h-10 mx-auto mb-6" /> {/* Placeholder Logo */}

                    {companyName && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-coral/10 border border-brand-coral/20 rounded-full mb-4">
                            <span className="text-sm font-semibold text-slate-600">Cliente:</span>
                            <span className="text-sm font-bold text-brand-coral">{companyName}</span>
                        </div>
                    )}

                    <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
                        <div className="bg-brand-coral h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                        Seção {currentSection + 1} de {SECTIONS.length}
                    </span>
                </div>

                {/* Question Card */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
                    <h2 className="text-2xl font-bold text-slate-800 mb-8 pb-4 border-b border-slate-100">
                        {section.title}
                    </h2>

                    <div className="space-y-8">
                        {section.questions.map((q) => (
                            <div key={q.id}>
                                <label className="block text-lg font-medium text-slate-700 mb-3">
                                    {q.label}
                                </label>

                                {q.type === 'text' && (
                                    <input
                                        type="text"
                                        className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all"
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                        placeholder="Sua resposta..."
                                    />
                                )}

                                {q.type === 'textarea' && (
                                    <textarea
                                        rows={4}
                                        className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all"
                                        value={answers[q.id] || ''}
                                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                        placeholder="Descreva com detalhes..."
                                    />
                                )}

                                {q.type === 'radio' && (
                                    <div className="space-y-2">
                                        {q.options?.map(opt => (
                                            <label key={opt} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                                                <input
                                                    type="radio"
                                                    name={q.id}
                                                    value={opt}
                                                    checked={answers[q.id] === opt}
                                                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                                    className="w-5 h-5 text-brand-coral focus:ring-brand-coral border-gray-300"
                                                />
                                                <span className="text-slate-700 font-medium">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {q.type === 'checkbox' && (
                                    <div className="space-y-2">
                                        {q.options?.map(opt => (
                                            <label key={opt} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    value={opt}
                                                    checked={(answers[q.id] || []).includes(opt)}
                                                    onChange={(e) => handleCheckboxChange(q.id, opt, e.target.checked)}
                                                    className="w-5 h-5 text-brand-coral focus:ring-brand-coral border-gray-300 rounded"
                                                />
                                                <span className="text-slate-700 font-medium">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2">
                            <AlertCircle size={20} />
                            {error}
                        </div>
                    )}

                    <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between">
                        <button
                            onClick={() => setCurrentSection(prev => prev - 1)}
                            disabled={currentSection === 0}
                            className={`flex items-center gap-2 px-6 py-3 font-bold rounded-xl transition-colors
                                ${currentSection === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100'}`}
                        >
                            <ArrowLeft size={20} /> Voltar
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={loading}
                            className="flex items-center gap-2 px-8 py-3 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 shadow-lg shadow-brand-coral/20 transition-all disabled:opacity-70"
                        >
                            {loading ? 'Salvando...' : currentSection === SECTIONS.length - 1 ? 'Salvar & Finalizar' : 'Próxima Seção'}
                            {!loading && currentSection < SECTIONS.length - 1 && <ArrowRight size={20} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrafficSurvey;
