
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const SetPassword: React.FC = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'As senhas não conferem.' });
            return;
        }

        if (password.length < 6) {
            setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;

            setMessage({ type: 'success', text: 'Senha definida com sucesso! Redirecionando...' });

            setTimeout(() => {
                navigate('/');
            }, 2000);
        } catch (error: any) {
            console.error('Error updating password:', error);
            setMessage({ type: 'error', text: `Erro: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-500">
                <div className="h-2 bg-gradient-to-r from-brand-coral to-red-600"></div>

                <div className="p-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                            <Lock className="w-8 h-8 text-brand-coral" />
                        </div>
                    </div>

                    <h1 className="text-2xl font-black text-center text-slate-800 dark:text-white mb-2">
                        Bem-vindo(a)!
                    </h1>
                    <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm">
                        Para garantir sua segurança, defina uma senha de acesso para sua conta.
                    </p>

                    {message && (
                        <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 ${message.type === 'success'
                                ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
                                : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30'
                            }`}>
                            {message.type === 'success' ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                            <span>{message.text}</span>
                        </div>
                    )}

                    <form onSubmit={handleUpdatePassword} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nova Senha</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-brand-coral focus:ring-1 focus:ring-brand-coral outline-none transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400"
                                    placeholder="Mínimo 6 caracteres"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Confirmar Senha</label>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-brand-coral focus:ring-1 focus:ring-brand-coral outline-none transition-all font-medium text-slate-800 dark:text-white placeholder:text-slate-400"
                                placeholder="Repita a senha"
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-brand-coral hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Definir Senha e Entrar'}
                        </button>
                    </form>
                </div>
            </div>

            <p className="mt-8 text-slate-600 text-xs font-medium opacity-50">
                &copy; C4 Marketing - Sistema Seguro
            </p>
        </div>
    );
};

export default SetPassword;
