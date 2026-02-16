import React, { useState } from 'react';
import { X, Bell, User, CheckCircle } from 'lucide-react';

interface NoticeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (message: string, priority: 'normal' | 'importante' | 'urgente') => void;
    authorName: string | null;
    authorAvatar: string | null;
}

const NoticeModal: React.FC<NoticeModalProps> = ({
    isOpen,
    onClose,
    onSave,
    authorName,
    authorAvatar
}) => {
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState<'normal' | 'importante' | 'urgente'>('normal');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim()) {
            onSave(message, priority);
            setMessage('');
            setPriority('normal');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">

                {/* Header */}
                <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Bell className="text-brand-coral" />
                        Novo Aviso
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {/* Author Info */}
                    <div className="flex items-center gap-3 mb-6 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center border-2 border-white dark:border-slate-600">
                            {authorAvatar ? (
                                <img src={authorAvatar} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <User className="text-slate-400" size={20} />
                            )}
                        </div>
                        <div>
                            <span className="block text-xs text-slate-400 uppercase font-bold">Autor</span>
                            <span className="block text-sm font-bold text-slate-800 dark:text-white">{authorName || 'Usuário'}</span>
                        </div>
                        <div className="ml-auto text-right">
                            <span className="block text-xs text-slate-400 uppercase font-bold">Data</span>
                            <span className="block text-sm font-bold text-slate-800 dark:text-white">{new Date().toLocaleDateString()}</span>
                        </div>
                    </div>

                    {/* Message Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                            Mensagem / Comunicado
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full h-32 px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all resize-none text-slate-800 dark:text-white"
                            placeholder="Escreva seu aviso aqui..."
                            required
                        />
                    </div>

                    {/* Priority Selection */}
                    <div className="mb-8">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                            Nível de Importância
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={() => setPriority('normal')}
                                className={`px-4 py-3 rounded-xl border font-bold text-sm transition-all ${priority === 'normal'
                                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white ring-2 ring-slate-400 dark:ring-slate-500'
                                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700'
                                    }`}
                            >
                                Normal
                            </button>
                            <button
                                type="button"
                                onClick={() => setPriority('importante')}
                                className={`px-4 py-3 rounded-xl border font-bold text-sm transition-all ${priority === 'importante'
                                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 ring-2 ring-amber-400'
                                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-amber-300'
                                    }`}
                            >
                                Importante
                            </button>
                            <button
                                type="button"
                                onClick={() => setPriority('urgente')}
                                className={`px-4 py-3 rounded-xl border font-bold text-sm transition-all ${priority === 'urgente'
                                        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 ring-2 ring-red-400'
                                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-red-300'
                                    }`}
                            >
                                Urgente!
                            </button>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 px-4 bg-brand-coral text-white font-bold rounded-2xl hover:bg-brand-coral/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-coral/20"
                        >
                            <CheckCircle size={20} />
                            Publicar Aviso
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NoticeModal;
