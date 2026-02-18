import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../../components/Header';
import { ArrowLeft, Users } from 'lucide-react';

const StrategyMeeting: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

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
                        <textarea
                            className="w-full h-64 p-4 rounded-xl border border-slate-700 bg-slate-900/50 text-slate-300 resize-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 outline-none placeholder-slate-600"
                            placeholder="Registre aqui as definições da reunião (Público-alvo, KPIs, Objetivos...)"
                        ></textarea>
                        <button className="w-full py-3 bg-transparent border border-amber-500 text-amber-500 font-bold rounded-xl hover:bg-amber-500/10 transition-colors">
                            Salvar Notas
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StrategyMeeting;
