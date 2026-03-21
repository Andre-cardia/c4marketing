
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const SetPassword: React.FC = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [checkingRecovery, setCheckingRecovery] = useState(true);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        let isMounted = true;
        const checkUser = async () => {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const hasRecoveryInHash =
                window.location.hash.includes('type=recovery') ||
                hashParams.has('access_token') ||
                hashParams.has('refresh_token');
            const searchParams = new URLSearchParams(window.location.search);
            const hasRecoveryInQuery =
                searchParams.get('type') === 'recovery' ||
                searchParams.has('token_hash') ||
                searchParams.has('code');
            const isRecoveryFlow = hasRecoveryInHash || hasRecoveryInQuery;

            if (isRecoveryFlow) {
                const code = searchParams.get('code');
                const tokenHash = searchParams.get('token_hash');
                const recoveryType = searchParams.get('type');
                const accessToken = hashParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token');

                // Legacy hash flow from recovery emails.
                if (accessToken && refreshToken) {
                    await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });
                }

                // PKCE flow recovery links can arrive with ?code=...
                if (code) {
                    await supabase.auth.exchangeCodeForSession(code);
                }

                // Some recovery links arrive with token_hash/type in query.
                if (tokenHash && recoveryType === 'recovery') {
                    await supabase.auth.verifyOtp({
                        type: 'recovery',
                        token_hash: tokenHash,
                    });
                }
            }

            const resolveUserFromSession = async () => {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) return user;
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
                return null;
            };

            const user = await resolveUserFromSession();
            if (user && user.email) {
                if (isMounted) setEmail(user.email);
            } else {
                // Recovery links can take a moment to hydrate the auth session in SPA.
                if (isRecoveryFlow) {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user?.email) {
                        if (isMounted) setEmail(session.user.email);
                        return;
                    }
                    if (isMounted) {
                        setMessage({
                            type: 'error',
                            text: 'Link de recuperação inválido ou expirado. Solicite um novo e-mail de recuperação.',
                        });
                    }
                    if (isMounted) setCheckingRecovery(false);
                    return;
                }

                // Non-recovery navigation should return to login.
                navigate('/');
                if (isMounted) setCheckingRecovery(false);
                return;
            }
            if (isMounted) setCheckingRecovery(false);
        };
        checkUser();

        return () => {
            isMounted = false;
        };
    }, [navigate]);

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

    if (checkingRecovery) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="flex items-center gap-3 text-slate-300">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Validando link de recuperação...</span>
                </div>
            </div>
        );
    }

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
                        Recuperação de Senha
                    </h1>
                    {email && (
                        <div className="flex justify-center mb-4">
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700">
                                {email}
                            </span>
                        </div>
                    )}
                    <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm">
                        Defina sua nova senha para acessar sua conta.
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
                            {loading ? <Loader2 className="animate-spin" /> : 'Salvar Nova Senha'}
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
