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
}

const ProposalView: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // Form State
    const [isAccepted, setIsAccepted] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        cpf: '',
        cnpj: '',
        companyName: ''
    });
    const [timestamp, setTimestamp] = useState<string | null>(null);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid()) {
            alert('Por favor, verifique os dados informados.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('acceptances')
                .insert([
                    {
                        name: formData.name,
                        email: formData.email,
                        cpf: formData.cpf,
                        company_name: formData.companyName,
                        cnpj: formData.cnpj,
                        // We can add a proposal_id reference later if needed
                    }
                ]);

            if (error) throw error;
            setTimestamp(new Date().toLocaleString('pt-BR'));
            setIsAccepted(true);
            setShowForm(false);
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
            </div>

            <Header />

            <main className="flex-grow">
                <Hero
                    companyName={proposal.company_name}
                    responsibleName={proposal.responsible_name}
                    createdAt={proposal.created_at}
                    contractDuration={proposal.contract_duration}
                />

                <div id="services">
                    <Services />
                </div>

                <div id="pricing">
                    <Pricing
                        monthlyFee={proposal.monthly_fee}
                        setupFee={proposal.setup_fee}
                        mediaLimit={proposal.media_limit}
                        contractDuration={proposal.contract_duration}
                    />
                </div>

                <div id="contract">
                    <ContractDetails />
                </div>
            </main>

            <Footer isAccepted={isAccepted} />

            {/* Acceptance Form Modal (Reused) */}
            {showForm && (
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

                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                                <button type="submit" disabled={isSubmitting || !isFormValid()} className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-2 ${isFormValid() ? 'bg-brand-coral text-white hover:bg-red-500 hover:shadow-brand-coral/30 hover:-translate-y-0.5' : 'bg-slate-100 text-slate-200 cursor-not-allowed shadow-none'}`}>
                                    {isSubmitting ? 'Confirmando...' : 'Confirmar Aceite'}
                                </button>
                            </div>
                        </form>
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
                        <p className="text-slate-500 mb-8 leading-relaxed">Obrigado pela confiança. Nossa parceria começa agora.</p>
                        <button onClick={() => setIsAccepted(false)} className="bg-brand-dark text-white px-10 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all w-full shadow-lg">Fechar</button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ProposalView;
