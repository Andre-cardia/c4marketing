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

// ... (QUESTION_LABELS remains matching previous steps)

const SurveyAnswersModal: React.FC<SurveyAnswersModalProps> = ({ isOpen, onClose, surveyData, onValidate, onReopen, isCompleted }) => {
    if (!isOpen) return null;

    // ... (Content remains same)

    {/* Footer */ }
    <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-3xl flex flex-col md:flex-row gap-3 items-center">
        <button
            onClick={onClose}
            className={`py-3 font-bold rounded-xl transition-all ${onValidate ? 'flex-1 text-slate-500 hover:bg-slate-100' : 'w-full bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
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
            </div >
        </div >
    );
};

export default SurveyAnswersModal;
