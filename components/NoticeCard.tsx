import React from 'react';
import { AlertCircle, AlertTriangle, Info, Trash2, User } from 'lucide-react';

interface NoticeCardProps {
    id: string;
    message: string;
    authorName: string;
    authorAvatar?: string | null;
    timestamp: string;
    priority: 'normal' | 'importante' | 'urgente';
    onDelete?: (id: string) => void;
    canDelete?: boolean;
}

const NoticeCard: React.FC<NoticeCardProps> = ({
    id,
    message,
    authorName,
    authorAvatar,
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
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const priorityConfig = {
        normal: {
            border: 'border-l-4 border-neutral-300 dark:border-neutral-600',
            bg: 'bg-white dark:bg-neutral-800/50',
            icon: Info,
            iconColor: 'text-neutral-400',
            label: 'Normal'
        },
        importante: {
            border: 'border-l-4 border-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-900/10',
            icon: AlertTriangle,
            iconColor: 'text-amber-500',
            label: 'Importante'
        },
        urgente: {
            border: 'border-l-4 border-red-500',
            bg: 'bg-red-50 dark:bg-red-900/20',
            icon: AlertCircle,
            iconColor: 'text-red-500',
            label: 'Urgente'
        }
    };

    const config = priorityConfig[priority];
    const Icon = config.icon;

    return (
        <div className={`${config.bg} ${config.border} rounded-c4 p-3 shadow-sm mb-2 transition-all hover:shadow-md border`}>
            <div className="flex items-start gap-4">
                {/* Author Avatar */}
                <div className="flex-shrink-0">
                    {authorAvatar ? (
                        <img
                            src={authorAvatar}
                            alt={authorName}
                            className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-neutral-700 shadow-sm"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center border-2 border-white dark:border-neutral-700 shadow-sm">
                            <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
                                {authorName.charAt(0).toUpperCase()}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                                {authorName}
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${config.iconColor} bg-white dark:bg-neutral-800 border border-current opacity-80`}>
                                    {config.label}
                                </span>
                            </h4>
                            <span className="text-xs text-neutral-400 block mt-0.5">
                                {formatTimestamp(timestamp)}
                            </span>
                        </div>
                        {canDelete && (
                            <button
                                onClick={() => onDelete && onDelete(id)}
                                className="text-neutral-400 hover:text-red-500 transition-colors p-1"
                                title="Excluir aviso"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>

                    <p className="mt-2 text-neutral-600 dark:text-neutral-300 text-xs leading-relaxed whitespace-pre-wrap">
                        {message}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default NoticeCard;
