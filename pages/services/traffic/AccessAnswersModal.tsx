import React, { useState, useEffect } from 'react';
import { X, CheckCircle, FileText, Lock } from 'lucide-react';

interface AccessAnswersModalProps {
    isOpen: boolean;
    onClose: () => void;
    accessData: Record<string, string>;
    onValidate?: () => void;
    onReopen?: () => void;
    isCompleted?: boolean;
}

const AccessAnswersModal: React.FC<AccessAnswersModalProps> = ({ isOpen, onClose, accessData, onValidate, onReopen, isCompleted }) => {
    if (!isOpen) return null;

    if (!accessData || Object.keys(accessData).length === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-lg w-full text-center">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Nenhuma informação encontrada</h3>
                    <p className="text-slate-500 mb-6">Parece que os dados de acesso não foram preenchidos ainda.</p>
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
                        <div className={`p-2 rounded-full ${isCompleted ? 'bg-green-100' : 'bg-blue-100'}`}>
                            {isCompleted ? <CheckCircle className="w-6 h-6 text-green-600" /> : <FileText className="w-6 h-6 text-blue-600" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Informações de Acesso</h2>
                            <p className="text-sm text-slate-500">Credenciais para Gestão de Tráfego</p>
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
                <div className="p-8 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 space-y-6">

                    {/* Google Ads */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                            Google Ads
                        </h4>
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap border border-slate-200 dark:border-slate-700">
                            {accessData.google_ads || <span className="text-slate-400 italic">Não informado</span>}
                        </div>
                    </div>

                    {/* Meta Ads */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                            Meta Ads (Business Manager)
                        </h4>
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap border border-slate-200 dark:border-slate-700">
                            {accessData.meta_ads || <span className="text-slate-400 italic">Não informado</span>}
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                            Informações Adicionais
                        </h4>
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap border border-slate-200 dark:border-slate-700">
                            {accessData.additional_info || <span className="text-slate-400 italic">Nenhuma observação</span>}
                        </div>
                    </div>

                </div>

                {/* Footer */}
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
            </div>
        </div>
    );
};

export default AccessAnswersModal;
