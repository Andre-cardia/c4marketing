import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, User, Video, ExternalLink, Loader2, RefreshCw, Plus } from 'lucide-react';
import { useUserRole } from '../lib/UserRoleContext';
import Cal, { getCalApi } from "@calcom/embed-react";

interface Booking {
    id: number;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees: {
        name: string;
        email: string;
        timeZone: string;
    }[];
    status: string;
    meetingUrl: string;
}

const Meetings: React.FC = () => {
    const { userRole, loading: roleLoading, calComLink } = useUserRole();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const API_KEY = 'cal_live_dce1007edad18303ba5dedbb992d83e6'; // Hardcoded for MVP as per request context

    // Derive clean link
    const cleanCalLink = calComLink
        ? calComLink.replace(/^(https?:\/\/)?(www\.)?cal\.com\//, '').replace(/^\//, '').trim()
        : "";

    useEffect(() => {
        (async function () {
            const cal = await getCalApi();
            cal("ui", {
                theme: "dark",
                styles: { branding: { brandColor: "#F06C6C" } },
                hideEventTypeDetails: false,
                layout: "month_view"
            });
        })();
    }, []);

    useEffect(() => {
        fetchBookings();
    }, []);
    // ... (keep fetchBookings same)

    // ... (keep helper functions same)

    const handleScheduleClick = async () => {
        if (!cleanCalLink) return;
        const cal = await getCalApi();
        cal("modal", {
            calLink: cleanCalLink,
            config: {
                layout: "month_view",
                theme: "dark"
            }
        });
    };

    const fetchBookings = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`https://api.cal.com/v2/bookings?status=upcoming&limit=100`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error('Falha ao carregar agendamentos do Cal.com');
            }

            const data = await response.json();
            console.log('Cal.com API Response:', data);

            let bookingsArray: any[] = [];
            if (data.data && Array.isArray(data.data)) {
                bookingsArray = data.data;
            } else if (data.data && data.data.bookings && Array.isArray(data.data.bookings)) {
                bookingsArray = data.data.bookings;
            }

            if (bookingsArray.length > 0) {
                const mappedBookings = bookingsArray.map((b: any) => ({
                    ...b,
                    meetingUrl: b.metadata?.videoCallUrl || b.references?.find((r: any) => r.meetingUrl)?.meetingUrl || b.location
                }));
                setBookings(mappedBookings);
            } else {
                bookingsArray = []; // fallback
                setBookings([]);
            }

        } catch (err: any) {
            console.error('Error fetching bookings:', err);
            setError('Erro ao carregar a agenda. Verifique sua conexão.');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date);
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Calendar className="text-brand-coral" /> Agenda da Equipe
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Próximas reuniões agendadas via Cal.com</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {!roleLoading && userRole === 'gestor' && (
                            <button
                                onClick={handleScheduleClick}
                                disabled={!cleanCalLink}
                                title={!cleanCalLink ? "Configure o link do Cal.com em Minha Conta" : `Agendar Reunião (${cleanCalLink})`}
                                className={`flex items-center gap-2 px-6 py-2.5 font-bold rounded-xl transition-all shadow-lg shadow-brand-dark/10 ${!cleanCalLink ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500' : 'bg-brand-dark hover:bg-slate-800 text-white'}`}
                            >
                                <Plus size={20} /> Agendar Reunião Interna
                            </button>
                        )}
                        <button
                            onClick={fetchBookings}

                            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-500 shadow-sm"
                            title="Atualizar"
                        >
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin w-8 h-8 text-brand-coral" />
                        <p>Sincronizando com Cal.com...</p>
                    </div>
                ) : error ? (
                    <div className="p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-center text-red-600 dark:text-red-400">
                        <p>{error}</p>
                        <button onClick={fetchBookings} className="mt-4 text-sm underline font-bold">Tentar Novamente</button>
                    </div>
                ) : bookings.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
                        <Calendar className="w-12 h-12 mb-4 mx-auto opacity-20" />
                        <p>Nenhuma reunião agendada para os próximos dias.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {bookings.map((booking) => (
                            <div key={booking.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">

                                {/* Date & Time */}
                                <div className="flex flex-col md:w-48 flex-shrink-0 border-l-4 border-brand-coral pl-4">
                                    <span className="text-xs font-bold text-slate-500 uppercase">{formatDate(booking.startTime)}</span>
                                    <div className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white mt-1">
                                        <Clock size={20} className="text-brand-coral" />
                                        {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                                    </div>
                                </div>

                                {/* Details */}
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{booking.title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{booking.description}</p>

                                    <div className="flex flex-wrap gap-4 mt-4">
                                        {booking.attendees && booking.attendees.map((attendee, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
                                                <User size={14} />
                                                <span className="font-medium">{attendee.name}</span>
                                                <span className="text-xs opacity-70">({attendee.email})</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-3">
                                    {booking.status === 'CANCELLED' ? (
                                        <span className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-bold text-sm">Cancelado</span>
                                    ) : (
                                        booking.meetingUrl && (
                                            <a
                                                href={booking.meetingUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-5 py-2.5 bg-brand-coral hover:bg-red-500 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-brand-coral/20"
                                            >
                                                <Video size={18} /> Entrar
                                            </a>
                                        )
                                    )}
                                </div>

                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Meetings;
