import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import NoticeModal from '../components/NoticeModal';
import { Users as UsersIcon, Plus, Mail, Phone, Shield, Trash2, Edit, Bell, X } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';

interface AppUser {
    id: string; // generated uuid
    name: string;
    email: string;
    phone: string;
    role: 'leitor' | 'comercial' | 'gestor' | 'operacional';
    created_at: string;
}

const Users: React.FC = () => {
    const navigate = useNavigate();
    const { userRole, loading: roleLoading, fullName, avatarUrl, email } = useUserRole();

    // Shared State for Theme
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    // Users Data
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Form State
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'leitor' as 'leitor' | 'comercial' | 'gestor' | 'operacional'
    });
    const [creating, setCreating] = useState(false);

    // Notice State
    const [showNoticeModal, setShowNoticeModal] = useState(false);

    // Access control - redirect if not gestor
    useEffect(() => {
        if (!roleLoading && userRole !== 'gestor') {
            navigate('/dashboard');
        }
    }, [userRole, roleLoading, navigate]);

    useEffect(() => {
        if (userRole === 'gestor') {
            fetchUsers();
        }
    }, [userRole]);

    const fetchUsers = async () => {
        setLoading(true);
        // Assuming table 'app_users' exists
        const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: false });
        if (data) setUsers(data as AppUser[]);
        setLoading(false);
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);

        try {
            // Check if user already exists in profile table
            const { data: existing } = await supabase.from('app_users').select('id').eq('email', newUser.email).single();
            if (existing) {
                alert('Este e-mail já está cadastrado no sistema (perfil encontrado).');
                setCreating(false);
                return;
            }

            // Create a temporary client to interact with Auth without affecting admin session
            const tempSupabase = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            let authUser = null;

            // STRATEGY: Try to Log In first.
            // If the user already exists in Auth (from previous attempts), we just need to creates their profile.
            // This avoids "email rate limit" caused by calling signUp repeatedly on an existing user.
            const { data: loginData, error: loginError } = await tempSupabase.auth.signInWithPassword({
                email: newUser.email,
                password: newUser.password
            });

            if (loginData.user) {
                console.log('User already exists in Auth, skipping creation.');
                authUser = loginData.user;
            } else {
                // If login fails, try to Sign Up
                console.log('User not found (or wrong pass), attempting creation.');
                const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
                    email: newUser.email,
                    password: newUser.password,
                    options: {
                        data: { full_name: newUser.name }
                    }
                });

                if (signUpError) {
                    // Specific handling for common errors
                    if (signUpError.message.includes('already registered')) {
                        // Edge case: User exists but password provided was wrong in login attempt
                        alert('Este usuário já possui uma conta de autenticação (Auth), mas a senha informada está incorreta. Não foi possível vincular.');
                        throw signUpError;
                    }
                    throw signUpError;
                }

                authUser = signUpData.user;
            }

            // Create the user profile in app_users using the admin's client
            if (authUser) {
                const { error: dbError } = await supabase.from('app_users').insert([{
                    name: newUser.name,
                    email: newUser.email,
                    phone: newUser.phone,
                    role: newUser.role
                }]);

                if (dbError) throw dbError;

                setShowModal(false);
                setNewUser({ name: '', email: '', phone: '', password: '', role: 'leitor' });
                fetchUsers();
                alert('Usuário vinculado e cadastrado com sucesso!');
            }
        } catch (error: any) {
            console.error('Error creating user:', error);
            let msg = error.message || 'Erro ao criar usuário.';

            if (msg.includes('rate limit')) {
                msg = 'Limite de tentativas do Supabase atingido. Aguarde alguns minutos ou use outro e-mail.';
            }

            alert(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover este usuário?')) return;
        const { error } = await supabase.from('app_users').delete().eq('id', id);
        if (error) alert('Erro ao deletar.');
        else fetchUsers();
    };

    const handleUpdateRole = async (userId: string, newRole: string) => {
        const { error } = await supabase.from('app_users').update({ role: newRole }).eq('id', userId);
        if (error) {
            alert('Erro ao atualizar permissão.');
        } else {
            fetchUsers();
        }
    };

    const handleCreateNotice = async (message: string, priority: 'normal' | 'importante' | 'urgente') => {
        try {
            // Reuse logic from Dashboard or simplified insert
            // We need to ensure we have user info. 
            // Since we use useUserRole, we might have it already, but let's be safe.

            if (!email) {
                alert('Erro: Usuário não identificado.');
                return;
            }

            // If we rely on useUserRole, we have fullName.
            const authorName = fullName || 'Gestor';

            const { error } = await supabase.from('notices').insert([{
                message: message,
                author_email: email,
                author_name: authorName,
                priority: priority,
                created_at: new Date().toISOString()
            }]);

            if (error) throw error;

            alert('Aviso criado com sucesso!');
        } catch (error) {
            console.error('Error creating notice:', error);
            alert('Erro ao criar aviso.');
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'gestor': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800';
            case 'comercial': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
            case 'operacional': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800';
            default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'; // leitor
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gerenciar Usuários</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Cadastre e controle os níveis de acesso da equipe.</p>
                    </div>
                    {userRole === 'gestor' && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowNoticeModal(true)}
                                className="bg-transparent border-2 border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-amber-500/10"
                            >
                                <Bell className="w-4 h-4" />
                                Criar Aviso
                            </button>
                            <button
                                onClick={() => setShowModal(true)}
                                className="bg-transparent border-2 border-brand-coral text-brand-coral hover:bg-brand-coral hover:text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-brand-coral/10"
                            >
                                <Plus className="w-4 h-4" />
                                Novo Usuário
                            </button>
                        </div>
                    )}
                </div>

                {/* Users List */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-slate-400">Carregando usuários...</div>
                    ) : users.length === 0 ? (
                        <div className="p-16 flex flex-col items-center justify-center text-slate-400">
                            <UsersIcon className="w-12 h-12 mb-4 opacity-20" />
                            <p>Nenhum usuário cadastrado.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                                        <th className="p-5 font-bold">Usuário</th>
                                        <th className="p-5 font-bold">Contato</th>
                                        <th className="p-5 font-bold">Nível de Acesso</th>
                                        {userRole === 'gestor' && <th className="p-5 font-bold text-right">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-5">
                                                <div className="font-bold text-slate-800 dark:text-white">{user.name}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                        <Mail className="w-3 h-3 text-slate-400" />
                                                        {user.email}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
                                                        <Phone className="w-3 h-3" />
                                                        {user.phone}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                {userRole === 'gestor' ? (
                                                    <select
                                                        value={user.role}
                                                        onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wide cursor-pointer outline-none focus:ring-2 focus:ring-brand-coral/20 ${getRoleBadge(user.role)}`}
                                                    >
                                                        <option value="leitor">Leitor</option>
                                                        <option value="comercial">Comercial</option>
                                                        <option value="gestor">Gestor</option>
                                                        <option value="operacional">Operacional</option>
                                                    </select>
                                                ) : (
                                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getRoleBadge(user.role)} uppercase tracking-wide`}>
                                                        {user.role}
                                                    </span>
                                                )}
                                            </td>
                                            {/* Only Gestor can delete */}
                                            {userRole === 'gestor' && (
                                                <td className="p-5 text-right">
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        disabled={userRole !== 'gestor'}
                                                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Excluir usuário"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* Create User Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-brand-coral/10 p-3 rounded-xl text-brand-coral">
                                <Shield className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Novo Usuário</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Cadastre um novo membro na equipe.</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Nome Completo</label>
                                <input
                                    type="text"
                                    required
                                    value={newUser.name}
                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    placeholder="Ex: Ana Souza"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">E-mail</label>
                                    <input
                                        type="email"
                                        required
                                        value={newUser.email}
                                        onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                        placeholder="email@c4.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Telefone</label>
                                    <input
                                        type="tel"
                                        required
                                        value={newUser.phone}
                                        onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                        placeholder="(11) 99999-9999"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Senha de Acesso</label>
                                <input
                                    type="password"
                                    required
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-coral outline-none"
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                                <p className="text-xs text-slate-400 mt-1">Mínimo de 6 caracteres.</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Nível de Acesso</label>
                                <select
                                    value={newUser.role}
                                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'leitor' | 'comercial' | 'gestor' | 'operacional' })}
                                    disabled={userRole !== 'gestor'}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-coral focus:border-transparent dark:bg-slate-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    required
                                >
                                    <option value="leitor">Leitor</option>
                                    <option value="comercial">Comercial</option>
                                    <option value="gestor">Gestor</option>
                                    <option value="operacional">Operacional</option>
                                </select>
                                <p className="text-xs text-slate-400 mt-2 text-center">
                                    {newUser.role === 'leitor' && 'Apenas visualiza dados.'}
                                    {newUser.role === 'comercial' && 'Visualiza e cria propostas.'}
                                    {newUser.role === 'gestor' && 'Controle total do sistema.'}
                                    {newUser.role === 'operacional' && 'Acesso a Dashboard e Projetos.'}
                                </p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || userRole !== 'gestor'}
                                    className="flex-1 bg-brand-coral text-white py-3 rounded-xl font-bold hover:bg-red-500 transition-colors shadow-lg shadow-brand-coral/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creating ? 'Cadastrando...' : 'Cadastrar Usuário'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Notice Creation Modal */}
            <NoticeModal
                isOpen={showNoticeModal}
                onClose={() => setShowNoticeModal(false)}
                onSave={handleCreateNotice}
                authorName={fullName || 'Usuário'}
                authorAvatar={avatarUrl}
            />
        </div>
    );
};

export default Users;
