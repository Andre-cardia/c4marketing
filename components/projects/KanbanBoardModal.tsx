import React, { useEffect, useState } from 'react';
import { X, Plus, Calendar, MoreHorizontal, User, AlertCircle, CheckCircle, PauseCircle, Clock, PlayCircle, Briefcase } from 'lucide-react';
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
}

interface KanbanBoardModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
}

const COLUMNS = [
    { id: 'backlog', title: 'Backlog', icon: AlertCircle, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300' },
    { id: 'in_progress', title: 'Em Execução', icon: PlayCircle, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-300' },
    { id: 'approval', title: 'Aprovação', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-300' },
    { id: 'done', title: 'Finalizado', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-300' },
    { id: 'paused', title: 'Pausado', icon: PauseCircle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300' },
];

const KanbanBoardModal: React.FC<KanbanBoardModalProps> = ({ isOpen, onClose, project }) => {
    const { fullName } = useUserRole();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [showBookingModal, setShowBookingModal] = useState(false);

    // Placeholder for the shared team calendar link.
    // Replace 'c4-marketing' with your actual organization/username to enable bookings.
    const SHARED_CAL_LINK = 'grupo-c4/reuniao-grupo-c4';

    useEffect(() => {
        if (isOpen && project) {
            fetchTasks();
        }
    }, [isOpen, project]);

    const fetchTasks = async () => {
        if (!project) return;
        setLoading(true);
        const { data, error } = await supabase
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

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        setDraggedTaskId(taskId);
        e.dataTransfer.effectAllowed = 'move';
        // Transparent ghost image if needed, or default browser behavior
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
        e.preventDefault();

        if (!draggedTaskId) return;

        const taskToMove = tasks.find(t => t.id === draggedTaskId);
        if (!taskToMove || taskToMove.status === targetStatus) {
            setDraggedTaskId(null);
            return;
        }

        // Optimistic UI Update
        const updatedTasks = tasks.map(t =>
            t.id === draggedTaskId ? { ...t, status: targetStatus as any } : t
        );
        setTasks(updatedTasks);
        setDraggedTaskId(null);

        // Update in Supabase
        const { error } = await supabase
            .from('project_tasks')
            .update({ status: targetStatus })
            .eq('id', draggedTaskId);

        if (error) {
            console.error('Error moving task:', error);
            alert('Erro ao mover tarefa.');
            fetchTasks(); // Revert on error
        } else {
            // Log History
            await supabase.from('task_history').insert({
                task_id: draggedTaskId,
                project_id: project.id,
                action: 'status_change',
                old_status: taskToMove.status,
                new_status: targetStatus,
                changed_by: fullName || 'Sistema',
                details: { title: taskToMove.title }
            });
        }
    };

    if (!isOpen || !project) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-50 dark:bg-slate-950 w-full h-full max-w-[95vw] max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl">

                {/* Header */}
                <div className="bg-white dark:bg-slate-900 px-8 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            {project.company_name}
                        </h2>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleCreateTask}
                            className="bg-brand-coral hover:bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-brand-coral/20"
                        >
                            <Plus size={20} /> Nova Tarefa
                        </button>
                        <button
                            onClick={() => setShowBookingModal(true)}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all border border-slate-200 dark:border-slate-600"
                        >
                            <Calendar size={20} /> <span className="hidden sm:inline">Agendar</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors"
                        >
                            <X size={28} />
                        </button>
                    </div>
                </div>

                {/* Board */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                    <div className="flex gap-6 h-full min-w-max">
                        {COLUMNS.map(col => {
                            const colTasks = tasks.filter(t => t.status === col.id);
                            return (
                                <div
                                    key={col.id}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, col.id)}
                                    className={`w-80 flex flex-col h-full rounded-2xl bg-white dark:bg-slate-900 border-t-4 transition-colors ${colTasks.length === 0 && 'opacity-80'}`}
                                    style={{ borderColor: col.id === 'done' ? '#10b981' : col.id === 'backlog' ? '#cbd5e1' : col.id === 'in_progress' ? '#3b82f6' : col.id === 'approval' ? '#a855f7' : '#f59e0b' }}
                                >

                                    {/* Column Header */}
                                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                        <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                                            <col.icon size={18} className={col.color} />
                                            {col.title}
                                            <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full text-xs">
                                                {colTasks.length}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tasks List */}
                                    <div className={`p-4 flex-1 overflow-y-auto space-y-3 ${col.bg}`}>
                                        {colTasks.map(task => (
                                            <div
                                                key={task.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, task.id)}
                                                onClick={() => handleEditTask(task)}
                                                className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-brand-coral transition-all group relative animate-in fade-in zoom-in duration-200"
                                            >
                                                {task.priority === 'high' && (
                                                    <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" title="Prioridade Alta"></div>
                                                )}

                                                <h4 className="font-bold text-slate-800 dark:text-white mb-2 pr-4">{task.title}</h4>

                                                {task.description && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                                                        {task.description}
                                                    </p>
                                                )}

                                                <div className="flex flex-col gap-2 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-600">
                                                    <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400 text-xs text-brand-coral">
                                                        <Briefcase size={12} />
                                                        {project.company_name}
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs text-slate-400 w-full">
                                                        <div className="flex items-center gap-3">
                                                            {task.assignee && (
                                                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-600 px-1.5 py-0.5 rounded">
                                                                    <User size={10} /> {task.assignee}
                                                                </div>
                                                            )}
                                                            {task.due_date && (
                                                                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-300">
                                                                    <Calendar size={10} />
                                                                    {new Date(task.due_date).toLocaleDateString()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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
