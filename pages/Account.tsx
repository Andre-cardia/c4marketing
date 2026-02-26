import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Save, User, Mail, Shield, AlertCircle, Loader2, Lock, Eye, EyeOff, Key, ClipboardList, Clock, Briefcase, ExternalLink, Activity, CheckCircle, AlertTriangle, Calendar, Video, Bot, Sparkles, MessageSquare, Trash2 } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import { supabase } from '../lib/supabase';
import TaskModal from '../components/projects/TaskModal';
import { getLatestFeedback, markFeedbackRead, generateUserFeedback, getSmartUserFeedback, AiFeedback } from '../lib/ai-agent';

interface Task {
    id: string;
    title: string;
    status: 'backlog' | 'in_progress' | 'approval' | 'done' | 'paused';
    priority: 'low' | 'medium' | 'high';
    due_date: string;
    project_id: number;
    description: string;
    assignee: string;
    attachment_url?: string;
    attachments?: { name: string; url: string }[];
    project_name?: string;
}

interface Booking {
    id: number;
    uid: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees: {
        name: string;
        email: string;
        timeZone: string;
    }[];
    status: string;
    meetingUrl: string;
}

const Account: React.FC = () => {
    const { email, userRole, fullName: contextFullName, avatarUrl: contextAvatarUrl, calComLink: contextCalComLink, refreshRole } = useUserRole();

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

    // Meetings State
    const [myBookings, setMyBookings] = useState<Booking[]>([]);
    const [loadingBookings, setLoadingBookings] = useState(false);
    const API_KEY = 'cal_live_dce1007edad18303ba5dedbb992d83e6';

    // AI Agent State
    const [aiMessage, setAiMessage] = useState<AiFeedback | null>(null);
    const [loadingAiMessage, setLoadingAiMessage] = useState(false);
    const [isPersistent, setIsPersistent] = useState(false);

    useEffect(() => {
        fetchMyBookings();
    }, []);

    const fetchMyBookings = async () => {
        setLoadingBookings(true);
        try {
            const url = `https://api.cal.com/v2/bookings?status=upcoming&limit=100`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();

                // Check for different API response structures
                let bookingsArray: any[] = [];

                if (data.data && Array.isArray(data.data)) {
                    bookingsArray = data.data;
                } else if (data.data && data.data.bookings && Array.isArray(data.data.bookings)) {
                    // Correctly handle the nested structure seen in logs
                    bookingsArray = data.data.bookings;
                }

                if (bookingsArray.length > 0) {
                    const mappedBookings = bookingsArray.map((b: any) => ({
                        ...b,
                        ...b,
                        meetingUrl: b.metadata?.videoCallUrl || b.references?.find((r: any) => r.meetingUrl)?.meetingUrl || b.location,
                        uid: b.uid
                    }));
                    setMyBookings(mappedBookings);
                }
            }
        } catch (error: any) {
            console.error('Error fetching bookings:', error);
        } finally {
            setLoadingBookings(false);
        }
    };

    useEffect(() => {
        if (contextFullName) setFullName(contextFullName);
        if (contextCalComLink) setCalComLink(contextCalComLink);
    }, [contextFullName, contextCalComLink]);

    useEffect(() => {
        if (contextFullName) {
            fetchMyTasks(contextFullName);
        }
    }, [contextFullName]);

    const initAiFeedback = useCallback(async (shouldForceNew = false) => {
        if (!email || !contextFullName) return;

        setLoadingAiMessage(true);
        try {
            if (shouldForceNew) {
                // Generate new feedback first
                await generateUserFeedback(email, contextFullName);
            }

            // Fetch smart feedback (gets latest relevant)
            let result = await getSmartUserFeedback(email, contextFullName);

            if (!result.feedback && !shouldForceNew) {
                // If initial load returned nothing, generate one (unless we just did)
                await generateUserFeedback(email, contextFullName);
                result = await getSmartUserFeedback(email, contextFullName);
            }

            setAiMessage(result.feedback);
            setIsPersistent(result.isPersistent);

        } catch (error) {
            console.error('Error with AI Agent:', error);
        } finally {
            setLoadingAiMessage(false);
        }
    }, [email, contextFullName]);

    useEffect(() => {
        if (email && contextFullName) {
            initAiFeedback();
        }
    }, [initAiFeedback, email, contextFullName]);

    const handleMarkRead = async () => {
        if (!aiMessage) return;
        try {
            await markFeedbackRead(aiMessage.id);
            if (!isPersistent) {
                setAiMessage(null); // Hide if dismissible
            } else {
                // Keep showing but update state
                // We create a new object to trigger re-render if needed, though react state update is enough
                setAiMessage({ ...aiMessage, is_read: true });
            }
        } catch (error) {
            console.error('Error marking read:', error);
        }
    }

    const handleCancelBooking = async (bookingUid: string) => {
        if (!confirm('Tem certeza que deseja excluir este agendamento? Ao fazer isso, você negará automaticamente a participação.')) return;

        try {
            const response = await fetch(`https://api.cal.com/v2/bookings/${bookingUid}/cancel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'cal-api-version': '2024-08-13'
                },
                body: JSON.stringify({
                    cancellationReason: 'Cancelado pelo usuário via Painel Admin'
                })
            });

            if (!response.ok) {
                throw new Error('Falha ao cancelar agendamento');
            }

            fetchMyBookings();
            setMessage({ type: 'success', text: 'Agendamento excluído com sucesso!' });
        } catch (error: any) {
            console.error('Error cancelling booking:', error);
            setMessage({ type: 'error', text: 'Erro ao excluir agendamento.' });
        }
    };

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
                    if (!assigneeName || !targetName) return false;
                    return assigneeName === targetName ||
                        assigneeName.includes(targetName) ||
                        targetName.includes(assigneeName);
                });

                const enrichedTasks = userTasks.map((t: any) => ({
                    ...t,
                    description: t.description || '',
                    assignee: t.assignee || '',
                    status: t.status as any,
                    priority: t.priority as any,
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

            // 0. Get User ID for RLS
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado.');

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`; // Use ID folder for RLS

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
                    name: fullName,
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
    };

    const handleTaskSaved = () => {
        if (fullName) {
            fetchMyTasks(fullName); // Refresh list
            // Refresh AI feedback forcing a new generation because context changed
            initAiFeedback(true);
        }
    };

    const getRoleLabel = (role: string | null) => {
        if (!role) return 'Não definido';
        return role.charAt(0).toUpperCase() + role.slice(1);
    };

    const getPriorityBadge = (priority: string) => {
        const styles = {
            low: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
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
        return <span className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">{labels[status] || status}</span>
    }

    return (
        <div className="space-y-8">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-8">Minha Conta</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Profile & Password */}
                <div className="space-y-6">
                    {/* Profile Section */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                        <div className="h-24 bg-gradient-to-r from-brand-coral to-pink-600 opacity-90"></div>
                        <div className="px-6 pb-6">
                            <div className="relative flex justify-center -mt-12 mb-4">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full border-4 border-white dark:border-neutral-900 bg-neutral-200 overflow-hidden">
                                        {contextAvatarUrl ? (
                                            <img src={contextAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 text-neutral-400">
                                                <User size={40} />
                                            </div>
                                        )}
                                    </div>
                                    <label className="absolute bottom-0 right-0 p-2 bg-white dark:bg-neutral-800 rounded-full shadow-lg cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors border border-neutral-200 dark:border-neutral-700">
                                        {uploading ? <Loader2 className="w-3 h-3 animate-spin text-brand-coral" /> : <Camera className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                                    </label>
                                </div>
                            </div>

                            {message && (
                                <div className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'}`}>
                                    <AlertCircle size={16} />
                                    {message.text}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Nome Completo</label>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Link do Cal.com / Username</label>
                                    <input
                                        type="text"
                                        value={calComLink}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/^(https?:\/\/)?(www\.)?cal\.com\//, '').replace(/^\//, '');
                                            setCalComLink(val);
                                        }}
                                        placeholder="Ex: andre-cardia/reuniao-da-equipe"
                                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                    />
                                    <p className="text-[10px] text-neutral-400 mt-1">Este link será usado para o botão "Agendar Reunião Interna".</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">E-mail</label>
                                    <input
                                        type="text"
                                        value={email || ''}
                                        disabled
                                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Função</label>
                                    <input
                                        type="text"
                                        value={getRoleLabel(userRole)}
                                        disabled
                                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed text-sm"
                                    />
                                </div>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="w-full py-2.5 text-sm font-bold text-brand-coral hover:text-white transition-colors bg-brand-coral/10 hover:bg-brand-coral rounded-xl border border-brand-coral/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                    Salvar Alterações
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Password Change Section */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3">
                            <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                                <Key className="text-neutral-500 dark:text-neutral-400" size={18} />
                            </div>
                            <h3 className="font-bold text-neutral-800 dark:text-white">Segurança</h3>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                    placeholder="Nova Senha"
                                />
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none text-sm"
                                    placeholder="Confirmar Senha"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="p-2.5 text-neutral-400 hover:text-brand-coral border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            <button
                                onClick={handleUpdatePassword}
                                disabled={updatingPassword}
                                className="w-full py-2.5 text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:text-white transition-colors bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-700 dark:hover:bg-neutral-700 rounded-xl border border-neutral-200 dark:border-neutral-700 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {updatingPassword ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />}
                                Atualizar Senha
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Meetings & Tasks */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Meetings Section */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-brand-coral/10 rounded-lg text-brand-coral">
                                    <Calendar size={18} />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">Agenda (c4storage1)</h2>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Todos os agendamentos</p>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-700">
                                {myBookings.length} agendadas
                            </span>
                        </div>

                        <div className="p-5">
                            {loadingBookings ? (
                                <div className="flex items-center justify-center text-neutral-400 gap-2 py-8">
                                    <Loader2 className="animate-spin" size={18} /> Carregando agenda...
                                </div>
                            ) : myBookings.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-neutral-400 gap-2 py-10">
                                    <Calendar size={32} className="opacity-20" />
                                    <p className="text-sm">Nenhuma reunião encontrada para seu e-mail.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {myBookings.map(booking => (
                                        <div key={booking.id} className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700 rounded-xl hover:border-brand-coral/40 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-center justify-center w-12 h-12 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
                                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">
                                                        {new Date(booking.startTime).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}
                                                    </span>
                                                    <span className="text-lg font-bold text-brand-coral leading-none">
                                                        {new Date(booking.startTime).getDate()}
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-neutral-800 dark:text-white text-sm">{booking.title}</h4>
                                                    <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                                                        <Clock size={11} />
                                                        {new Date(booking.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(booking.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {booking.meetingUrl && (
                                                    <a
                                                        href={booking.meetingUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-brand-coral/10 hover:bg-brand-coral text-brand-coral hover:text-white rounded-lg transition-colors"
                                                        title="Entrar na Reunião"
                                                    >
                                                        <Video size={16} />
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => handleCancelBooking(booking.uid)}
                                                    className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors border border-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 dark:border-red-900/30"
                                                    title="Excluir Agendamento"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* AI Manager Section */}
                    <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-2xl shadow-lg border border-neutral-700 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Bot size={140} className="text-white" />
                        </div>

                        <div className="p-6 relative z-10">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-brand-coral/20 rounded-xl text-brand-coral shrink-0">
                                    <Sparkles size={22} />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                                        Gestor de Projetos IA
                                        {loadingAiMessage && <Loader2 size={14} className="animate-spin text-neutral-400" />}
                                    </h2>

                                    {loadingAiMessage ? (
                                        <div className="animate-pulse space-y-2 mt-3">
                                            <div className="h-2.5 bg-neutral-700 rounded w-full"></div>
                                            <div className="h-2.5 bg-neutral-700 rounded w-3/4"></div>
                                        </div>
                                    ) : aiMessage ? (
                                        <div className="mt-2">
                                            <div className={`rounded-xl p-4 border text-neutral-200 leading-relaxed text-sm font-medium shadow-sm ${isPersistent
                                                ? 'border-l-4 border-l-red-500 bg-red-500/10 border-red-500/30'
                                                : 'bg-white/5 border-white/10'
                                                }`}>
                                                "{aiMessage.message}"
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <button
                                                    onClick={handleMarkRead}
                                                    disabled={aiMessage.is_read}
                                                    className={`flex items-center gap-2 text-xs font-bold transition-colors px-3 py-1.5 rounded-lg border ${aiMessage.is_read
                                                        ? 'text-neutral-500 bg-neutral-800/50 border-neutral-700 cursor-default'
                                                        : 'text-brand-coral hover:text-white bg-brand-coral/10 hover:bg-brand-coral border-brand-coral/30'
                                                        }`}
                                                >
                                                    <CheckCircle size={13} />
                                                    {aiMessage.is_read
                                                        ? (isPersistent ? 'Ciente (Pendências Ativas)' : 'Lido')
                                                        : 'Confirmar Leitura'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-neutral-400 text-sm mt-1">
                                            Tudo certo por aqui! Nenhuma mensagem nova do seu gestor.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tasks Section */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
                        <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-brand-coral/10 rounded-lg text-brand-coral">
                                    <ClipboardList size={18} />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">Minhas Tarefas</h2>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Tarefas atribuídas a você</p>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-700">
                                {myTasks.length} pendentes
                            </span>
                        </div>

                        <div className="p-5 flex-1 overflow-x-auto">
                            {loadingTasks ? (
                                <div className="h-full flex items-center justify-center text-neutral-400 gap-2">
                                    <Loader2 className="animate-spin" size={18} /> Carregando tarefas...
                                </div>
                            ) : myTasks.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-neutral-400 gap-4 py-12">
                                    <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
                                        <CheckCircle size={28} className="text-neutral-300 dark:text-neutral-600" />
                                    </div>
                                    <p className="text-sm">Você não tem tarefas pendentes.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-100 dark:border-neutral-800">
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
                                            <tr key={task.id} className="border-b border-neutral-50 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
                                                <td className="py-3 pl-2 font-medium text-neutral-800 dark:text-neutral-100">
                                                    {task.title}
                                                </td>
                                                <td className="py-3 text-neutral-500 dark:text-neutral-400">
                                                    <div className="flex items-center gap-2">
                                                        <Briefcase size={13} className="text-neutral-400 shrink-0" />
                                                        {task.project_name}
                                                    </div>
                                                </td>
                                                <td className="py-3">
                                                    <div className={`flex items-center gap-1.5 text-sm ${new Date(task.due_date) < new Date() ? 'text-red-500 font-bold' : 'text-neutral-500 dark:text-neutral-400'}`}>
                                                        <Clock size={13} />
                                                        {new Date(task.due_date).toLocaleDateString('pt-BR')}
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
                                                        className="text-brand-coral hover:text-red-500 font-bold text-xs flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        Abrir <ExternalLink size={11} />
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
                    onSave={handleTaskSaved}
                />
            )}
        </div>
    );
};

export default Account;
