import React, { useEffect, useRef, useState } from 'react';
import { X, Calendar, User, AlignLeft, Flag, Paperclip, Loader2, Trash2, MessageSquare, Save, Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';

interface Attachment {
    name: string;
    url: string;
}

interface Task {
    id?: string;
    project_id: number;
    title: string;
    description?: string;
    status: 'backlog' | 'in_progress' | 'approval' | 'done' | 'paused';
    priority: 'low' | 'medium' | 'high';
    assignee?: string;
    due_date: string;
    attachments?: Attachment[];
    assignee_response?: string;
    assignee_response_attachments?: Attachment[];
    assignee_response_updated_at?: string;
    assignee_response_updated_by?: string;
    created_at?: string;
    created_by?: string;
}

interface UserSummary {
    id: string;
    name: string;
    full_name?: string | null;
    role: string;
}

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task?: Task;
    projectId: number;
    projectName?: string;
    onSave: () => void | Promise<void>;
}

type AttachmentField = 'attachments' | 'assignee_response_attachments';

const normalizePersonName = (value?: string | null) =>
    (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, task, projectId, projectName, onSave }) => {
    const { fullName, userRole } = useUserRole();

    const createEmptyFormData = (): Task => ({
        project_id: projectId,
        title: '',
        description: '',
        status: '' as any,
        priority: '' as any,
        assignee: '',
        due_date: '',
        attachments: [],
        assignee_response: '',
        assignee_response_attachments: []
    });

    const [formData, setFormData] = useState<Task>(createEmptyFormData);
    const [loading, setLoading] = useState(false);
    const [savingUpdate, setSavingUpdate] = useState(false);
    const [uploadingTaskAttachments, setUploadingTaskAttachments] = useState(false);
    const [uploadingResponseAttachments, setUploadingResponseAttachments] = useState(false);
    const [assigneeOptions, setAssigneeOptions] = useState<UserSummary[]>([]);
    const taskFileInputRef = useRef<HTMLInputElement>(null);
    const responseFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            void fetchAssignees();
        }
    }, [isOpen]);

    const fetchAssignees = async () => {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('id, name, full_name, role')
                .in('role', ['gestor', 'operacional'])
                .order('name');

            if (error) throw error;
            if (data) setAssigneeOptions(data);
        } catch (err) {
            console.error('Error fetching assignees:', err);
        }
    };

    useEffect(() => {
        if (task) {
            setFormData({
                ...task,
                due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
                attachments: (task.attachments && Array.isArray(task.attachments))
                    ? task.attachments
                    : ((task as any).attachment_url ? [{ name: 'Anexo Antigo', url: (task as any).attachment_url }] : []),
                assignee_response: task.assignee_response || '',
                assignee_response_attachments: Array.isArray(task.assignee_response_attachments)
                    ? task.assignee_response_attachments
                    : []
            });
        } else {
            setFormData(createEmptyFormData());
        }
    }, [task, projectId, isOpen]);

    const updateAttachmentsField = (field: AttachmentField, attachments: Attachment[]) => {
        setFormData(prev => ({
            ...prev,
            [field]: attachments
        }));
    };

    const handleFileUpload = async (
        event: React.ChangeEvent<HTMLInputElement>,
        field: AttachmentField
    ) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const isResponseField = field === 'assignee_response_attachments';
        const currentAttachments = isResponseField
            ? (formData.assignee_response_attachments || [])
            : (formData.attachments || []);
        const setUploading = isResponseField ? setUploadingResponseAttachments : setUploadingTaskAttachments;
        const inputRef = isResponseField ? responseFileInputRef : taskFileInputRef;

        if (currentAttachments.length + files.length > 6) {
            alert('Você pode anexar no máximo 6 arquivos.');
            return;
        }

        try {
            setUploading(true);
            const newAttachments = [...currentAttachments];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                if (file.size > 2 * 1024 * 1024) {
                    alert(`O arquivo "${file.name}" excede o limite de 2MB e não será enviado.`);
                    continue;
                }

                const fileExt = file.name.split('.').pop();
                const fileName = `${projectId}/${isResponseField ? 'update' : 'task'}_${Date.now()}_${i}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('task-attachments')
                    .upload(filePath, file);

                if (uploadError) {
                    console.error('Storage error:', uploadError);
                    alert(`Erro ao enviar "${file.name}".`);
                    continue;
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('task-attachments')
                    .getPublicUrl(filePath);

                newAttachments.push({ name: file.name, url: publicUrl });
            }

            updateAttachmentsField(field, newAttachments);
        } catch (error: any) {
            console.error('Upload Error:', error);
            alert('Erro ao processar uploads.');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleRemoveAttachment = (field: AttachmentField, indexToRemove: number) => {
        const currentAttachments = field === 'assignee_response_attachments'
            ? (formData.assignee_response_attachments || [])
            : (formData.attachments || []);

        updateAttachmentsField(field, currentAttachments.filter((_, index) => index !== indexToRemove));
    };

    const handleDelete = async () => {
        if (!task?.id) return;

        if (!window.confirm('Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.')) {
            return;
        }

        setLoading(true);
        try {
            await supabase.from('task_history').insert({
                task_id: task.id,
                project_id: projectId,
                action: 'deleted',
                old_status: task.status,
                changed_by: fullName || 'Sistema',
                details: { title: task.title, deleted_id: task.id }
            });

            const { error } = await supabase
                .from('project_tasks')
                .delete()
                .eq('id', task.id);

            if (error) throw error;

            await Promise.resolve(onSave());
            onClose();
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Erro ao excluir tarefa');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const isEditing = !!task?.id;
    const normalizedCurrentUser = normalizePersonName(fullName);
    const normalizedAssignee = normalizePersonName(formData.assignee);
    const isAuthor = !isEditing || normalizePersonName(task?.created_by) === normalizedCurrentUser;
    const canEditDueDate = !isEditing || isAuthor;
    const canEditAssigneeResponse = !isEditing || userRole === 'gestor' || (normalizedAssignee !== '' && normalizedAssignee === normalizedCurrentUser);
    const taskAttachments = formData.attachments || [];
    const responseAttachments = formData.assignee_response_attachments || [];
    const isBusy = loading || savingUpdate || uploadingTaskAttachments || uploadingResponseAttachments;
    const responseChanged = isEditing
        ? (formData.assignee_response || '') !== (task?.assignee_response || '') ||
          JSON.stringify(responseAttachments) !== JSON.stringify(task?.assignee_response_attachments || [])
        : !!formData.assignee_response?.trim() || responseAttachments.length > 0;

    const persistTask = async ({ closeOnSuccess }: { closeOnSuccess: boolean }) => {
        const setSavingState = closeOnSuccess ? setLoading : setSavingUpdate;
        setSavingState(true);

        try {
            const { project_name, ...cleanData } = formData as any;

            const dataToSave = {
                ...cleanData,
                due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
                attachments: taskAttachments,
                assignee_response_attachments: responseAttachments,
                created_by: cleanData.created_by || fullName || 'Sistema',
            };

            dataToSave.attachment_url = null;

            if (task?.id && !canEditAssigneeResponse) {
                dataToSave.assignee_response = task.assignee_response || '';
                dataToSave.assignee_response_attachments = task.assignee_response_attachments || [];
                dataToSave.assignee_response_updated_at = task.assignee_response_updated_at || null;
                dataToSave.assignee_response_updated_by = task.assignee_response_updated_by || null;
            } else if (responseChanged) {
                dataToSave.assignee_response_updated_at = new Date().toISOString();
                dataToSave.assignee_response_updated_by = fullName || 'Sistema';
            }

            const trySave = async (data: any, retry = true): Promise<any> => {
                if (task?.id) {
                    const { error } = await supabase
                        .from('project_tasks')
                        .update(data)
                        .eq('id', task.id);
                    if (error) {
                        if (retry && error.message?.includes('created_by')) {
                            const { created_by, ...withoutCreatedBy } = data;
                            return trySave(withoutCreatedBy, false);
                        }
                        throw error;
                    }

                    await supabase.from('task_history').insert({
                        task_id: task.id,
                        project_id: projectId,
                        action: task.status !== data.status ? 'status_change' : 'updated',
                        old_status: task.status,
                        new_status: data.status,
                        changed_by: fullName || 'Sistema',
                        details: {
                            title: task.title,
                            response_updated: responseChanged,
                            response_attachments_count: responseAttachments.length
                        }
                    });
                    return null;
                }

                const { data: newTask, error } = await supabase
                    .from('project_tasks')
                    .insert([data])
                    .select()
                    .single();
                if (error) {
                    if (retry && error.message?.includes('created_by')) {
                        const { created_by, ...withoutCreatedBy } = data;
                        return trySave(withoutCreatedBy, false);
                    }
                    throw error;
                }

                if (newTask) {
                    await supabase.from('task_history').insert({
                        task_id: newTask.id,
                        project_id: projectId,
                        action: 'created',
                        new_status: newTask.status,
                        changed_by: fullName || 'Sistema',
                        details: {
                            title: newTask.title,
                            response_updated: !!data.assignee_response,
                            response_attachments_count: responseAttachments.length
                        }
                    });
                }
                return newTask;
            };

            await trySave(dataToSave);

            if (responseChanged && canEditAssigneeResponse) {
                setFormData(prev => ({
                    ...prev,
                    assignee_response_updated_at: dataToSave.assignee_response_updated_at || prev.assignee_response_updated_at,
                    assignee_response_updated_by: dataToSave.assignee_response_updated_by || prev.assignee_response_updated_by
                }));
            }

            await Promise.resolve(onSave());
            if (closeOnSuccess) {
                onClose();
            }
        } catch (error: any) {
            console.error('Error saving task:', error);
            const msg = error?.message || error?.details || JSON.stringify(error);
            if (String(msg).includes('assignee_response')) {
                alert('Erro ao salvar atualizacao da tarefa. Aplique as migrations do Supabase e tente novamente.\n\n' + msg);
            } else {
                alert(`${closeOnSuccess ? 'Erro ao salvar tarefa' : 'Erro ao salvar atualizacao'}:\n${msg}`);
            }
        } finally {
            setSavingState(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await persistTask({ closeOnSuccess: true });
    };

    const handleSaveUpdate = async () => {
        if (!task?.id) return;
        await persistTask({ closeOnSuccess: false });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-neutral-900 rounded-c4 shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] border border-neutral-200 dark:border-neutral-800">
                <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">

                    <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-white dark:bg-neutral-950 flex-shrink-0">
                        <div>
                            <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
                                {task ? 'Editar Tarefa' : 'Nova Tarefa'}
                            </h2>
                            {projectName && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-coral mt-1">
                                    {projectName}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {task?.id && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const url = `${window.location.origin}/projects?kanban=${projectId}&task=${task.id}`;
                                        navigator.clipboard.writeText(url);
                                        alert('Link da tarefa copiado para a área de transferência!');
                                    }}
                                    className="p-2 hover:bg-brand-coral/10 hover:text-brand-coral rounded-c4 transition-colors text-neutral-400 flex items-center gap-1.5 text-xs font-bold"
                                    title="Copiar link direto"
                                >
                                    <Link2 size={18} />
                                    <span className="hidden sm:inline">Copiar Link</span>
                                </button>
                            )}
                            <button type="button" onClick={onClose} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-c4 transition-colors text-neutral-400">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="p-6 pr-4 overflow-y-auto space-y-8 flex-1 min-h-0 custom-scrollbar">

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Tarefa <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full px-4 py-2 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none"
                                placeholder="Título da tarefa..."
                            />
                        </div>

                        {task?.created_at && (
                            <div className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    Criado em: {new Date(task.created_at).toLocaleDateString('pt-BR')} às {new Date(task.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="flex items-center gap-1">
                                    <User size={12} />
                                    por: <strong className="text-slate-300">{task.created_by || 'Não registrado'}</strong>
                                </span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1 tracking-wider">
                                    Prioridade <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Flag className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                                    <select
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                                        required
                                        className="w-full pl-10 pr-4 py-2 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none appearance-none"
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="low">Baixa</option>
                                        <option value="medium">Média</option>
                                        <option value="high">Alta</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1 tracking-wider">
                                    Status <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                                    required
                                    className="w-full px-4 py-2 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
                                >
                                    <option value="">Selecione...</option>
                                    <option value="backlog">Backlog</option>
                                    <option value="in_progress">Em Execução</option>
                                    <option value="approval">Aprovação</option>
                                    <option value="done">Finalizado</option>
                                    <option value="paused">Pausado</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1 tracking-wider">
                                    Responsável <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                                    <select
                                        value={formData.assignee}
                                        onChange={e => setFormData({ ...formData, assignee: e.target.value })}
                                        required
                                        className="w-full pl-10 pr-4 py-2 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none appearance-none"
                                    >
                                        <option value="">Selecione...</option>
                                        {assigneeOptions.map(user => {
                                            const displayName = user.full_name?.trim() || user.name;
                                            return (
                                                <option key={user.id} value={displayName}>
                                                    {displayName} ({user.role})
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1 tracking-wider">
                                    Prazo <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
                                    <input
                                        type="date"
                                        required
                                        value={formData.due_date}
                                        onChange={e => canEditDueDate && setFormData({ ...formData, due_date: e.target.value })}
                                        onClick={(e) => canEditDueDate && (e.target as HTMLInputElement).showPicker?.()}
                                        disabled={!canEditDueDate}
                                        title={!canEditDueDate ? `Somente o autor (${task?.created_by}) pode alterar o prazo` : ''}
                                        className={`w-full pl-10 pr-4 py-2 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none ${canEditDueDate ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                                    />
                                    {!canEditDueDate && (
                                        <p className="text-[10px] text-amber-500 mt-1">🔒 Apenas o criador ({task?.created_by}) pode alterar o prazo</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2 flex items-center gap-2">
                                <AlignLeft size={16} /> Descrição <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={8}
                                required
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full min-h-[220px] p-4 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none resize-y"
                                placeholder="Detalhes da tarefa..."
                            />
                        </div>

                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 p-5 space-y-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                                        <MessageSquare size={16} /> Atualização do Responsável
                                    </label>
                                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                        Campo para o responsável responder ao criador da tarefa com contexto, andamento e anexos.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveUpdate}
                                    disabled={!task?.id || !canEditAssigneeResponse || savingUpdate || uploadingResponseAttachments}
                                    className="inline-flex items-center justify-center gap-2 rounded-c4 border border-brand-coral/20 bg-brand-coral/10 px-4 py-2 text-xs font-bold text-brand-coral transition-colors hover:bg-brand-coral hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {savingUpdate ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                    {savingUpdate ? 'Salvando atualizacao...' : 'Salvar atualizacao'}
                                </button>
                            </div>

                            <textarea
                                rows={6}
                                value={formData.assignee_response || ''}
                                onChange={e => setFormData({ ...formData, assignee_response: e.target.value })}
                                disabled={!task?.id || !canEditAssigneeResponse}
                                className={`w-full min-h-[180px] rounded-c4 border border-neutral-300 p-4 text-neutral-900 outline-none transition-colors dark:border-neutral-700 dark:text-white ${!task?.id || !canEditAssigneeResponse ? 'cursor-not-allowed bg-neutral-100 opacity-70 dark:bg-neutral-900' : 'bg-white focus:ring-2 focus:ring-brand-coral dark:bg-neutral-900'}`}
                                placeholder={task?.id ? 'Escreva aqui a resposta ou atualizacao para o criador da tarefa...' : 'Salve a tarefa primeiro para habilitar a atualizacao do responsavel.'}
                            />

                            {(formData.assignee_response_updated_at || formData.assignee_response_updated_by) && (
                                <div className="rounded-c4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                                    Última atualização: {formData.assignee_response_updated_by || 'Responsável'} em {formData.assignee_response_updated_at ? new Date(formData.assignee_response_updated_at).toLocaleString('pt-BR') : 'data indisponível'}.
                                </div>
                            )}

                            {!task?.id && (
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                    A área de atualização do responsável fica disponível depois que a tarefa for salva pela primeira vez.
                                </p>
                            )}

                            {task?.id && !canEditAssigneeResponse && (
                                <p className="text-xs text-amber-500">
                                    Apenas o responsável atual da tarefa ou um gestor pode editar esta atualização.
                                </p>
                            )}

                            <div className="space-y-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                    Anexos da Atualização
                                </div>
                                <input
                                    type="file"
                                    ref={responseFileInputRef}
                                    className="hidden"
                                    onChange={(event) => void handleFileUpload(event, 'assignee_response_attachments')}
                                    multiple
                                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                                />

                                {responseAttachments.length > 0 && (
                                    <div className="max-h-36 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                        {responseAttachments.map((file, index) => (
                                            <div key={`${file.url}-${index}`} className="flex items-center justify-between gap-3 rounded-c4 border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
                                                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                                    <Paperclip size={18} className="text-brand-coral flex-shrink-0" />
                                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-neutral-700 hover:underline dark:text-neutral-200" title={file.name}>
                                                        {file.name}
                                                    </a>
                                                </div>
                                                {canEditAssigneeResponse && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAttachment('assignee_response_attachments', index)}
                                                        className="rounded-full p-1 text-red-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                                        title="Remover anexo da atualização"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {responseAttachments.length < 6 && (
                                    <button
                                        type="button"
                                        onClick={() => canEditAssigneeResponse && responseFileInputRef.current?.click()}
                                        disabled={!task?.id || !canEditAssigneeResponse || uploadingResponseAttachments}
                                        className={`w-full rounded-c4 border-2 border-dashed p-4 text-sm transition-colors ${!task?.id || !canEditAssigneeResponse ? 'cursor-not-allowed border-neutral-200 text-neutral-400 dark:border-neutral-800' : 'border-neutral-300 text-neutral-500 hover:bg-white dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900'} disabled:opacity-50`}
                                    >
                                        {uploadingResponseAttachments ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 size={18} className="animate-spin" />
                                                Enviando anexos da atualização...
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-2">
                                                <Paperclip size={18} />
                                                Anexar arquivos na atualização (Máx 6, 2MB cada)
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                Anexos da Tarefa
                            </div>
                            <input
                                type="file"
                                ref={taskFileInputRef}
                                className="hidden"
                                onChange={(event) => void handleFileUpload(event, 'attachments')}
                                multiple
                                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                            />

                            {taskAttachments.length > 0 && (
                                <div className="max-h-36 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                    {taskAttachments.map((file, index) => (
                                        <div key={`${file.url}-${index}`} className="flex items-center justify-between gap-3 p-3 rounded-c4 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                                            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                                <Paperclip size={18} className="text-brand-coral flex-shrink-0" />
                                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-neutral-700 dark:text-neutral-200 truncate hover:underline" title={file.name}>
                                                    {file.name}
                                                </a>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAttachment('attachments', index)}
                                                className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-full text-red-500"
                                                title="Remover anexo"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {taskAttachments.length < 6 && (
                                <button
                                    type="button"
                                    onClick={() => taskFileInputRef.current?.click()}
                                    disabled={uploadingTaskAttachments}
                                    className={`w-full border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-c4 p-4 flex items-center justify-center text-neutral-400 gap-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${uploadingTaskAttachments ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    {uploadingTaskAttachments ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            <span>Enviando arquivos...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Paperclip size={20} />
                                            <span>Anexar arquivos (Máx 6, 2MB cada)...</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                    </div>

                    <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex items-center justify-between flex-shrink-0">
                        <div>
                            {task?.id && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={isBusy}
                                    className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-c4 transition-colors flex items-center gap-2 font-bold text-sm"
                                >
                                    <Trash2 size={18} />
                                    Excluir
                                </button>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-xs text-neutral-500 font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-c4 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isBusy}
                                className="px-4 py-2 text-xs font-bold text-brand-coral hover:text-white transition-colors bg-brand-coral/10 hover:bg-brand-coral rounded-c4 border border-brand-coral/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default TaskModal;
