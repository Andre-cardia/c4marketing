import React, { useState, useEffect, useRef } from 'react';
import { X, KeyRound, Save, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { getProjectCredentials, upsertProjectCredentials } from '../../lib/brain';

interface ProjectCredentialsModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: number;
    companyName: string;
}

const ProjectCredentialsModal: React.FC<ProjectCredentialsModalProps> = ({
    isOpen,
    onClose,
    projectId,
    companyName,
}) => {
    const [credentials, setCredentials] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setFeedback(null);
        setCredentials('');
        setLoading(true);
        getProjectCredentials(projectId)
            .then((data) => setCredentials(data ?? ''))
            .catch(() => setFeedback({ type: 'error', text: 'Erro ao carregar credenciais.' }))
            .finally(() => setLoading(false));
    }, [isOpen, projectId]);

    useEffect(() => {
        if (isOpen && !loading && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isOpen, loading]);

    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            await upsertProjectCredentials(projectId, credentials);
            setFeedback({ type: 'success', text: 'Credenciais salvas com sucesso.' });
        } catch {
            setFeedback({ type: 'error', text: 'Erro ao salvar. Tente novamente.' });
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-full max-w-lg flex flex-col"
                onKeyDown={handleKeyDown}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-coral/10 rounded-xl text-brand-coral">
                            <KeyRound size={18} />
                        </div>
                        <div>
                            <h2 className="font-bold text-neutral-900 dark:text-white text-sm leading-tight">
                                Dados de Acesso
                            </h2>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">{companyName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Warning badge */}
                <div className="mx-6 mt-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
                    <AlertTriangle size={13} className="shrink-0" />
                    Informações confidenciais — visível para toda a equipe autenticada.
                </div>

                {/* Body */}
                <div className="p-6 flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 text-neutral-400 py-12">
                            <Loader2 className="animate-spin" size={18} />
                            <span className="text-sm">Carregando...</span>
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            value={credentials}
                            onChange={(e) => setCredentials(e.target.value)}
                            placeholder={`Ex:\nGoogle Ads\nLogin: email@empresa.com\nSenha: exemplo123\n\nFacebook Business\nLogin: usuario\nSenha: exemplo456`}
                            rows={12}
                            className="w-full px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-mono resize-none focus:ring-2 focus:ring-brand-coral outline-none leading-relaxed placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                        />
                    )}

                    {feedback && (
                        <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border ${
                            feedback.type === 'success'
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400'
                                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400'
                        }`}>
                            {feedback.type === 'success'
                                ? <CheckCircle size={13} className="shrink-0" />
                                : <AlertTriangle size={13} className="shrink-0" />}
                            {feedback.text}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl border border-neutral-200 dark:border-neutral-700 transition-colors"
                    >
                        Fechar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="px-4 py-2 text-sm font-bold text-white bg-brand-coral hover:bg-brand-coral/90 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectCredentialsModal;
