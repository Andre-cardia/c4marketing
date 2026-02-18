import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../../components/Header';
import { ArrowLeft, Users, Save, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const StrategyMeeting: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        loadNotes();
    }, [id]);

    const loadNotes = async () => {
        if (!id) return;
        try {
            const { data, error } = await supabase
                .from('traffic_projects')
                .select('strategy_meeting_notes')
                .eq('acceptance_id', id)
                .single();

            if (data && data.strategy_meeting_notes) {
                setNotes(data.strategy_meeting_notes);
            }
        } catch (error) {
            console.error('Error loading notes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!id) return;
        setSaving(true);
        setSuccess(false);

        try {
            const { error } = await supabase
                .from('traffic_projects')
                .update({ strategy_meeting_notes: notes })
                .eq('acceptance_id', id);

            if (error) throw error;

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error('Error saving notes:', error);
            alert('Erro ao salvar notas. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="max-w-4xl mx-auto px-4 py-8">
                <button
                    onClick={() => navigate(`/projects/${id}/traffic`)}
                    className="flex items-center gap-2 text-slate-500 hover:text-brand-coral mb-6 transition-colors"
                >
                    <ArrowLeft size={20} />
                    Voltar para Gestão de Tráfego
                </button>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
                    <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                        <Users className="text-amber-500" />
                        Reunião Estratégica
                    </h1>
                    <div className="space-y-4">
                        {loading ? (
                            <div className="h-64 flex items-center justify-center text-slate-500">
                                <Loader2 className="animate-spin w-8 h-8" />
                            </div>
                        ) : (
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full h-64 p-4 rounded-xl border border-slate-700 bg-slate-900/50 text-slate-300 resize-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 outline-none placeholder-slate-600"
                                placeholder="Registre aqui as definições da reunião (Público-alvo, KPIs, Objetivos...)"
                            ></textarea>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="w-full py-3 bg-transparent border border-amber-500 text-amber-500 font-bold rounded-xl hover:bg-amber-500/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="animate-spin w-5 h-5" />
                                    Salvando...
                                </>
                            ) : success ? (
                                <>
                                    <Check className="w-5 h-5" />
                                    Salvo com Sucesso!
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    Salvar Notas
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StrategyMeeting;
