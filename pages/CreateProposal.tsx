import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Header from '../components/Header';
import { ArrowLeft, Check, DollarSign, Calendar, Target } from 'lucide-react';

type ProposalService = {
    id: string;
    price: number;
    details?: string;
    recurringPrice?: number;
    setupPrice?: number;
};

const RECURRING_SERVICE_IDS = ['traffic_management', 'hosting', 'ai_agents'];
const HYBRID_SERVICE_IDS = ['ai_agents'];

const isHybridService = (serviceId: string) => HYBRID_SERVICE_IDS.includes(serviceId);
const isRecurringService = (serviceId: string) => RECURRING_SERVICE_IDS.includes(serviceId);

const getRecurringAmount = (service: ProposalService) => {
    if (service.id === 'ai_agents') return service.recurringPrice || 0;
    return isRecurringService(service.id) ? service.price || 0 : 0;
};

const getSetupAmount = (service: ProposalService) => {
    if (service.id === 'ai_agents') return service.setupPrice || 0;
    return isRecurringService(service.id) ? 0 : service.price || 0;
};

const getDisplayLabel = (serviceLabel: string, context: 'recurring' | 'setup') => {
    if (serviceLabel !== 'Agentes de IA') return serviceLabel;
    return context === 'recurring' ? 'Agentes de IA (Recorrência)' : 'Agentes de IA (Setup)';
};

const CreateProposal: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [newProposal, setNewProposal] = useState({
        companyName: '',
        responsibleName: '',
        mediaLimit: 5000,
        contractDuration: 6,
        services: [] as ProposalService[]
    });

    const servicesList = [
        { id: 'traffic_management', label: 'Gestão de Tráfego', billingType: 'recurring' },
        { id: 'hosting', label: 'Hospedagem', billingType: 'recurring' },
        { id: 'landing_page', label: 'Landing Page', billingType: 'one_time' },
        { id: 'website', label: 'Web Site Institucional', billingType: 'one_time' },
        { id: 'ecommerce', label: 'E-commerce', billingType: 'one_time' },
        { id: 'consulting', label: 'Consultoria de Mkt', billingType: 'one_time' },
        { id: 'ai_agents', label: 'Agentes de IA', billingType: 'hybrid' }
    ];

    // Calculate totals on the fly
    const monthlyTotal = newProposal.services
        .reduce((acc, curr) => acc + getRecurringAmount(curr), 0);

    const oneTimeTotal = newProposal.services
        .reduce((acc, curr) => acc + getSetupAmount(curr), 0);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const handleCreateProposal = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const slug = newProposal.companyName
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const suffix = Math.floor(1000 + Math.random() * 9000);
        const fullSlug = `${slug}-${suffix}`;

        try {
            const { error } = await supabase.from('proposals').insert([{
                company_name: newProposal.companyName,
                responsible_name: newProposal.responsibleName,
                monthly_fee: monthlyTotal,
                setup_fee: oneTimeTotal,
                media_limit: newProposal.mediaLimit,
                contract_duration: newProposal.contractDuration,
                services: newProposal.services,
                slug: fullSlug
            }]);

            if (error) throw error;

            alert('Proposta criada com sucesso!');
            navigate('/proposals');
        } catch (error: any) {
            console.error('Error creating proposal:', error);
            alert('Erro ao criar proposta: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="mb-8 flex items-center gap-4">
                    <button onClick={() => navigate('/proposals')} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-600" />
                    </button>
                    <h1 className="text-3xl font-bold text-slate-900">Nova Proposta</h1>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Column - Form */}
                    <div className="lg:col-span-2 space-y-8">
                        <form id="create-proposal-form" onSubmit={handleCreateProposal} className="space-y-8">

                            {/* Section 1: Basic Info */}
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                                    <div className="w-8 h-8 bg-brand-coral/10 text-brand-coral rounded-lg flex items-center justify-center text-sm">1</div>
                                    Dados do Cliente
                                </h2>
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                            Nome da Empresa <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={newProposal.companyName}
                                            onChange={e => setNewProposal({ ...newProposal, companyName: e.target.value })}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-brand-coral outline-none transition-all text-slate-900 bg-white"
                                            placeholder="Ex: Tech Solutions"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                            Responsável <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={newProposal.responsibleName}
                                            onChange={e => setNewProposal({ ...newProposal, responsibleName: e.target.value })}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-brand-coral outline-none transition-all text-slate-900 bg-white"
                                            placeholder="Ex: Maria Silva"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Services */}
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                                    <div className="w-8 h-8 bg-brand-coral/10 text-brand-coral rounded-lg flex items-center justify-center text-sm">2</div>
                                    Seleção de Serviços
                                </h2>

                                <div className="space-y-3">
                                    {servicesList.map(service => {
                                        const isSelected = newProposal.services.some(s => s.id === service.id);
                                        const serviceData = newProposal.services.find(s => s.id === service.id);

                                        return (
                                            <div key={service.id} className={`p-4 rounded-xl border transition-all duration-200 ${isSelected ? 'bg-slate-50 border-brand-coral shadow-sm' : 'border-slate-100 hover:bg-slate-50'}`}>
                                                <div className="flex items-center gap-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => {
                                                            const currentServices = newProposal.services;
                                                            if (e.target.checked) {
                                                                setNewProposal({
                                                                    ...newProposal,
                                                                    services: [
                                                                        ...currentServices,
                                                                        {
                                                                            id: service.id,
                                                                            price: 0,
                                                                            recurringPrice: isHybridService(service.id) ? 0 : undefined,
                                                                            setupPrice: isHybridService(service.id) ? 0 : undefined,
                                                                            details: ''
                                                                        }
                                                                    ]
                                                                });
                                                            } else {
                                                                setNewProposal({ ...newProposal, services: currentServices.filter(s => s.id !== service.id) });
                                                            }
                                                        }}
                                                        className="w-6 h-6 rounded border-slate-300 text-brand-coral focus:ring-brand-coral cursor-pointer"
                                                    />
                                                    <div className="flex-1 cursor-pointer" onClick={() => {
                                                        const currentServices = newProposal.services;
                                                        if (!isSelected) {
                                                            setNewProposal({
                                                                ...newProposal,
                                                                services: [
                                                                    ...currentServices,
                                                                    {
                                                                        id: service.id,
                                                                        price: 0,
                                                                        recurringPrice: isHybridService(service.id) ? 0 : undefined,
                                                                        setupPrice: isHybridService(service.id) ? 0 : undefined,
                                                                        details: ''
                                                                    }
                                                                ]
                                                            });
                                                        }
                                                    }}>
                                                        <span className="font-bold text-slate-900 block">{service.label}</span>
                                                        <span className="text-xs text-slate-500 uppercase tracking-wider">
                                                            {service.billingType === 'hybrid'
                                                                ? 'Setup + Recorrente'
                                                                : service.billingType === 'recurring'
                                                                    ? 'Recorrente'
                                                                    : 'Projeto Único'}
                                                        </span>
                                                    </div>

                                                    {isSelected && !isHybridService(service.id) && (
                                                        <div className="w-32 animate-in slide-in-from-right-4 duration-300">
                                                            <input
                                                                type="number"
                                                                placeholder="R$ 0,00"
                                                                value={serviceData?.price || ''}
                                                                onChange={e => {
                                                                    const price = parseFloat(e.target.value) || 0;
                                                                    setNewProposal(prev => ({
                                                                        ...prev,
                                                                        services: prev.services.map(s => s.id === service.id ? { ...s, price } : s)
                                                                    }));
                                                                }}
                                                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-right font-medium focus:border-brand-coral outline-none text-slate-900 bg-white"
                                                                autoFocus
                                                            />
                                                        </div>
                                                    )}

                                                    {isSelected && isHybridService(service.id) && (
                                                        <div className="w-full sm:w-80 animate-in slide-in-from-right-4 duration-300">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Recorrência</label>
                                                                    <input
                                                                        type="number"
                                                                        placeholder="R$ 0,00"
                                                                        value={serviceData?.recurringPrice || ''}
                                                                        onChange={e => {
                                                                            const recurringPrice = parseFloat(e.target.value) || 0;
                                                                            setNewProposal(prev => ({
                                                                                ...prev,
                                                                                services: prev.services.map(s => s.id === service.id ? { ...s, recurringPrice } : s)
                                                                            }));
                                                                        }}
                                                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-right font-medium focus:border-brand-coral outline-none text-slate-900 bg-white"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Setup</label>
                                                                    <input
                                                                        type="number"
                                                                        placeholder="R$ 0,00"
                                                                        value={serviceData?.setupPrice || ''}
                                                                        onChange={e => {
                                                                            const setupPrice = parseFloat(e.target.value) || 0;
                                                                            setNewProposal(prev => ({
                                                                                ...prev,
                                                                                services: prev.services.map(s => s.id === service.id ? { ...s, setupPrice } : s)
                                                                            }));
                                                                        }}
                                                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-right font-medium focus:border-brand-coral outline-none text-slate-900 bg-white"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {isSelected && (
                                                    <div className="mt-4 pl-10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div>
                                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Detalhamento do Serviço (Opcional)</label>
                                                            <textarea
                                                                placeholder="Descreva aqui os detalhes específicos deste serviço para o contrato..."
                                                                value={serviceData?.details || ''}
                                                                onChange={e => {
                                                                    const details = e.target.value;
                                                                    setNewProposal(prev => ({
                                                                        ...prev,
                                                                        services: prev.services.map(s => s.id === service.id ? { ...s, details } : s)
                                                                    }));
                                                                }}
                                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-brand-coral outline-none text-sm resize-none text-slate-900 bg-white"
                                                                rows={2}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Section 3: Traffic Details (Conditional) */}
                            {newProposal.services.some(s => isRecurringService(s.id)) && (
                                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4 duration-500">
                                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                                        <div className="w-8 h-8 bg-brand-coral/10 text-brand-coral rounded-lg flex items-center justify-center text-sm">3</div>
                                        Detalhes de Contrato Recorrente
                                    </h2>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {newProposal.services.some(s => s.id === 'traffic_management') && (
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                                    Verba de Mídia (Ads) <span className="text-red-500">*</span>
                                                </label>
                                                <div className="relative">
                                                    <Target className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                                    <input
                                                        type="number"
                                                        required
                                                        value={newProposal.mediaLimit}
                                                        onChange={e => setNewProposal({ ...newProposal, mediaLimit: parseFloat(e.target.value) })}
                                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-brand-coral outline-none transition-all"
                                                    />
                                                </div>
                                                <p className="text-xs text-slate-400 mt-2">Valor sugerido para investimento nas plataformas.</p>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                                Tempo de Contrato (Meses) <span className="text-red-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                                <input
                                                    type="number"
                                                    required
                                                    min="1"
                                                    value={newProposal.contractDuration}
                                                    onChange={e => setNewProposal({ ...newProposal, contractDuration: parseInt(e.target.value) })}
                                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-brand-coral outline-none transition-all"
                                                />
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2">Meses de fidelidade contratual.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </form>
                    </div>

                    {/* Right Column - Validation & Summary */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-8 space-y-6">
                            <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-coral opacity-20 -mr-16 -mt-16 rounded-full blur-2xl"></div>

                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-brand-coral" />
                                    Resumo Financeiro
                                </h3>

                                <div className="space-y-6">
                                    <div>
                                        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Mensalidade Total</p>
                                        <p className="text-4xl font-black font-montserrat">{formatCurrency(monthlyTotal)}</p>
                                        <div className="mt-2 space-y-1">
                                            {newProposal.services.filter(s => isRecurringService(s.id)).map(s => (
                                                <div key={s.id} className="flex justify-between text-xs text-slate-400">
                                                    <span>{getDisplayLabel(servicesList.find(i => i.id === s.id)?.label || s.id, 'recurring')}</span>
                                                    <span>{formatCurrency(getRecurringAmount(s))}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-700">
                                        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Investimento Pontual</p>
                                        <p className="text-2xl font-bold font-montserrat">{formatCurrency(oneTimeTotal)}</p>
                                        <div className="mt-2 space-y-1">
                                            {newProposal.services.filter(s => !isRecurringService(s.id) || isHybridService(s.id)).map(s => (
                                                <div key={s.id} className="flex justify-between text-xs text-slate-400">
                                                    <span>{getDisplayLabel(servicesList.find(i => i.id === s.id)?.label || s.id, 'setup')}</span>
                                                    <span>{formatCurrency(getSetupAmount(s))}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    form="create-proposal-form"
                                    type="submit"
                                    disabled={loading}
                                    className="w-full mt-8 bg-brand-coral text-white py-4 rounded-xl font-bold hover:bg-red-500 transition-all shadow-lg hover:shadow-brand-coral/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    ) : (
                                        <>
                                            <Check className="w-5 h-5" />
                                            Criar Proposta
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                <h4 className="font-bold text-slate-900 mb-3 text-sm">Próximos Passos</h4>
                                <ul className="space-y-3">
                                    <li className="flex gap-3 text-sm text-slate-600">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0"></div>
                                        Preencha os dados da empresa
                                    </li>
                                    <li className="flex gap-3 text-sm text-slate-600">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0"></div>
                                        Selecione os serviços desejados
                                    </li>
                                    <li className="flex gap-3 text-sm text-slate-600">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0"></div>
                                        Defina os valores de investimento
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CreateProposal;
