import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { Plus } from 'lucide-react';

const Projects: React.FC = () => {
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gestão de Projetos</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Visualize e gerencie os projetos de seus clientes.</p>
                    </div>
                    <button className="bg-brand-coral hover:bg-brand-coral/90 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-brand-coral/25 flex items-center gap-2">
                        <Plus size={20} />
                        Novo Projeto
                    </button>
                </div>

                <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
                    <p>Módulo de Projetos em construção...</p>
                </div>
            </main>
        </div>
    );
};

export default Projects;
