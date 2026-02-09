import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, AlertCircle, ArrowLeft, Lock, Save } from 'lucide-react';

const TrafficAccessForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [accessData, setAccessData] = useState({
        google_ads: '',
        meta_ads: '',
        additional_info: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadData = async () => {
            if (!id) return;
            try {
                const { data, error } = await supabase
                    .from('traffic_projects')
                    .select('access_data, account_setup_status')
                    .eq('id', id)
                    .single();

                if (data) {
                    if (data.access_data) {
                        setAccessData(data.access_data);
                    }
                    if (data.account_setup_status === 'completed') {
                        setIsLocked(true);
                        setCompleted(true);
                    }
                }
            } catch (err) {
                console.error('Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id]);

    const handleChange = (field: string, value: string) => {
        if (isLocked) return;
        setAccessData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!id) return;

        setSaving(true);
        setError('');

        try {
            const { error: updateError } = await supabase
                .from('traffic_projects')
                .update({
                    access_data: accessData,
                })
                .eq('id', id);

            if (updateError) throw updateError;
            setCompleted(true);
        } catch (err: any) {
            console.error(err);
            setError('Erro ao salvar informações. Tente novamente.');
        } finally {
            setSaving(false);
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
                        {isLocked ? (
                            <Lock className="w-10 h-10 text-green-600" />
                        ) : (
                            <CheckCircle className="w-10 h-10 text-blue-600" />
                        )}
                    </div>

                    <h1 className="text-3xl font-bold text-slate-800 mb-4">
                        {isLocked ? 'Acesso Validado!' : 'Informações Salvas!'}
                    </h1>

                    <p className="text-slate-600 mb-8">
                        {isLocked
                            ? 'As informações de acesso já foram validadas pelo gestor. Não é possível mais editar.'
                            : 'Suas informações de acesso foram registradas com segurança. Nossa equipe irá testar os acessos em breve.'}
                    </p>

                    {!isLocked && (
                        <button
                            onClick={() => setCompleted(false)}
                            className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 mx-auto"
                        >
                            <ArrowLeft size={18} />
                            Revisar / Editar
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8 text-center">
                    <img src="/logo.png" alt="Logo" className="h-10 mx-auto mb-6" />
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Configuração de Acessos</h1>
                    <p className="text-slate-500">
                        Forneça os dados de acesso para iniciarmos a gestão das campanhas.
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
                    <form onSubmit={handleSubmit} className="space-y-8">

                        {/* Google Ads */}
                        <div>
                            <label className="block text-lg font-bold text-slate-800 mb-2">
                                Informações de Acesso ao Google Ads
                            </label>
                            <p className="text-sm text-slate-500 mb-3">
                                ID da conta (10 dígitos), e-mail de acesso ou instruções para convite.
                            </p>
                            <textarea
                                required
                                rows={10}
                                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all font-mono text-sm"
                                value={accessData.google_ads}
                                onChange={(e) => handleChange('google_ads', e.target.value)}
                                placeholder="Ex: ID da conta: 123-456-7890..."
                            />
                        </div>

                        {/* Meta Ads */}
                        <div>
                            <label className="block text-lg font-bold text-slate-800 mb-2">
                                Informações de Acesso ao Meta Ads (Business Manager)
                            </label>
                            <p className="text-sm text-slate-500 mb-3">
                                Link do BM, ID da conta de anúncios ou instruções de parceiro.
                            </p>
                            <textarea
                                required
                                rows={10}
                                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all font-mono text-sm"
                                value={accessData.meta_ads}
                                onChange={(e) => handleChange('meta_ads', e.target.value)}
                                placeholder="Ex: Business ID: 123456789..."
                            />
                        </div>

                        {/* Additional Info */}
                        <div>
                            <label className="block text-lg font-bold text-slate-800 mb-2">
                                Informações Adicionais
                            </label>
                            <p className="text-sm text-slate-500 mb-3">
                                Qualquer outra observação, restrição ou detalhe importante sobre os acessos.
                            </p>
                            <textarea
                                rows={10}
                                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all font-mono text-sm"
                                value={accessData.additional_info}
                                onChange={(e) => handleChange('additional_info', e.target.value)}
                                placeholder="Observações extras..."
                            />
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2">
                                <AlertCircle size={20} />
                                {error}
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-100 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex items-center gap-2 px-8 py-3 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 shadow-lg shadow-brand-coral/20 transition-all disabled:opacity-70"
                            >
                                {saving ? 'Salvando...' : 'Salvar Informações'}
                                {!saving && <Save size={20} />}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TrafficAccessForm;
