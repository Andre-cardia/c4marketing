
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';

const ResetPasswordHandler: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Check URL hash for recovery mode (fallback if event is missed)
        if (window.location.hash && window.location.hash.includes('type=recovery')) {
            console.log('Recovery mode detected via URL hash');
            setIsOpen(true);
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[ResetPasswordHandler] Auth event:', event);
            if (event === 'PASSWORD_RECOVERY') {
                console.log('Password recovery event captured');
                setIsOpen(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            alert('As senhas não conferem.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;

            alert('Senha atualizada com sucesso!');
            setIsOpen(false);
            setPassword('');
            setConfirmPassword('');
            // Optional: navigate to dashboard or login
        } catch (error: any) {
            console.error('Error updating password:', error);
            alert(`Erro ao atualizar senha: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-coral to-red-500"></div>

                <div className="flex flex-col items-center mb-6 text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-brand-coral" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Definir Nova Senha</h2>
                    <p className="text-slate-500 text-sm mt-2">Digite sua nova senha de acesso seguro.</p>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nova Senha</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-brand-coral focus:ring-1 focus:ring-brand-coral outline-none transition-all font-medium text-slate-800"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Confirmar Senha</label>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-brand-coral focus:ring-1 focus:ring-brand-coral outline-none transition-all font-medium text-slate-800"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-coral hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                    >
                        {loading ? 'Atualizando...' : 'Salvar Nova Senha'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPasswordHandler;
