import React, { useState, useEffect } from 'react';
import { X, Check, Building, User, Calendar, DollarSign, Clock, UserCog } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProjectCreated: () => void;
    projectToEdit?: any;
    userRole?: string | null;
}

interface AppUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

const SERVICES_OPTIONS = [
    { id: 'traffic_management', label: 'Gestão de Tráfego' },
    { id: 'hosting', label: 'Hospedagem' },
    { id: 'landing_page', label: 'Landing Page' },
    { id: 'website', label: 'Web Site' },
    { id: 'ecommerce', label: 'E-commerce' },
    { id: 'consulting', label: 'Consultoria' },
    { id: 'ai_agents', label: 'Agentes de IA' },
];

// Map UI service IDs to execute_update_project_responsible p_service_type values
const SERVICE_TO_TYPE_MAP: Record<string, string> = {
    traffic_management: 'traffic',
    website: 'website',
    landing_page: 'landing_page',
};

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onProjectCreated, projectToEdit, userRole }) => {
    const [loading, setLoading] = useState(false);
    const [appUsers, setAppUsers] = useState<AppUser[]>([]);
    const [formData, setFormData] = useState({
        companyName: '',
        responsibleName: '',
        startDate: new Date().toISOString().split('T')[0],
        contractValue: '',
        contractDuration: '',
        services: [] as string[],
        responsibleUserEmail: '',
    });

    const isGestor = userRole === 'gestor';

    useEffect(() => {
        if (isOpen && projectToEdit) {
            const services = projectToEdit.services
                ? projectToEdit.services.map((s: any) => typeof s === 'string' ? s : s.id)
                : [];

            setFormData({
                companyName: projectToEdit.company_name || '',
                responsibleName: projectToEdit.responsible_name || '',
                startDate: projectToEdit.created_at ? new Date(projectToEdit.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                contractValue: '',
                contractDuration: '',
                services: services,
                responsibleUserEmail: projectToEdit.responsible_user_email || '',
            });

            // Load app_users for gestor to pick responsible
            if (isGestor) {
                loadAppUsers();
            }
        } else if (isOpen && !projectToEdit) {
            setFormData({
                companyName: '',
                responsibleName: '',
                startDate: new Date().toISOString().split('T')[0],
                contractValue: '',
                contractDuration: '',
                services: [],
                responsibleUserEmail: '',
            });
        }
    }, [isOpen, projectToEdit]);

    const loadAppUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('id, name, email, role')
                .in('role', ['gestor', 'operacional', 'comercial'])
                .order('name');
            if (!error && data) setAppUsers(data as AppUser[]);
        } catch {
            // If RLS blocks direct access, users list stays empty (field still works via email input)
        }
    };

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
            const servicesData = formData.services.map(id => ({ id }));

            if (projectToEdit) {
                // UPDATE existing project
                const newSlug = formData.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

                const { data: currentData, error: fetchError } = await supabase
                    .from('acceptances')
                    .select('contract_snapshot')
                    .eq('id', projectToEdit.id)
                    .single();

                if (fetchError) throw fetchError;

                const updatedSnapshot = currentData.contract_snapshot ? {
                    ...currentData.contract_snapshot,
                    proposal: {
                        ...(currentData.contract_snapshot.proposal || {}),
                        slug: newSlug
                    }
                } : null;

                const updatePayload: any = { company_name: formData.companyName };
                if (updatedSnapshot) updatePayload.contract_snapshot = updatedSnapshot;

                const { error } = await supabase
                    .from('acceptances')
                    .update(updatePayload)
                    .eq('id', projectToEdit.id);

                if (error) throw error;

                // Gestor: update internal responsible on all applicable project tables
                if (isGestor && formData.responsibleUserEmail &&
                    formData.responsibleUserEmail !== (projectToEdit.responsible_user_email ?? '')) {

                    const services: string[] = projectToEdit.services
                        ? projectToEdit.services.map((s: any) => typeof s === 'string' ? s : s.id)
                        : [];

                    // Get project table IDs for this acceptance
                    const serviceTypes = services
                        .map(s => SERVICE_TO_TYPE_MAP[s])
                        .filter(Boolean);

                    if (serviceTypes.length > 0) {
                        const tableMap: Record<string, string> = {
                            traffic: 'traffic_projects',
                            website: 'website_projects',
                            landing_page: 'landing_page_projects',
                        };

                        const projectIdResults = await Promise.all(
                            serviceTypes.map(type =>
                                supabase
                                    .from(tableMap[type])
                                    .select('id')
                                    .eq('acceptance_id', projectToEdit.id)
                                    .maybeSingle()
                                    .then(res => ({ type, id: res.data?.id ?? null }))
                            )
                        );

                        await Promise.all(
                            projectIdResults
                                .filter(r => r.id !== null)
                                .map(r =>
                                    supabase.rpc('execute_update_project_responsible', {
                                        p_project_id: r.id,
                                        p_service_type: r.type,
                                        p_responsible_email: formData.responsibleUserEmail,
                                    })
                                )
                        );
                    }
                }

            } else {
                // CREATE new project
                const { error } = await supabase
                    .from('acceptances')
                    .insert([{
                        company_name: formData.companyName,
                        name: formData.responsibleName,
                        timestamp: new Date(formData.startDate).toISOString(),
                        status: 'Ativo',
                        email: 'nao_informado@exemplo.com',
                        cpf: '000.000.000-00',
                        cnpj: '00.000.000/0000-00',
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
            }

            onProjectCreated();
            onClose();
            if (!projectToEdit) {
                setFormData({
                    companyName: '',
                    responsibleName: '',
                    startDate: new Date().toISOString().split('T')[0],
                    contractValue: '',
                    contractDuration: '',
                    services: [],
                    responsibleUserEmail: '',
                });
            }

        } catch (error: any) {
            console.error('Error creating/updating project:', error);
            alert('Erro ao salvar projeto: ' + error.message);
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
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {projectToEdit ? 'Editar Projeto' : 'Novo Projeto'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto max-h-[80vh]">

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Company Name - Always Visible */}
                        <div className={projectToEdit && !isGestor ? "md:col-span-2" : ""}>
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

                        {/* Responsible Interno - Gestor editing */}
                        {projectToEdit && isGestor && (
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                                    Responsável Interno (Equipe C4)
                                </label>
                                <div className="relative">
                                    <UserCog className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                    {appUsers.length > 0 ? (
                                        <select
                                            value={formData.responsibleUserEmail}
                                            onChange={e => setFormData({ ...formData, responsibleUserEmail: e.target.value })}
                                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all appearance-none"
                                        >
                                            <option value="">— Selecionar responsável —</option>
                                            {appUsers.map(u => (
                                                <option key={u.id} value={u.email}>
                                                    {u.name} ({u.role})
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="email"
                                            placeholder="email@c4marketing.com.br"
                                            value={formData.responsibleUserEmail}
                                            onChange={e => setFormData({ ...formData, responsibleUserEmail: e.target.value })}
                                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-brand-coral outline-none transition-all"
                                        />
                                    )}
                                </div>
                                {projectToEdit.responsible_user_name && (
                                    <p className="text-xs text-slate-400 mt-1">
                                        Atual: <span className="font-medium text-slate-600 dark:text-slate-300">{projectToEdit.responsible_user_name}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Other fields ONLY visible when CREATING */}
                        {!projectToEdit && (
                            <>
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
                            </>
                        )}
                    </div>

                    {/* Services Selection - ONLY visible when CREATING */}
                    {!projectToEdit && (
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
                    )}

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
                            {loading ? 'Salvando...' : (projectToEdit ? 'Salvar Alterações' : 'Criar Projeto')}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default CreateProjectModal;
