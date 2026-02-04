import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { ArrowLeft, BarChart } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const TrafficManagement: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [companyName, setCompanyName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProjectDetails = async () => {
            if (!id) return;
            try {
                const { data, error } = await supabase
                    .from('acceptances')
                    .select('company_name')
                    .eq('id', id)
                    .single();

                if (data) {
                    setCompanyName(data.company_name);
                }
            } catch (error) {
                console.error('Error fetching project:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProjectDetails();
    }, [id]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <button
                    onClick={() => navigate('/projects')}
                    className="flex items-center gap-2 text-slate-500 hover:text-brand-coral mb-6 transition-colors"
                >
                    <ArrowLeft size={20} />
                    Voltar para Projetos
                </button>

                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <BarChart className="w-8 h-8 text-blue-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Gestão de Tráfego</h1>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        {loading ? 'Carregando...' : companyName}
                    </p>

                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl inline-block text-slate-400 text-sm">
                        🚧 Módulo em desenvolvimento...
                    </div>
                </div>
            </main>
        </div>
    );
};

export default TrafficManagement;
