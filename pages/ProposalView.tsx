import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Services from '../components/Services';
import Pricing from '../components/Pricing';
import ContractDetails from '../components/ContractDetails';
import Footer from '../components/Footer';
import { maskCPF, maskCNPJ, isValidCPF, isValidCNPJ } from '../lib/utils';

interface Proposal {
    id: number;
    slug: string;
    company_name: string;
    responsible_name: string;
    monthly_fee: number;
    setup_fee: number;
    media_limit: number;
    created_at: string;
    contract_duration: number;
    services?: { id: string; price: number }[] | string[]; // Support both new (detailed) and old (simple string[]) formats
}

const ProposalView: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);


    // Form State
    const [isAccepted, setIsAccepted] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        cpf: '',
        cnpj: '',
        companyName: ''
    });
    const [timestamp, setTimestamp] = useState<string | null>(null);
    const [clientCreationError, setClientCreationError] = useState(false);

    useEffect(() => {
        fetchProposal();
    }, [slug]);

    const fetchProposal = async () => {
        try {
            const { data, error } = await supabase
                .from('proposals')
                .select('*')
                .eq('slug', slug)
                .single();

            if (error) throw error;
            setProposal(data);
        } catch (err) {
            console.error('Error fetching proposal:', err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        let maskedValue = value;

        if (name === 'cpf') maskedValue = maskCPF(value);
        if (name === 'cnpj') maskedValue = maskCNPJ(value);

        setFormData(prev => ({ ...prev, [name]: maskedValue }));
    };

    const isFormValid = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return (
            formData.name.trim().length >= 3 &&
            emailRegex.test(formData.email) &&
            isValidCPF(formData.cpf) &&
            isValidCNPJ(formData.cnpj) &&
            formData.companyName.trim().length >= 2
        );
    };

    const handleInitialSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid()) {
            alert('Por favor, verifique os dados informados.');
            return;
        }
        setIsConfirming(true);
    };

    const handleFinalConfirm = async () => {
        setIsSubmitting(true);
        try {

            // 1. Fetch Contract Templates for Snapshot
            const serviceIds = Array.isArray(proposal.services)
                ? proposal.services.map((s: any) => typeof s === 'string' ? s : s.id)
                : [];

            let templatesSnapshot = [];
            if (serviceIds.length > 0) {
                const { data: templatesData } = await supabase
                    .from('contract_templates')
                    .select('*')
                    .in('service_id', serviceIds);
                templatesSnapshot = templatesData || [];
            }

            // 2. Create Contract Snapshot
            const contractSnapshot = {
                proposal: proposal,
                templates: templatesSnapshot,
                generated_at: new Date().toISOString()
            };

            const { data: acceptanceId, error } = await supabase.rpc('submit_proposal_acceptance', {
                p_name: formData.name,
                p_email: formData.email,
                p_cpf: formData.cpf,
                p_cnpj: formData.cnpj,
                p_company_name: formData.companyName,
                p_proposal_id: proposal.id,
                p_contract_snapshot: contractSnapshot,
            });

            if (error) throw error;
            const acceptanceData = { id: acceptanceId as number };

            // 3. Create Traffic Project immediately (Frontend attempt)
            // This ensures the dashboard works instantly without waiting for Edge Function
            try {
                const { error: projectError } = await supabase
                    .from('traffic_projects')
                    .insert({
                        acceptance_id: acceptanceData.id,
                        name: formData.companyName || formData.name,
                        status: 'active'
                    });

                if (projectError) {
                    console.error('Frontend traffic_projects creation failed (likely RLS). Edge Function will retry:', projectError);
                } else {
                    console.log('Frontend traffic_projects created successfully');
                }
            } catch (projErr) {
                console.error('Error creating project in frontend:', projErr);
            }

            // 4. Create client user account (Edge Function)
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const response = await fetch(
                    `${supabaseUrl}/functions/v1/create-client-user`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                        },
                        body: JSON.stringify({
                            email: formData.email,
                            name: formData.name,
                        }),
                    }
                );

                if (!response.ok) {
                    throw new Error(`Edge Function failed: ${response.statusText}`);
                }

                const result = await response.json();
                console.log('Client user creation result:', result);
            } catch (clientErr) {
                // Don't block acceptance if client creation fails, but notify UI
                console.error('Error creating client user (non-blocking):', clientErr);
                setClientCreationError(true);
            }

            setTimestamp(new Date().toLocaleString('pt-BR'));
            setIsAccepted(true);
            setShowForm(false);
            setIsConfirming(false);
        } catch (err: any) {
            console.error('Error saving acceptance:', err);
            alert('Ocorreu um erro ao salvar. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-coral"></div>
            </div>
        );
    }

    if (error || !proposal) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
                <h1 className="text-4xl font-black text-slate-900 mb-4">404</h1>
                <p className="text-slate-500 mb-8">Proposta não encontrada ou expirada.</p>
                <a href="/" className="text-brand-coral font-bold hover:underline">Voltar ao início</a>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            {/* Floating Action Buttons */}
            <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-3 no-print">
                <button
                    onClick={handlePrint}
                    className="bg-brand-dark text-white p-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-2 font-semibold"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    PDF / Imprimir
                </button>
                {!isAccepted && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="bg-brand-coral text-white p-4 px-8 rounded-full shadow-2xl hover:bg-red-500 hover:scale-105 transition-all font-bold text-lg"
                    >
                        Aceitar Proposta
                    </button>
                )}
                <button
                    onClick={() => window.open(`/p/${slug}/contract`, '_blank')}
                    className="bg-white text-slate-700 p-4 px-6 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center justify-center gap-2 font-bold border border-slate-200"
                    title="Ver Minuta do Contrato"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Contrato
                </button>
            </div>

            <Header />

            <main className="flex-grow">
                <Hero
                    companyName={proposal.company_name}
                    responsibleName={proposal.responsible_name}
                    createdAt={proposal.created_at}
                    contractDuration={proposal.contract_duration}
                    services={proposal.services}
                />

                <div id="services">
                    <Services services={proposal.services} />
                </div>

                <div id="pricing">
                    <Pricing
                        services={proposal.services}
                    />
                </div>

                <div id="contract">
                    <ContractDetails services={proposal.services} />
                </div>
            </main>

            <Footer isAccepted={isAccepted} />

            {/* Acceptance Form Modal (Original) */}
            {showForm && !isConfirming && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 no-print animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-xl w-full shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-8 duration-500 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-coral via-red-400 to-brand-coral opacity-80"></div>

                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Confirmar Aceite</h2>
                                <p className="text-slate-500 text-sm mt-1">Identificação formal para início imediato.</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleInitialSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="md:col-span-2">
                                <label htmlFor="name" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">Nome Completo</label>
                                <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-brand-coral focus:bg-white bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-300" placeholder="Seu nome completo" required />
                            </div>

                            <div className="md:col-span-2">
                                <label htmlFor="email" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">E-mail Corporativo</label>
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-brand-coral focus:bg-white bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-300" placeholder="seu@email.com.br" required />
                            </div>

                            <div>
                                <label htmlFor="cpf" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">CPF</label>
                                <input type="text" name="cpf" value={formData.cpf} onChange={handleInputChange} className={`w-full px-5 py-4 rounded-2xl border-2 bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-300 ${formData.cpf && !isValidCPF(formData.cpf) ? 'border-red-200 text-red-600 focus:border-red-400' : 'border-slate-100 focus:border-brand-coral'}`} placeholder="000.000.000-00" required />
                            </div>

                            <div>
                                <label htmlFor="companyName" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">Razão Social</label>
                                <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-brand-coral focus:bg-white bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-300" placeholder="Nome da empresa" required />
                            </div>

                            <div className="md:col-span-2">
                                <label htmlFor="cnpj" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">CNPJ</label>
                                <input type="text" name="cnpj" value={formData.cnpj} onChange={handleInputChange} className={`w-full px-5 py-4 rounded-2xl border-2 bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-300 ${formData.cnpj && !isValidCNPJ(formData.cnpj) ? 'border-red-200 text-red-600 focus:border-red-400' : 'border-slate-100 focus:border-brand-coral'}`} placeholder="00.000.000/0000-00" required />
                            </div>

                            <div className="md:col-span-2 pt-4">
                                <button type="submit" disabled={!isFormValid()} className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-2 ${isFormValid() ? 'bg-brand-coral text-white hover:bg-red-500 hover:shadow-brand-coral/30 hover:-translate-y-0.5' : 'bg-slate-100 text-slate-200 cursor-not-allowed shadow-none'}`}>
                                    Revisar Dados
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {isConfirming && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[110] p-4 no-print animate-in zoom-in duration-300">
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-brand-dark"></div>

                        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-brand-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Conferência de Dados
                        </h2>

                        <div className="space-y-4 mb-8">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nome</p>
                                <p className="font-semibold text-slate-800 text-lg">{formData.name}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Email</p>
                                <p className="font-semibold text-slate-800 text-lg">{formData.email}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">CPF</p>
                                    <p className="font-semibold text-slate-800">{formData.cpf}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">CNPJ</p>
                                    <p className="font-semibold text-slate-800">{formData.cnpj}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Razão Social</p>
                                <p className="font-semibold text-slate-800">{formData.companyName}</p>
                            </div>

                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-800 text-sm flex gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                                <span>Por favor, verifique se todos os dados estão corretos. Eles serão usados para a geração automática do contrato.</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleFinalConfirm}
                                disabled={isSubmitting}
                                className="w-full bg-brand-coral text-white py-4 rounded-xl font-bold text-lg hover:bg-red-500 transition-colors shadow-lg flex justify-center items-center gap-2"
                            >
                                {isSubmitting ? 'Finalizando...' : 'Confirmar e Aceitar'}
                            </button>
                            <button
                                onClick={() => setIsConfirming(false)}
                                disabled={isSubmitting}
                                className="w-full bg-white text-slate-500 py-4 rounded-xl font-bold hover:bg-slate-50 transition-colors border border-slate-200"
                            >
                                Voltar e Corrigir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal (Reused) */}
            {isAccepted && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 no-print animate-in zoom-in duration-300">
                    <div className="bg-white rounded-[3rem] p-12 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
                        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h2 className="text-3xl font-black mb-3 text-slate-900 leading-tight">Proposta Aceita!</h2>
                        <p className="text-slate-500 mb-4 leading-relaxed">Obrigado pela confiança. Nossa parceria começa agora.</p>
                        <div className={`rounded-2xl p-4 mb-8 text-left ${clientCreationError ? 'bg-amber-50 border border-amber-100' : 'bg-blue-50 border border-blue-100'}`}>
                            <p className={`text-sm font-medium flex items-center gap-2 ${clientCreationError ? 'text-amber-800' : 'text-blue-800'}`}>
                                {clientCreationError ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <span>
                                            Proposta aceita, mas houve um erro ao criar seu usuário automaticamente. <br />
                                            <strong>Por favor, entre em contato com nosso time para receber seu acesso.</strong>
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                        </svg>
                                        <span>Enviamos um email para <strong>{formData.email}</strong> com instruções para criar sua senha e acessar a Área do Cliente.</span>
                                    </>
                                )}
                            </p>
                        </div>
                        <button onClick={() => setIsAccepted(false)} className="bg-brand-dark text-white px-10 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all w-full shadow-lg">Fechar</button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ProposalView;
