import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, User, AlignLeft, Flag, Paperclip, Loader2, Trash2, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Task {
    id?: string;
    project_id: number;
    title: string;
    description: string;
    status: 'backlog' | 'in_progress' | 'approval' | 'done' | 'paused';
    priority: 'low' | 'medium' | 'high';
    assignee: string;
    due_date: string;
    attachment_url?: string;
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
    const [formData, setFormData] = useState<Task>({
        project_id: projectId,
        title: '',
        description: '',
        status: 'backlog',
        priority: 'medium',
        assignee: '',
        due_date: '',
        attachment_url: ''
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
                attachment_url: task.attachment_url || ''
            });
        } else {
            // Reset for new task
            setFormData({
                project_id: projectId,
                title: '',
                description: '',
                status: 'backlog',
                priority: 'medium',
                assignee: '',
                due_date: '',
                attachment_url: ''
            });
        }
    }, [task, projectId, isOpen]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;

            // 1MB limit check
            if (file.size > 1024 * 1024) {
                alert('O arquivo deve ter no máximo 1MB.');
                return;
            }

            setUploading(true);

            // Create unique filename
            const fileExt = file.name.split('.').pop();
            const fileName = `${projectId}/${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to Supabase Storage 'task-attachments' bucket
            const { error: uploadError } = await supabase.storage
                .from('task-attachments')
                .upload(filePath, file);

            if (uploadError) {
                console.error('Storage error:', uploadError);
                throw uploadError;
            }

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('task-attachments')
                .getPublicUrl(filePath);

            setFormData(prev => ({ ...prev, attachment_url: publicUrl }));
            alert('Arquivo anexado com sucesso!');

        } catch (error: any) {
            console.error('Upload Error:', error);
            if (error.message && error.message.includes('Bucket not found')) {
                alert('Erro: Bucket de armazenamento "task-attachments" não encontrado. Contate o administrador.');
            } else {
                alert('Erro ao fazer upload do arquivo.');
            }
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveAttachment = () => {
        setFormData(prev => ({ ...prev, attachment_url: '' }));
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const dataToSave = {
                ...formData,
                due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null
            };

            if (task?.id) {
                // Update
                const { error } = await supabase
                    .from('project_tasks')
                    .update(dataToSave)
                    .eq('id', task.id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('project_tasks')
                    .insert([dataToSave]);
                if (error) throw error;
            }

            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving task:', error);
            alert('Erro ao salvar tarefa');
        } finally {
            setLoading(false);
        }
    };

    const [fetchedProjectName, setFetchedProjectName] = useState<string>('');

    useEffect(() => {
        if (!projectName && projectId) {
            supabase.from('acceptances').select('company_name').eq('id', projectId).single()
                .then(({ data }) => {
                    if (data) setFetchedProjectName(data.company_name);
                });
        }
    }, [projectName, projectId]);

    const displayProjectName = projectName || fetchedProjectName;

    // ... (existing code)

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">

                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                {task ? 'Editar Tarefa' : 'Nova Tarefa'}
                            </h2>
                            {displayProjectName && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-coral mt-1">
                                    <Briefcase size={12} />
                                    {displayProjectName}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 overflow-y-auto space-y-6 flex-1">

                        {/* Title */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Tarefa</label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none"
                                placeholder="Título da tarefa..."
                            />
                        </div>

                        {/* Meta Fields Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* Priority */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prioridade</label>
                                <div className="relative">
                                    <Flag className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <select
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none appearance-none"
                                    >
                                        <option value="low">Baixa</option>
                                        <option value="medium">Média</option>
                                        <option value="high">Alta</option>
                                    </select>
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                                >
                                    <option value="backlog">Backlog</option>
                                    <option value="in_progress">Em Execução</option>
                                    <option value="approval">Aprovação</option>
                                    <option value="done">Finalizado</option>
                                    <option value="paused">Pausado</option>
                                </select>
                            </div>

                            {/* Assignee - Modified to Select */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Responsável</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <select
                                        value={formData.assignee}
                                        onChange={e => setFormData({ ...formData, assignee: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none appearance-none"
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
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prazo</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                    <input
                                        type="date"
                                        value={formData.due_date}
                                        onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                        onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                <AlignLeft size={16} /> Descrição
                            </label>
                            <textarea
                                rows={6}
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-coral outline-none resize-none"
                                placeholder="Detalhes da tarefa..."
                            />
                        </div>

                        {/* File Upload */}
                        <div className="space-y-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                            />

                            {formData.attachment_url ? (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Paperclip size={18} className="text-brand-coral flex-shrink-0" />
                                        <a href={formData.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-700 dark:text-slate-200 truncate hover:underline">
                                            {formData.attachment_url.split('/').pop()}
                                        </a>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRemoveAttachment}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-red-500"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-center text-slate-400 gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            <span>Enviando arquivo... (Máx 1MB)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Paperclip size={20} />
                                            <span>Anexar arquivo (Máx 1MB)...</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || uploading}
                            className="px-8 py-2 bg-brand-coral text-white font-bold rounded-xl hover:bg-red-500 shadow-lg shadow-brand-coral/20 transition-all disabled:opacity-70"
                        >
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default TaskModal;
