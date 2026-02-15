import React from 'react';
import { AlertCircle, AlertTriangle, Info, Trash2 } from 'lucide-react';

interface NoticeCardProps {
    id: string;
    message: string;
    authorName: string;
    timestamp: string;
    priority: 'normal' | 'importante' | 'urgente';
    onDelete?: (id: string) => void;
    canDelete?: boolean;
}

const NoticeCard: React.FC<NoticeCardProps> = ({
    id,
    message,
    authorName,
    timestamp,
    priority,
    onDelete,
    canDelete = false
}) => {
    const formatTimestamp = (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const priorityConfig = {
        normal: {
            border: 'border-slate-200 dark:border-slate-700',
            bg: 'bg-white dark:bg-slate-900',
            icon: Info,
            iconColor: 'text-slate-400',
            label: 'Normal'
        },
        importante: {
            border: 'border-amber-300 dark:border-amber-600',
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            icon: AlertTriangle,
            iconColor: 'text-amber-500',
            label: 'Importante'
        },
        urgente: {
            border: 'border-red-300 dark:border-red-600',
            bg: 'bg-red-50 dark:bg-red-900/20',
            icon: AlertCircle,
            iconColor: 'text-red-500',
            label: 'Urgente'
        }
    };

    const config = priorityConfig[priority];
    const Icon = config.icon;

    return (
        <div className={`${config.bg} ${config.border} border-l-4 rounded-lg p-4 shadow-sm transition-all hover:shadow-md`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                    <Icon className={`${config.iconColor} w-5 h-5 mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`${config.iconColor} text-xs font-bold uppercase tracking-wider`}>
                                {config.label}
                            </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {message}
                        </p>
                        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium">Por: {authorName}</span>
                            <span>•</span>
                            <span>{formatTimestamp(timestamp)}</span>
                        </div>
                    </div>
                </div>
                {canDelete && onDelete && (
                    <button
                        onClick={() => onDelete(id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                        title="Excluir aviso"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
};

export default NoticeCard;
