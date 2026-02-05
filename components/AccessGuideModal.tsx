import React, { useState } from 'react';
import { X, Copy, Check, Eye, EyeOff, Shield, Server, Globe, Key, User } from 'lucide-react';

interface AccessGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any;
}

const AccessGuideModal: React.FC<AccessGuideModalProps> = ({ isOpen, onClose, data }) => {
    const [showPasswords, setShowPasswords] = useState(false);

    if (!isOpen) return null;

    const sections = [
        { title: 'Cliente', icon: User, keys: ['company_name', 'contact_person', 'contact_email'] },
        { title: 'Site Atual', icon: Globe, keys: ['site_url', 'creation_date', 'platform', 'platform_other'] },
        { title: 'Admin Site', icon: Key, keys: ['cms_system', 'admin_url', 'admin_user', 'admin_email', 'admin_password', '2fa_enabled', '2fa_instructions'] },
        { title: 'Hospedagem', icon: Server, keys: ['hosting_provider', 'hosting_other', 'hosting_url', 'hosting_user', 'hosting_email', 'hosting_password', 'ftp_available', 'ftp_host', 'ftp_port', 'ftp_user', 'ftp_pass', 'email_panel', 'email_link', 'email_user', 'email_pass'] },
        { title: 'Domínio', icon: Globe, keys: ['registrar', 'registrar_other', 'registrar_user', 'registrar_pass', 'dns_config'] },
        { title: 'Observações', icon: Shield, keys: ['integrations', 'security_rules', 'change_password', 'password_delivery'] },
    ];

    const formatLabel = (key: string) => {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const isPassword = (key: string) => key.toLowerCase().includes('password') || key.toLowerCase().includes('pass');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Key size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Respostas do Guia de Acesso</h2>
                            <p className="text-sm text-slate-500">Credenciais e informações técnicas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowPasswords(!showPasswords)}
                            className="text-sm font-medium text-slate-500 hover:text-brand-coral flex items-center gap-2"
                        >
                            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                            {showPasswords ? 'Ocultar Senhas' : 'Mostrar Senhas'}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-red-500">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                    {!data || Object.keys(data).length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Shield size={48} className="mx-auto mb-4 opacity-50" />
                            <p>Nenhuma informação preenchida ainda.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {sections.map(section => (
                                <div key={section.title} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center gap-2 mb-4 text-purple-600 dark:text-purple-400">
                                        <section.icon size={18} />
                                        <h3 className="font-bold">{section.title}</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {section.keys.map(key => {
                                            if (!data[key]) return null;
                                            return (
                                                <div key={key} className="text-sm">
                                                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                                        {formatLabel(key)}
                                                    </span>
                                                    <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                                                        <span className={`font-mono ${isPassword(key) && !showPasswords ? 'blur-sm' : ''} text-slate-700 dark:text-slate-300`}>
                                                            {isPassword(key) && !showPasswords ? '••••••••' : data[key]}
                                                        </span>
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(data[key])}
                                                            className="text-slate-300 hover:text-brand-coral transition-colors"
                                                            title="Copiar"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AccessGuideModal;
