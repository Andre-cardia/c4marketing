import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../../components/Header';
import { ArrowLeft, Layers } from 'lucide-react';

const CampaignStage: React.FC = () => {
    const { id, stage } = useParams<{ id: string; stage: string }>();
    const navigate = useNavigate();

    const getStageTitle = () => {
        switch (stage) {
            case 'planning': return 'Planejamento';
            case 'creatives': return 'Criativos';
            case 'execution': return 'Execução';
            case 'optimization': return 'Análise e Otimização';
            case 'finalization': return 'Finalização';
            default: return 'Etapa da Campanha';
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="max-w-5xl mx-auto px-4 py-8">
                <button
                    onClick={() => navigate(`/projects/${id}/traffic`)}
                    className="flex items-center gap-2 text-slate-500 hover:text-brand-coral mb-6 transition-colors"
                >
                    <ArrowLeft size={20} />
                    Voltar para Gestão de Tráfego
                </button>

                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                        <Layers className="text-brand-coral" />
                        {getStageTitle()}
                    </h1>
                    <div className="p-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                        <p className="text-slate-500">Conteúdo específico para a etapa de <strong>{getStageTitle()}</strong> será implementado aqui.</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CampaignStage;
