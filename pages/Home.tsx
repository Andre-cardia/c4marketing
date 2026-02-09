import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogIn, ArrowRight, UserPlus, Lock } from 'lucide-react';

const Home: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('ERRO DE CONFIGURAÇÃO: As variáveis de ambiente do Supabase (URL/KEY) não foram carregadas. O sistema não pode se conectar ao banco de dados.');
    } else {
      checkUser();
    }
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate('/dashboard');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/dashboard');
      } else {
        // Register Mode (First Access)
        if (password !== confirmPassword) {
          throw new Error('As senhas não coincidem.');
        }

        if (password.length < 6) {
          throw new Error('A senha deve ter no mínimo 6 caracteres.');
        }

        // 1. Attempt Sign Up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          setSuccessMessage('Conta criada com sucesso! Faça login para continuar.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (err: any) {
      // Translate common Supabase errors
      if (err.message.includes('Invalid login credentials')) {
        setError('Credenciais inválidas. Verifique seu e-mail e senha.');
      } else if (err.message.includes('User already registered')) {
        setError('Este usuário já possui cadastro. Faça login.');
        setMode('login');
      } else {
        setError(err.message || 'Ocorreu um erro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-coral/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>

      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>

      <div className="w-full max-w-5xl grid lg:grid-cols-2 bg-white/5 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 relative z-10">

        {/* Left Side - Brand */}
        <div className="p-12 lg:p-16 flex flex-col justify-between relative">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-coral/20 to-transparent opacity-50"></div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12">
              <img src="/logo.png" alt="C4 Marketing" className="h-10 brightness-0 invert opacity-90" />
            </div>

            <h1 className="text-5xl lg:text-6xl font-black text-white leading-tight mb-6">
              Gestão de <br />
              <span className="text-brand-coral">Alta Performance</span>
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
              Gerencie propostas, acompanhe aceites e controle contratos em um único lugar.
            </p>
          </div>

          <div className="relative z-10 hidden lg:block">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-mono">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              System Online v2.4.0
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="bg-white p-12 lg:p-16 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {mode === 'login' ? 'Bem-vindo ao C4 Manager' : 'Primeiro Acesso'}
            </h2>
            <p className="text-slate-500">
              {mode === 'login'
                ? 'Faça login para acessar o painel administrativo.'
                : 'Defina sua senha para ativar seu cadastro.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 border border-red-100 flex items-center gap-2">
              <span className="font-bold">Erro:</span> {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 text-green-600 p-4 rounded-xl text-sm mb-6 border border-green-100 flex items-center gap-2">
              <span className="font-bold">Sucesso:</span> {successMessage}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">E-mail Corporativo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-brand-coral focus:bg-white bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-300"
                placeholder="nome@c4marketing.com.br"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-brand-coral focus:bg-white bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400"
                placeholder="••••••••"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="animate-in slide-in-from-top-4 duration-300 fade-in">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-1">Confirmar Senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-brand-coral focus:bg-white bg-slate-50 outline-none transition-all text-slate-800 font-medium placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-dark text-white py-5 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center justify-center gap-3 group mt-4"
            >
              {loading ? 'Processando...' : (
                <>
                  {mode === 'login' ? 'Acessar Dashboard' : 'Criar Senha de Acesso'}
                  {mode === 'login' ? <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /> : <Lock className="w-4 h-4" />}
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            {mode === 'login' ? (
              <p className="text-sm text-slate-500">
                Primeiro acesso?{' '}
                <button
                  onClick={() => { setMode('register'); setError(null); }}
                  className="text-brand-coral font-bold hover:underline"
                >
                  Criar senha
                </button>
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                Já tem conta?{' '}
                <button
                  onClick={() => { setMode('login'); setError(null); }}
                  className="text-brand-coral font-bold hover:underline"
                >
                  Fazer login
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
