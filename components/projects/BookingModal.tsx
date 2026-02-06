import React, { useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import Cal, { getCalApi } from "@calcom/embed-react";

interface BookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    calLink: string;
    companyName: string;
}

const BookingModal: React.FC<BookingModalProps> = ({ isOpen, onClose, calLink, companyName }) => {

    useEffect(() => {
        (async function () {
            const cal = await getCalApi();
            cal("ui", { "styles": { "branding": { "brandColor": "#E24A4A" } }, "hideEventTypeDetails": false, "layout": "month_view" });
        })();
    }, [isOpen]);

    if (!isOpen) return null;

    // Clean up calLink to handle full URLs or just usernames
    // If it starts with http, extract the path, otherwise treat as username/path
    const cleanCalLink = calLink.replace(/^https?:\/\/(www\.)?cal\.com\//, '').replace(/^\//, '');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full h-[90vh] max-w-5xl rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">

                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-coral/10 rounded-lg text-brand-coral">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                Agendar Reunião
                            </h2>
                            <p className="text-xs text-slate-500">{companyName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 w-full h-full overflow-hidden bg-white dark:bg-slate-900">
                    <Cal
                        calLink={cleanCalLink}
                        style={{ width: "100%", height: "100%", overflow: "scroll" }}
                        config={{ layout: 'month_view' }}
                    />
                </div>
            </div>
        </div>
    );
};

export default BookingModal;
