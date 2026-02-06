import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Camera, Save, User, Mail, Shield, AlertCircle, Loader2, Lock, Eye, EyeOff, Key, ClipboardList, Clock, Briefcase, ExternalLink, Activity, CheckCircle, AlertTriangle } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import { supabase } from '../lib/supabase';
import TaskModal from '../components/projects/TaskModal';

interface Task {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string;
    project_id: number;
    description?: string;
    assignee?: string;
    attachment_url?: string;
    project_name?: string;
}

const Account: React.FC = () => {
    const { email, userRole, fullName: contextFullName, avatarUrl: contextAvatarUrl, refreshRole } = useUserRole();

    const [fullName, setFullName] = useState('');
    const [calComLink, setCalComLink] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Password State
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Tasks State
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | undefined>(undefined);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

    useEffect(() => {
        if (contextFullName) setFullName(contextFullName);
        fetchUserProfile();
    }, [contextFullName]);

    const fetchUserProfile = async () => {
        if (!email) return;
        const { data, error } = await supabase
            .from('app_users')
            .select('cal_com_link')
            .eq('email', email)
            .single();

        if (data) {
            setCalComLink(data.cal_com_link || '');
        }
    };

    useEffect(() => {
        if (contextFullName) {
            fetchMyTasks(contextFullName);
        }
    }, [contextFullName]);

    const normalizeString = (str: string | undefined | null) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };

    const fetchMyTasks = async (userName: string) => {
        setLoadingTasks(true);
        try {
            // 1. Fetch Acceptances (Projects) for name mapping
            const { data: projectsData } = await supabase.from('acceptances').select('id, company_name');
            const projectsMap = new Map(projectsData?.map((p: any) => [p.id, p.company_name]) || []);

            // 2. Fetch Pending Tasks
            const { data: tasksData, error } = await supabase
                .from('project_tasks')
                .select('*')
                .neq('status', 'done')
                .order('due_date', { ascending: true });

            if (tasksData) {
                const targetName = normalizeString(userName);

                const userTasks = tasksData.filter((t: any) => {
                    const assigneeName = normalizeString(t.assignee);

                    // Robust matching: 
                    // 1. Exact match (normalized)
                    // 2. Assignee contains User Name (e.g. "Andre Cardia" contains "Andre")
                    // 3. User Name contains Assignee (e.g. "Andre Cardia" contains "Andre")
                    if (!assigneeName || !targetName) return false;

                    return assigneeName === targetName ||
                        assigneeName.includes(targetName) ||
                        targetName.includes(assigneeName);
                });

                const enrichedTasks = userTasks.map((t: any) => ({
                    ...t,
                    project_name: projectsMap.get(t.project_id) || 'Projeto Desconhecido'
                }));

                setMyTasks(enrichedTasks);
            }
        } catch (error) {
            console.error('Error fetching tasks', error);
        } finally {
            setLoadingTasks(false);
        }
    };

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
                .update({
                    full_name: fullName,
                    cal_com_link: calComLink
                })
                .eq('email', email);

            if (error) throw error;

            await refreshRole();
            // Refetch tasks with new name if needed
            if (fullName) fetchMyTasks(fullName);

            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });

        } catch (error: any) {
            setMessage({ type: 'error', text: 'Erro ao salvar perfil.' });
        } finally {
            setSaving(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!password || !confirmPassword) {
            setMessage({ type: 'error', text: 'Preencha os campos de senha.' });
            return;
        }

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'As senhas não coincidem.' });
            return;
        }

        if (password.length < 6) {
            setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
            return;
        }

        try {
            setUpdatingPassword(true);
            setMessage(null);

            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
            setPassword('');
            setConfirmPassword('');

        } catch (error: any) {
            console.error('Error updating password:', error);
            setMessage({ type: 'error', text: 'Erro ao atualizar senha. Tente novamente.' });
        } finally {
            setUpdatingPassword(false);
        }
    };

    const handleOpenTask = (task: Task) => {
        setSelectedTask(task);
        setSelectedProjectId(task.project_id);
        setShowTaskModal(true);
    };

    const handleCloseTaskModal = () => {
        setShowTaskModal(false);
        setSelectedTask(undefined);
        setSelectedProjectId(null);
        if (fullName) fetchMyTasks(fullName); // Refresh list
    };

    const getRoleLabel = (role: string | null) => {
        if (!role) return 'Não definido';
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    const getPriorityBadge = (priority: string) => {
        const styles = {
            low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        };
        const labels = { low: 'Baixa', medium: 'Média', high: 'Alta' };
        // @ts-ignore
        return <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles[priority] || styles.low}`}>{labels[priority] || priority}</span>;
    };

    const getStatusBadge = (status: string) => {
        const labels = { backlog: 'Backlog', in_progress: 'Execução', approval: 'Aprovação', done: 'Feito' };
        // @ts-ignore
        return <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{labels[status] || status}</span>
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="max-w-6xl mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-8">Minha Conta</h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Profile & Password */}
                    <div className="space-y-8">
                        {/* Profile Section */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="h-24 bg-gradient-to-r from-brand-coral to-pink-600 opacity-90"></div>
                            <div className="px-6 pb-6">
                                <div className="relative flex justify-center -mt-12 mb-4">
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
                                            {uploading ? <Loader2 className="w-3 h-3 animate-spin text-brand-coral" /> : <Camera className="w-3 h-3 text-slate-600 dark:text-slate-300" />}
                                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                                        </label>
                                    </div>
                                </div>

                                {message && (
                                    <div className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                        <AlertCircle size={16} />
                                        {message.text}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Completo</label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail</label>
                                        <input
                                            type="text"
                                            value={email || ''}
                                            disabled
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                                            Link do Cal.com (opcional)
                                        </label>
                                        <input
                                            type="text"
                                            value={calComLink}
                                            onChange={(e) => setCalComLink(e.target.value)}
                                            placeholder="ex: cal.com/seu-usuario"
                                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                        />
                                        <p className="text-xs text-slate-400 mt-1">
                                            Permite que outros usuários agendem reuniões com você nos projetos.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Função</label>
                                        <input
                                            type="text"
                                            value={getRoleLabel(userRole)}
                                            disabled
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={saving}
                                        className="w-full py-2 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        Salvar Alterações
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Password Change Section */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3">
                                <Key className="text-slate-400" size={20} />
                                <h3 className="font-bold text-slate-800 dark:text-white">Segurança</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                        placeholder="Nova Senha"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                        placeholder="Confirmar Senha"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="p-2 text-slate-400 hover:text-brand-coral border border-slate-300 dark:border-slate-600 rounded-xl"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>

                                <button
                                    onClick={handleUpdatePassword}
                                    disabled={updatingPassword}
                                    className="w-full py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                                >
                                    {updatingPassword ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />}
                                    Atualizar Senha
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Tasks */}
                    <div className="lg:col-span-2">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden min-h-[500px] flex flex-col">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-brand-coral/10 rounded-lg text-brand-coral">
                                        <ClipboardList size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Minhas Tarefas</h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Tarefas atribuídas a você</p>
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
                                    {myTasks.length} pendentes
                                </div>
                            </div>

                            <div className="p-6 flex-1 overflow-x-auto">
                                {loadingTasks ? (
                                    <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                                        <Loader2 className="animate-spin" /> Carregando tarefas...
                                    </div>
                                ) : myTasks.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 py-12">
                                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                                            <CheckCircle size={32} className="text-slate-300 dark:text-slate-500" />
                                        </div>
                                        <p>Você não tem tarefas pendentes.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="text-xs font-bold text-slate-500 uppercase border-b border-slate-100 dark:border-slate-700">
                                                <th className="py-3 pl-2">Tarefa</th>
                                                <th className="py-3">Projeto</th>
                                                <th className="py-3">Prazo</th>
                                                <th className="py-3">Prioridade</th>
                                                <th className="py-3">Status</th>
                                                <th className="py-3 text-right pr-2">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {myTasks.map(task => (
                                                <tr key={task.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                                                    <td className="py-3 pl-2 font-medium text-slate-800 dark:text-slate-200">
                                                        {task.title}
                                                    </td>
                                                    <td className="py-3 text-slate-600 dark:text-slate-400">
                                                        <div className="flex items-center gap-2">
                                                            <Briefcase size={14} className="text-slate-400" />
                                                            {task.project_name}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 text-slate-600 dark:text-slate-400">
                                                        <div className={`flex items-center gap-2 ${new Date(task.due_date) < new Date() ? 'text-red-500 font-bold' : ''}`}>
                                                            <Clock size={14} />
                                                            {new Date(task.due_date).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="py-3">
                                                        {getPriorityBadge(task.priority)}
                                                    </td>
                                                    <td className="py-3">
                                                        {getStatusBadge(task.status)}
                                                    </td>
                                                    <td className="py-3 text-right pr-2">
                                                        <button
                                                            onClick={() => handleOpenTask(task)}
                                                            className="text-brand-coral hover:text-red-600 font-bold text-xs flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            Abrir <ExternalLink size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {selectedProjectId && (
                    <TaskModal
                        isOpen={showTaskModal}
                        onClose={handleCloseTaskModal}
                        projectId={selectedProjectId}
                        task={selectedTask}
                        projectName={selectedTask?.project_name}
                        onSave={handleCloseTaskModal}
                    />
                )}
            </main>
        </div>
    );
};

export default Account;
