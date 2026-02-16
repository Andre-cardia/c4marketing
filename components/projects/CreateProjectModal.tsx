import React, { useState } from 'react';
import { X, Check, Building, User, Calendar, DollarSign, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProjectCreated: () => void;
}

const SERVICES_OPTIONS = [
    { id: 'traffic_management', label: 'Gestão de Tráfego' },
    { id: 'hosting', label: 'Hospedagem' },
    { id: 'landing_page', label: 'Landing Page' },
    { id: 'website', label: 'Web Site' },
    { id: 'ecommerce', label: 'E-commerce' },
    { id: 'consulting', label: 'Consultoria' },
];

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onProjectCreated }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        companyName: '',
        responsibleName: '',
        startDate: new Date().toISOString().split('T')[0],
        contractValue: '',
        contractDuration: '',
        services: [] as string[],
    });

    const handleServiceToggle = (serviceId: string) => {
        setFormData(prev => {
            if (prev.services.includes(serviceId)) {
                return { ...prev, services: prev.services.filter(id => id !== serviceId) };
            } else {
                return { ...prev, services: [...prev.services, serviceId] };
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Transform selected services into the structure expected by the Projects page
            // Projects page expects contract_snapshot.proposal.services to be an array of objects or strings
            // We'll match the structure used in CreateProposal.tsx for consistency: objects with id
            const servicesData = formData.services.map(id => ({ id }));

            // Insert into acceptances table
            const { error } = await supabase
                .from('acceptances')
                .insert([{
                    company_name: formData.companyName,
                    name: formData.responsibleName,
                    timestamp: new Date(formData.startDate).toISOString(),
                    status: 'Ativo',
                    // Required fields by schema, but not asked in form
                    email: 'nao_informado@exemplo.com', // Placeholder to satisfy NOT NULL
                    cpf: '000.000.000-00', // Placeholder to satisfy NOT NULL
                    cnpj: '00.000.000/0000-00', // Placeholder (if required)
                    contract_snapshot: {
                        proposal: {
                            services: servicesData,
                            value: parseFloat(formData.contractValue) || 0,
                            duration: parseInt(formData.contractDuration) || 0,
                            slug: formData.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                        }
                    }
                }]);

            if (error) throw error;

            onProjectCreated();
            onClose();
            // Reset form
            setFormData({
                companyName: '',
                responsibleName: '',
                startDate: new Date().toISOString().split('T')[0],
                contractValue: '',
                contractDuration: '',
                services: [],
            });

        } catch (error: any) {
            console.error('Error creating project:', error);
            alert('Erro ao criar projeto: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Novo Projeto</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Company Name */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Empresa</label>
                            <div className="relative">
                                <Building className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    required
                                    placeholder="Nome da empresa"
                                    value={formData.companyName}
                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Responsible Name */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Responsável</label>
                            <div className="relative">
                                <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    required
                                    placeholder="Nome do responsável"
                                    value={formData.responsibleName}
                                    onChange={e => setFormData({ ...formData, responsibleName: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Start Date */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Data de Início</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                <input
                                    type="date"
                                    required
                                    value={formData.startDate}
                                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Contract Duration */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Tempo de Contrato (Meses)</label>
                            <div className="relative">
                                <Clock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="12"
                                    value={formData.contractDuration}
                                    onChange={e => setFormData({ ...formData, contractDuration: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Contract Value */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Valor do Contrato (Mensal)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.contractValue}
                                    onChange={e => setFormData({ ...formData, contractValue: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Services Selection */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Serviços Contratados</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {SERVICES_OPTIONS.map(service => {
                                const isSelected = formData.services.includes(service.id);
                                return (
                                    <div
                                        key={service.id}
                                        onClick={() => handleServiceToggle(service.id)}
                                        className={`
                                            cursor-pointer p-3 rounded-xl border transition-all duration-200 flex items-center gap-3
                                            ${isSelected
                                                ? 'bg-brand-coral/10 border-brand-coral text-brand-coral'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}
                                        `}
                                    >
                                        <div className={`
                                            w-5 h-5 rounded border flex items-center justify-center transition-colors
                                            ${isSelected ? 'bg-brand-coral border-brand-coral' : 'border-slate-300 dark:border-slate-600'}
                                        `}>
                                            {isSelected && <Check size={14} className="text-white" />}
                                        </div>
                                        <span className="text-sm font-medium">{service.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-brand-coral hover:bg-red-500 text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-brand-coral/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Salvando...' : 'Criar Projeto'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default CreateProjectModal;
