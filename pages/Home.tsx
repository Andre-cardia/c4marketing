import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, UserPlus, Lock, Mail, KeyRound, Eye, EyeOff, Shield, Zap, BarChart3 } from 'lucide-react';

const Home: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Animated Background Orbs */}
      <div className="absolute top-[-20%] right-[-10%] w-[700px] h-[700px] bg-brand-coral/10 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '6s' }}></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-slate-600/10 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '8s' }}></div>
      <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-brand-coral/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }}></div>

      {/* Noise Texture */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }}
      ></div>

      {/* Main Container */}
      <div className="w-full max-w-5xl grid lg:grid-cols-2 relative z-10 gap-0">

        {/* Left Side - Brand & Features */}
        <div className="p-10 lg:p-14 flex flex-col justify-between relative">
          {/* Logo */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <img src="/logo.png" alt="C4 Marketing" className="h-14 brightness-0 invert opacity-90" />
            </div>
            <div className="h-0.5 w-12 bg-gradient-to-r from-brand-coral to-transparent mt-4"></div>
          </div>

          {/* Headline */}
          <div className="mb-12">
            <h1 className="text-5xl lg:text-6xl font-black text-white leading-[1.1] mb-6 tracking-tight">
              Gestão de{' '}
              <span className="bg-gradient-to-r from-brand-coral to-red-400 bg-clip-text text-transparent">
                Alta Performance
              </span>
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
              Gerencie propostas, acompanhe aceites e controle contratos em um único lugar.
            </p>
          </div>

          {/* Feature Highlights */}
          <div className="space-y-4 mb-12">
            {[
              { icon: <Shield size={16} />, text: 'Segurança corporativa de ponta a ponta' },
              { icon: <Zap size={16} />, text: 'Inteligência artificial para análise comercial' },
              { icon: <BarChart3 size={16} />, text: 'Dashboard com métricas em tempo real' },
            ].map((feat, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-brand-coral group-hover:bg-brand-coral/20 group-hover:border-brand-coral/30 transition-all duration-300">
                  {feat.icon}
                </div>
                <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">{feat.text}</span>
              </div>
            ))}
          </div>

          {/* System Status */}
          <div className="hidden lg:flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600 font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              System Online
            </div>
            <span className="text-slate-700">•</span>
            <span className="text-slate-700 font-mono">v3.0.0</span>
          </div>
        </div>

        {/* Right Side - Glassmorphism Login Form */}
        <div className="flex items-center justify-center p-4 lg:p-8">
          <div className="w-full max-w-md bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 lg:p-10 shadow-2xl shadow-black/40 relative overflow-hidden">

            {/* Subtle glow on card */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-coral/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-slate-500/10 rounded-full blur-[80px] pointer-events-none"></div>

            {/* Header */}
            <div className="relative mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-brand-coral/10 border border-brand-coral/20 rounded-xl">
                  {mode === 'login' ? <KeyRound size={20} className="text-brand-coral" /> : <UserPlus size={20} className="text-brand-coral" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {mode === 'login' ? 'Bem-vindo de volta' : 'Primeiro Acesso'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mode === 'login'
                      ? 'Acesse o painel administrativo'
                      : 'Defina sua senha de acesso'}
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-xl text-sm mb-5 border border-red-500/20 flex items-start gap-2">
                <span className="font-bold text-red-400 shrink-0">✕</span>
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {successMessage && (
              <div className="bg-emerald-500/10 text-emerald-400 px-4 py-3 rounded-xl text-sm mb-5 border border-emerald-500/20 flex items-start gap-2">
                <span className="font-bold shrink-0">✓</span>
                <span>{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 ml-1">
                  E-mail corporativo
                </label>
                <div className="relative group">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-brand-coral transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-slate-600 focus:border-brand-coral/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-coral/10 outline-none transition-all text-sm font-medium"
                    placeholder="nome@c4marketing.com.br"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 ml-1">
                  Senha
                </label>
                <div className="relative group">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-brand-coral transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-slate-600 focus:border-brand-coral/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-coral/10 outline-none transition-all text-sm font-medium"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password (Register mode) */}
              {mode === 'register' && (
                <div className="space-y-2 animate-in slide-in-from-top-4 duration-300 fade-in">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 ml-1">
                    Confirmar Senha
                  </label>
                  <div className="relative group">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-brand-coral transition-colors" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-slate-600 focus:border-brand-coral/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-brand-coral/10 outline-none transition-all text-sm font-medium"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative bg-white/[0.04] backdrop-blur-md border border-white/[0.12] text-white py-4 rounded-xl font-bold transition-all hover:bg-white/[0.08] hover:border-brand-coral/30 hover:-translate-y-0.5 flex items-center justify-center gap-3 group mt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 overflow-hidden"
              >
                {/* Button shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>

                <span className="relative z-10 flex items-center gap-3">
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processando...
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? 'Acessar Dashboard' : 'Criar Senha de Acesso'}
                      {mode === 'login' ? <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /> : <Lock className="w-4 h-4" />}
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Mode Toggle */}
            <div className="mt-8 text-center">
              {mode === 'login' ? (
                <p className="text-sm text-slate-600">
                  Primeiro acesso?{' '}
                  <button
                    onClick={() => { setMode('register'); setError(null); }}
                    className="text-brand-coral font-bold hover:text-white transition-colors"
                  >
                    Criar senha
                  </button>
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  Já tem conta?{' '}
                  <button
                    onClick={() => { setMode('login'); setError(null); }}
                    className="text-brand-coral font-bold hover:text-white transition-colors"
                  >
                    Fazer login
                  </button>
                </p>
              )}
            </div>

            {/* Security Badge */}
            <div className="mt-6 pt-5 border-t border-white/[0.05] text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                <Shield size={10} className="text-emerald-500" />
                Conexão segura • Dados criptografados
              </div>
              <p className="text-[10px] text-slate-600 font-medium">
                Atenção: Acesse pelo Desktop
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile System Status */}
      <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-slate-700 font-mono z-20">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
        </span>
        v3.0.0
      </div>
    </div>
  );
};

export default Home;
