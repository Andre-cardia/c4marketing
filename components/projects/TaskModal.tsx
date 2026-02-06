import React, { useState, useEffect } from 'react';
import { X, Calendar, User, AlignLeft, Flag, Paperclip } from 'lucide-react';
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
}

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task?: Task; // If provided, we are editing
    projectId: number;
    onSave: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, task, projectId, onSave }) => {
    const [formData, setFormData] = useState<Task>({
        project_id: projectId,
        title: '',
        description: '',
        status: 'backlog',
        priority: 'medium',
        assignee: '',
        due_date: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (task) {
            setFormData({
                ...task,
                due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : ''
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
                due_date: ''
            });
        }
    }, [task, projectId, isOpen]);

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

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">

                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                            {task ? 'Editar Tarefa' : 'Nova Tarefa'}
                        </h2>
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
                                className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-brand-coral outline-none"
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
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none appearance-none"
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
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none"
                                >
                                    <option value="backlog">Backlog</option>
                                    <option value="in_progress">Em Execução</option>
                                    <option value="approval">Aprovação</option>
                                    <option value="done">Finalizado</option>
                                    <option value="paused">Pausado</option>
                                </select>
                            </div>

                            {/* Assignee */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Responsável</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={formData.assignee}
                                        onChange={e => setFormData({ ...formData, assignee: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none"
                                        placeholder="Nome..."
                                    />
                                </div>
                            </div>

                            {/* Due Date */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prazo</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        value={formData.due_date}
                                        onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none"
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
                                className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-brand-coral outline-none resize-none"
                                placeholder="Detalhes da tarefa..."
                            />
                        </div>

                        {/* Attachment Placeholder */}
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-center text-slate-400 gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <Paperclip size={20} />
                            <span>Anexar arquivo...</span>
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
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
