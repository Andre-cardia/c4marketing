import React, { useState } from 'react';
import { useUserRole } from '../lib/UserRoleContext';
import { BrainChat } from './BrainChat';

export const BrainWidgetWrapper: React.FC = () => {
    const { userRole, loading } = useUserRole();
    const [isBrainOpen, setIsBrainOpen] = useState(false);
    const allowedRoles = ['admin', 'gestor', 'comercial', 'operacional', 'leitor'];

    // Hide for unauthenticated/loading users and for client-only access.
    if (loading || !userRole || !allowedRoles.includes(userRole)) {
        return null;
    }

    return (
        <div className="fixed bottom-6 left-6 z-[60]">
            {!isBrainOpen && (
                <button
                    onClick={() => setIsBrainOpen(true)}
                    className="p-4 bg-slate-900 border border-slate-700 text-indigo-400 rounded-full shadow-2xl hover:scale-105 transition-all group flex items-center gap-0 overflow-hidden hover:pr-4 hover:w-auto w-14 h-14"
                    title="Segundo Cérebro"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-6 h-6 shrink-0"
                    >
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                        <path d="M20.5 10c0-1.55-2.68-2.5-6-2.5-3.31 0-6 .95-6 2.5 0 1.07 1.32 1.84 3.73 2.15" />
                        <path d="M4 14c0 1.55 2.68 2.5 6 2.5 3.31 0 6-.95 6-2.5" />
                        <path d="M3.5 10C3.5 11.55 6.18 12.5 9.5 12.5c.34 0 .66-.01.99-.03" />
                        <path d="M10 22c-3.31 0-6-.95-6-2.5 0-1.55 2.68-2.5 6-2.5" />
                        <path d="M14 22c3.31 0 6-.95 6-2.5" />
                    </svg>
                    <span className="w-0 overflow-hidden group-hover:w-auto group-hover:ml-2 whitespace-nowrap text-sm font-bold opacity-0 group-hover:opacity-100 transition-all duration-300">
                        Cérebro
                    </span>
                </button>
            )}

            {isBrainOpen && (
                <div className="fixed bottom-6 left-6 w-[400px] h-[600px] shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[9999]">
                    <BrainChat onClose={() => setIsBrainOpen(false)} />
                </div>
            )}
        </div>
    );
};
