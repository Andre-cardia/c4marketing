import React, { useEffect, useState } from 'react';
import { X, Plus, Calendar, User, AlertCircle, CheckCircle, PauseCircle, Clock, PlayCircle, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUserRole } from '../../lib/UserRoleContext';
import TaskModal from './TaskModal';
import BookingModal from './BookingModal';

interface Project {
    id: number;
    company_name: string;
}

interface Task {
    id: string;
    project_id: number;
    title: string;
    description: string;
    status: 'backlog' | 'in_progress' | 'approval' | 'done' | 'paused';
    priority: 'low' | 'medium' | 'high';
    assignee: string;
    due_date: string;
    created_at: string;
    created_by?: string;
}

interface KanbanBoardModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
}

const COLUMNS = [
    {
        id: 'backlog',
        title: 'Backlog',
        icon: AlertCircle,
        iconColor: 'text-neutral-400',
        borderColor: '#6b7280',
        badgeBg: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400',
    },
    {
        id: 'in_progress',
        title: 'Em Execução',
        icon: PlayCircle,
        iconColor: 'text-blue-500',
        borderColor: '#3b82f6',
        badgeBg: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    },
    {
        id: 'approval',
        title: 'Aprovação',
        icon: Clock,
        iconColor: 'text-violet-500',
        borderColor: '#8b5cf6',
        badgeBg: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
    },
    {
        id: 'done',
        title: 'Finalizado',
        icon: CheckCircle,
        iconColor: 'text-emerald-500',
        borderColor: '#10b981',
        badgeBg: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    },
    {
        id: 'paused',
        title: 'Pausado',
        icon: PauseCircle,
        iconColor: 'text-amber-500',
        borderColor: '#f59e0b',
        badgeBg: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    },
];

const PRIORITY_DOT: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-400',
    low: 'bg-emerald-400',
};

const KanbanBoardModal: React.FC<KanbanBoardModalProps> = ({ isOpen, onClose, project }) => {
    const { fullName } = useUserRole();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [showBookingModal, setShowBookingModal] = useState(false);

    const SHARED_CAL_LINK = 'grupo-c4/reuniao-grupo-c4';

    useEffect(() => {
        if (isOpen && project) {
            fetchTasks();
        }
    }, [isOpen, project]);

    const fetchTasks = async () => {
        if (!project) return;
        setLoading(true);
        const { data } = await supabase
            .from('project_tasks')
            .select('*')
            .eq('project_id', project.id)
            .order('created_at', { ascending: false });

        if (data) setTasks(data as Task[]);
        setLoading(false);
    };

    const handleCreateTask = () => {
        setEditingTask(undefined);
        setShowTaskModal(true);
    };

    const handleEditTask = (task: Task) => {
        setEditingTask(task);
        setShowTaskModal(true);
    };

    // Drag and Drop
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        setDraggedTaskId(taskId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverColumn(colId);
    };

    const handleDragLeave = () => {
        setDragOverColumn(null);
    };

    const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
        e.preventDefault();
        setDragOverColumn(null);

        if (!draggedTaskId) return;

        const taskToMove = tasks.find(t => t.id === draggedTaskId);
        if (!taskToMove || taskToMove.status === targetStatus) {
            setDraggedTaskId(null);
            return;
        }

        const updatedTasks = tasks.map(t =>
            t.id === draggedTaskId ? { ...t, status: targetStatus as any } : t
        );
        setTasks(updatedTasks);
        setDraggedTaskId(null);

        const { error } = await supabase
            .from('project_tasks')
            .update({ status: targetStatus })
            .eq('id', draggedTaskId);

        if (error) {
            console.error('Error moving task:', error);
            fetchTasks();
        } else {
            await supabase.from('task_history').insert({
                task_id: draggedTaskId,
                project_id: project!.id,
                action: 'status_change',
                old_status: taskToMove.status,
                new_status: targetStatus,
                changed_by: fullName || 'Sistema',
                details: { title: taskToMove.title },
            });
        }
    };

    if (!isOpen || !project) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-neutral-50 dark:bg-neutral-950 w-full h-full max-w-[96vw] max-h-[92vh] rounded-c4 overflow-hidden flex flex-col shadow-2xl border border-neutral-200 dark:border-neutral-800">

                {/* Header */}
                <div className="bg-white dark:bg-neutral-900 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full bg-brand-coral" />
                        <div>
                            <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white leading-tight">
                                {project.company_name}
                            </h2>
                            <p className="text-xs text-neutral-400 font-medium">Quadro de Tarefas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCreateTask}
                            className="flex items-center gap-1.5 text-xs font-bold text-brand-coral hover:text-white bg-brand-coral/10 hover:bg-brand-coral border border-brand-coral/20 hover:border-brand-coral px-3 py-1.5 rounded-c4 transition-all duration-150"
                        >
                            <Plus size={14} />
                            Nova Tarefa
                        </button>
                        <button
                            onClick={() => setShowBookingModal(true)}
                            className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:text-white bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-500 dark:hover:bg-neutral-600 border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 rounded-c4 transition-all duration-150"
                        >
                            <Calendar size={14} />
                            <span className="hidden sm:inline">Agendar</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-c4 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Board */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-5">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
                            Carregando tarefas...
                        </div>
                    ) : (
                        <div className="flex gap-4 h-full min-w-max">
                            {COLUMNS.map(col => {
                                const colTasks = tasks.filter(t => t.status === col.id);
                                const isOver = dragOverColumn === col.id;

                                return (
                                    <div
                                        key={col.id}
                                        onDragOver={(e) => handleDragOver(e, col.id)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, col.id)}
                                        className={`w-72 flex flex-col h-full rounded-c4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 transition-all duration-200 ${isOver ? 'ring-2 ring-brand-coral/50 scale-[1.01]' : ''}`}
                                        style={{ borderTop: `3px solid ${col.borderColor}` }}
                                    >
                                        {/* Column Header */}
                                        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <col.icon size={16} className={col.iconColor} />
                                                <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">
                                                    {col.title}
                                                </span>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                                                {colTasks.length}
                                            </span>
                                        </div>

                                        {/* Tasks List */}
                                        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                                            {colTasks.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-24 text-neutral-300 dark:text-neutral-700 text-xs text-center gap-1">
                                                    <col.icon size={20} className="opacity-30" />
                                                    <span>Nenhuma tarefa</span>
                                                </div>
                                            ) : (
                                                colTasks.map(task => (
                                                    <div
                                                        key={task.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, task.id)}
                                                        onClick={() => handleEditTask(task)}
                                                        className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-brand-coral dark:hover:border-brand-coral p-3.5 rounded-c4 cursor-grab active:cursor-grabbing hover:shadow-md hover:shadow-brand-coral/5 transition-all group relative"
                                                    >
                                                        {/* Priority dot */}
                                                        {task.priority && (
                                                            <span
                                                                className={`absolute top-3 right-3 w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority] || 'bg-neutral-300'}`}
                                                                title={`Prioridade: ${task.priority}`}
                                                            />
                                                        )}

                                                        <h4 className="text-sm font-bold text-neutral-800 dark:text-white mb-1 pr-4 leading-snug">
                                                            {task.title}
                                                        </h4>

                                                        {task.description && (
                                                            <p className="text-xs text-neutral-400 dark:text-neutral-500 line-clamp-2 mb-3 leading-relaxed">
                                                                {task.description}
                                                            </p>
                                                        )}

                                                        <div className="flex flex-col gap-1.5 mt-2 pt-2.5 border-t border-neutral-200 dark:border-neutral-700">
                                                            <div className="flex items-center gap-1.5 text-brand-coral text-xs font-semibold">
                                                                <Briefcase size={11} />
                                                                <span className="truncate">{project.company_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs text-neutral-400">
                                                                {task.assignee && (
                                                                    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded-full">
                                                                        <User size={9} />
                                                                        <span>{task.assignee}</span>
                                                                    </div>
                                                                )}
                                                                {task.due_date && (
                                                                    <div className="flex items-center gap-1">
                                                                        <Calendar size={10} />
                                                                        <span>{new Date(task.due_date).toLocaleDateString('pt-BR')}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Add task shortcut */}
                                        <div className="p-2 border-t border-neutral-100 dark:border-neutral-800 flex-shrink-0">
                                            <button
                                                onClick={handleCreateTask}
                                                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-neutral-400 hover:text-brand-coral hover:bg-brand-coral/5 rounded-lg transition-all"
                                            >
                                                <Plus size={13} />
                                                Adicionar tarefa
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Modals */}
                <TaskModal
                    isOpen={showTaskModal}
                    onClose={() => setShowTaskModal(false)}
                    projectId={project.id}
                    task={editingTask}
                    projectName={project.company_name}
                    onSave={fetchTasks}
                />

                <BookingModal
                    isOpen={showBookingModal}
                    onClose={() => setShowBookingModal(false)}
                    calLink={SHARED_CAL_LINK}
                    companyName={project.company_name}
                />
            </div>
        </div>
    );
};

export default KanbanBoardModal;
