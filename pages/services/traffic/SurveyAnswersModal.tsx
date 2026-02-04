import React from 'react';
import { X, CheckCircle, FileText } from 'lucide-react';

interface SurveyAnswersModalProps {
    isOpen: boolean;
    onClose: () => void;
    surveyData: Record<string, any>;
    onValidate?: () => void;
    onReopen?: () => void;
    isCompleted?: boolean;
}

// Mapping question IDs to their labels
const QUESTION_LABELS: Record<string, string> = {
    q1: '1. Principal Produto/Serviço',
    q2: '2. Produtos mais rentáveis',
    q3: '3. Ticket Médio & LTV',
    q4: '4. Modelo de Negócio',
    q5: '5. Processo de Vendas',
    q6: '6. Dados Demográficos',
    q7: '7. Geolocalização',
    q8: '8. Profissão/Cargo',
    q9: '9. Interesses e Hobbies',
    q10: '10. Origem dos clientes',
    q11: '11. Nível de Consciência',
    q12: '12. Fator Decisório',
    q13: '13. Sazonalidade',
    q14: '14. A Dor Latente',
    q15: '15. O Sonho/Desejo',
    q16: '16. Objeções Universais',
    q17: '17. O Grande Diferencial',
    q18: '18. Inimigo Comum',
    q19: '19. Anti-Persona',
    q20: '20. Histórico de Anúncios',
    q21: '21. Verba Inicial',
    q22: '22. Gravação de Vídeos',
    q23: '23. Ativos Disponíveis',
    q24: '24. Oferta Irresistível'
};

const SurveyAnswersModal: React.FC<SurveyAnswersModalProps> = ({ isOpen, onClose, surveyData, onValidate, onReopen, isCompleted }) => {
    if (!isOpen) return null;

    if (!surveyData || Object.keys(surveyData).length === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-lg w-full text-center">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Nenhuma resposta encontrada</h3>
                    <p className="text-slate-500 mb-6">Parece que os dados não foram salvos corretamente ou estão vazios.</p>
                    <button onClick={onClose} className="px-6 py-2 bg-slate-200 rounded-lg font-bold text-slate-700">Fechar</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl my-8 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Respostas da Pesquisa</h2>
                            <p className="text-sm text-slate-500">Briefing de Tráfego</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                    >
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(QUESTION_LABELS).map(([key, label]) => {
                            const answer = surveyData[key];
                            if (!answer) return null;

                            return (
                                <div key={key} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                    <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                        {label}
                                    </h4>
                                    <div className="text-slate-800 dark:text-slate-200">
                                        {Array.isArray(answer) ? (
                                            <div className="flex flex-wrap gap-2">
                                                {answer.map((item, idx) => (
                                                    <span key={idx} className="px-2 py-1 bg-brand-coral/10 text-brand-coral text-sm rounded-md font-medium">
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="whitespace-pre-wrap">{answer}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-3xl flex flex-col md:flex-row gap-3 items-center">
                    <button
                        onClick={onClose}
                        className={`py-3 font-bold rounded-xl transition-all ${onValidate && !isCompleted ? 'flex-1 text-slate-500 hover:bg-slate-100' : 'w-full bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                    >
                        Fechar
                    </button>

                    {/* Pending State: Show Validate Button */}
                    {onValidate && !isCompleted && (
                        <button
                            onClick={() => {
                                onValidate();
                                onClose();
                            }}
                            className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2"
                        >
                            <CheckCircle size={20} />
                            Validar e Concluir
                        </button>
                    )}

                    {/* Completed State: Show Status & Reopen Option */}
                    {isCompleted && (
                        <div className="flex-1 flex items-center justify-between bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                            <span className="flex items-center gap-2 text-green-700 font-bold text-sm">
                                <CheckCircle size={16} />
                                Status: Validado
                            </span>
                            {onReopen && (
                                <button
                                    onClick={onReopen}
                                    className="text-xs text-slate-400 hover:text-red-500 underline"
                                >
                                    Reabrir / Desfazer
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SurveyAnswersModal;
