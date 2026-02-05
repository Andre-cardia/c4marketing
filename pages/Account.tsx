import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Camera, Save, User, Mail, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import { supabase } from '../lib/supabase';

const Account: React.FC = () => {
    const { email, userRole, fullName: contextFullName, avatarUrl: contextAvatarUrl, refreshRole } = useUserRole();

    const [fullName, setFullName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (contextFullName) setFullName(contextFullName);
    }, [contextFullName]);

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploading(true);
            setMessage(null);

            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('Você deve selecionar uma imagem para upload.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // 1. Upload to Storage
            let { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 3. Update User Profile
            const { error: updateError } = await supabase
                .from('app_users')
                .update({ avatar_url: publicUrl })
                .eq('email', email);

            if (updateError) {
                throw updateError;
            }

            await refreshRole(); // Refresh context to update Header
            setMessage({ type: 'success', text: 'Foto de perfil atualizada!' });

        } catch (error: any) {
            console.error('Error uploading avatar:', error);
            setMessage({ type: 'error', text: error.message || 'Erro ao atualizar foto.' });
        } finally {
            setUploading(false);
        }
    };

    const handleSaveProfile = async () => {
        try {
            setSaving(true);
            setMessage(null);

            const { error } = await supabase
                .from('app_users')
                .update({ full_name: fullName })
                .eq('email', email);

            if (error) throw error;

            await refreshRole();
            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });

        } catch (error: any) {
            setMessage({ type: 'error', text: 'Erro ao salvar perfil.' });
        } finally {
            setSaving(false);
        }
    };

    const getRoleLabel = (role: string | null) => {
        if (!role) return 'Não definido';
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-8">Minha Conta</h1>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">

                    {/* Header / Cover (Optional visual touch) */}
                    <div className="h-32 bg-gradient-to-r from-brand-coral to-pink-600 opacity-90"></div>

                    <div className="px-8 pb-8">
                        <div className="relative flex justify-between items-end -mt-12 mb-8">
                            {/* Avatar Section */}
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 bg-slate-200 overflow-hidden">
                                    {contextAvatarUrl ? (
                                        <img src={contextAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-400">
                                            <User size={40} />
                                        </div>
                                    )}
                                </div>
                                <label className="absolute bottom-0 right-0 p-2 bg-white dark:bg-slate-700 rounded-full shadow-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200 dark:border-slate-600">
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin text-brand-coral" /> : <Camera className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleAvatarUpload}
                                        disabled={uploading}
                                    />
                                </label>
                            </div>
                        </div>

                        {message && (
                            <div className={`mb-6 p-4 rounded-xl flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                <AlertCircle size={20} />
                                {message.text}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left Column: Editable Info */}
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Nome Completo
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-slate-400">
                                            <User size={20} />
                                        </span>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral focus:border-transparent outline-none transition-all"
                                            placeholder="Seu nome"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 shadow-md shadow-brand-coral/20 transition-all flex items-center gap-2 disabled:opacity-70"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Salvar Alterações
                                </button>
                            </div>

                            {/* Right Column: Read-only Info */}
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        E-mail
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-slate-400">
                                            <Mail size={20} />
                                        </span>
                                        <input
                                            type="text"
                                            value={email || ''}
                                            disabled
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">O e-mail não pode ser alterado.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Função / Cargo
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-slate-400">
                                            <Shield size={20} />
                                        </span>
                                        <input
                                            type="text"
                                            value={getRoleLabel(userRole)}
                                            disabled
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Account;
