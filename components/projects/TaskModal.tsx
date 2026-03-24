import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, User, AlignLeft, Flag, Paperclip, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';

interface Task {
    id?: string;
    project_id: number;
    title: string;
    description?: string;
    status: 'backlog' | 'in_progress' | 'approval' | 'done' | 'paused';
    priority: 'low' | 'medium' | 'high';
    assignee?: string;
    due_date: string;
    attachments?: { name: string; url: string }[];
    created_at?: string;
    created_by?: string;
}

interface UserSummary {
    id: string;
    name: string;
    role: string;
}

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task?: Task; // If provided, we are editing
    projectId: number;
    projectName?: string;
    onSave: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, task, projectId, projectName, onSave }) => {
    const { fullName } = useUserRole();
    const [formData, setFormData] = useState<Task>({
        project_id: projectId,
        title: '',
        description: '',
        status: '' as any,
        priority: '' as any,
        assignee: '',
        due_date: '',
        attachments: []
    });
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [assigneeOptions, setAssigneeOptions] = useState<UserSummary[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            fetchAssignees();
        }
    }, [isOpen]);

    const fetchAssignees = async () => {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('id, name, role')
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
                attachments: (task.attachments && Array.isArray(task.attachments)) ? task.attachments : ((task as any).attachment_url ? [{ name: 'Anexo Antigo', url: (task as any).attachment_url }] : [])
            });
        } else {
            // Reset for new task
            setFormData({
                project_id: projectId,
                title: '',
                description: '',
                status: '' as any,
                priority: '' as any,
                assignee: '',
                due_date: '',
                attachments: []
            });
        }
    }, [task, projectId, isOpen]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            const currentAttachments = formData.attachments || [];

            // Check total files limit (max 6)
            if (currentAttachments.length + files.length > 6) {
                alert('Você pode anexar no máximo 6 arquivos.');
                return;
            }

            setUploading(true);
            const newAttachments = [...currentAttachments];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // 2MB limit check per file
                if (file.size > 2 * 1024 * 1024) {
                    alert(`O arquivo "${file.name}" excede o limite de 2MB e não será enviado.`);
                    continue;
                }

                // Create unique filename
                const fileExt = file.name.split('.').pop();
                const fileName = `${projectId}/${Date.now()}_${i}.${fileExt}`;
                const filePath = `${fileName}`;

                // Upload to Supabase Storage 'task-attachments' bucket
                const { error: uploadError } = await supabase.storage
                    .from('task-attachments')
                    .upload(filePath, file);

                if (uploadError) {
                    console.error('Storage error:', uploadError);
                    alert(`Erro ao enviar "${file.name}".`);
                    continue;
                }

                // Get Public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('task-attachments')
                    .getPublicUrl(filePath);

                newAttachments.push({ name: file.name, url: publicUrl });
            }

            setFormData(prev => ({ ...prev, attachments: newAttachments }));

        } catch (error: any) {
            console.error('Upload Error:', error);
            alert('Erro ao processar uploads.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveAttachment = (indexToRemove: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments?.filter((_, index) => index !== indexToRemove) || []
        }));
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

            onSave();
            onClose();
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Erro ao excluir tarefa');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Exclude project_name (UI only) from data sent to DB
            const { project_name, ...cleanData } = formData as any;

            const dataToSave = {
                ...cleanData,
                due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
                attachments: formData.attachments, // Send JSONB array
                created_by: cleanData.created_by || fullName || 'Sistema', // Auto-fill author
            };

            // Clear legacy field to ensure full migration on first edit
            dataToSave.attachment_url = null;

            console.log('[TaskModal] Saving with created_by:', dataToSave.created_by, '| fullName:', fullName);

            // Helper: tenta salvar com created_by, fallback sem ele se a coluna não existir
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
                        details: { title: task.title }
                    });
                    return null;
                } else {
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
                            details: { title: newTask.title }
                        });
                    }
                    return newTask;
                }
            };

            await trySave(dataToSave);

            onSave();
            onClose();
        } catch (error: any) {
            console.error('Error saving task:', error);
            const msg = error?.message || error?.details || JSON.stringify(error);
            alert('Erro ao salvar tarefa:\n' + msg);
        } finally {
            setLoading(false);
        }
    };



    // ... (existing code)

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-neutral-900 rounded-c4 shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-neutral-200 dark:border-neutral-800">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">

                    {/* Header */}
                    <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-white dark:bg-neutral-950">
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
                        <button type="button" onClick={onClose} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-c4 transition-colors text-neutral-400">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 overflow-y-auto space-y-6 flex-1">

                        {/* Title */}
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

                        {/* Creation Date & Author (Read-only) */}
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

                        {/* Meta Fields Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* Priority */}
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

                            {/* Status */}
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

                            {/* Assignee - Modified to Select */}
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
                                        {assigneeOptions.map(user => (
                                            <option key={user.id} value={user.name}>
                                                {user.name} ({user.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Due Date */}
                            {(() => {
                                const isEditing = !!task?.id;
                                const isAuthor = !isEditing || (task?.created_by && task.created_by === fullName);
                                const canEditDueDate = !isEditing || isAuthor;

                                return (
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
                                );
                            })()}
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2 flex items-center gap-2">
                                <AlignLeft size={16} /> Descrição <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={6}
                                required
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full p-4 rounded-c4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none resize-none"
                                placeholder="Detalhes da tarefa..."
                            />
                        </div>

                        {/* File Upload - Multi-file */}
                        <div className="space-y-4">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                                multiple // Allow multiple files
                                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                            />

                            {/* Render uploaded files list */}
                            {formData.attachments && formData.attachments.length > 0 && (
                                <div className="space-y-2">
                                    {formData.attachments.map((file, index) => (
                                        <div key={index} className="flex items-center justify-between p-3 rounded-c4 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <Paperclip size={18} className="text-brand-coral flex-shrink-0" />
                                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-neutral-700 dark:text-neutral-200 truncate hover:underline" title={file.name}>
                                                    {file.name}
                                                </a>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAttachment(index)}
                                                className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-full text-red-500"
                                                title="Remover anexo"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Upload Button - Hidden if limit reached */}
                            {(!formData.attachments || formData.attachments.length < 6) && (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-c4 p-4 flex items-center justify-center text-neutral-400 gap-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    {uploading ? (
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
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex items-center justify-between">
                        <div>
                            {task?.id && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={loading || uploading}
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
                                disabled={loading || uploading}
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
