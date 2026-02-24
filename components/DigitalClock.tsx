import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const DigitalClock: React.FC = () => {
    const [time, setTime] = useState<string>('');
    const [date, setDate] = useState<string>('');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();

            // Format time for Brasilia (America/Sao_Paulo)
            const timeString = new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(now);

            // Format date for Brasilia
            const dateString = new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).format(now);

            setTime(timeString);
            setDate(dateString);
        };

        updateClock();
        const timer = setInterval(updateClock, 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 shadow-sm transition-all hover:shadow-md group">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-coral/10 text-brand-coral group-hover:scale-110 transition-transform">
                <Clock className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
                <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100 tracking-wider">
                    {time || '--:--:--'}
                </span>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                    {date || '---'}
                </span>
            </div>
        </div>
    );
};

export default DigitalClock;
