
import React from 'react';
import { Layout, Globe, ShoppingCart, Users, Bot } from 'lucide-react';
import { ServiceConfig } from '../lib/constants';

interface ServiceCardProps {
    config: ServiceConfig;
    selectedService: any; // Can be string or object with details
}

const IconMap = {
    Layout: Layout,
    Globe: Globe,
    ShoppingCart: ShoppingCart,
    Users: Users,
    Bot: Bot,
    LineChart: Layout, // Fallback, though line chart is usually separate
};

export const ServiceCard: React.FC<ServiceCardProps> = ({ config, selectedService }) => {
    const Icon = IconMap[config.icon as keyof typeof IconMap] || Layout;

    // Helper to extract details from potentially complex service object
    const getDetails = () => {
        if (!selectedService) return null;
        if (typeof selectedService === 'string') return null; // No details if just ID string
        return selectedService.details;
    };

    const getPrice = () => {
        if (!selectedService) return 0;
        if (typeof selectedService === 'string') return 0;
        return selectedService.price || 0;
    };

    const getRecurringPrice = () => {
        if (!selectedService || typeof selectedService === 'string') return 0;
        return selectedService.recurringPrice || 0;
    };

    const getSetupPrice = () => {
        if (!selectedService || typeof selectedService === 'string') return 0;
        return selectedService.setupPrice || 0;
    };

    const details = getDetails();
    const price = getPrice();
    const recurringPrice = getRecurringPrice();
    const setupPrice = getSetupPrice();
    const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Theme colors mapping
    const themeClasses = {
        brand: {
            bgIcon: 'bg-brand-coral/20 text-brand-coral',
            textTitle: 'text-white',
            textDesc: 'text-slate-300',
            detailsBg: 'bg-white/10 border-white/10 text-slate-200',
            pricePrimary: 'text-brand-coral'
        },
        blue: {
            bgIcon: 'bg-blue-50 text-blue-600',
            textTitle: 'text-slate-900',
            textDesc: 'text-slate-600',
            detailsBg: 'bg-blue-50/50 border-blue-100/50 text-blue-800',
            pricePrimary: 'text-blue-600'
        },
        purple: {
            bgIcon: 'bg-purple-50 text-purple-600',
            textTitle: 'text-slate-900',
            textDesc: 'text-slate-600',
            detailsBg: 'bg-purple-50/50 border-purple-100/50 text-purple-800',
            pricePrimary: 'text-purple-600'
        },
        amber: {
            bgIcon: 'bg-amber-50 text-amber-600',
            textTitle: 'text-slate-900',
            textDesc: 'text-slate-600',
            detailsBg: 'bg-amber-50/50 border-amber-100/50 text-amber-800',
            pricePrimary: 'text-amber-600'
        }
    };

    const theme = themeClasses[config.colorTheme] || themeClasses.blue;

    return (
        <div className={`rounded-3xl p-8 flex flex-col ${config.bgClass || 'bg-white border border-slate-200 shadow-sm'}`}>
            {/* Decorator for LP */}
            {config.id === 'landing_page' && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-coral opacity-20 -mr-16 -mt-16 rounded-full"></div>
            )}

            <div className={`${theme.bgIcon} w-12 h-12 flex items-center justify-center rounded-xl mb-6`}>
                <Icon className="w-6 h-6" />
            </div>

            <h3 className={`text-2xl font-bold mb-4 ${theme.textTitle}`}>
                {config.title}
            </h3>

            <p className={`${theme.textDesc} mb-6 leading-relaxed`}>
                {config.description}
            </p>

            {details ? (
                <div className={`mb-6 p-4 rounded-2xl border text-sm italic ${theme.detailsBg}`}>
                    <strong>{config.detailsLabel}</strong> {details}
                </div>
            ) : null}

            <div className={`mt-auto pt-4 border-t ${config.id === 'landing_page' ? 'border-white/10' : 'border-slate-100'}`}>
                <span className="text-xs text-slate-400 block mb-1">{config.priceLabel}</span>

                {config.priceType === 'hybrid' ? (
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500">Mensalidade</span>
                            <span className={`font-bold ${theme.pricePrimary}`}>
                                {recurringPrice > 0 ? formatCurrency(recurringPrice) : 'A definir'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500">Setup Inicial</span>
                            <span className="font-semibold text-slate-700">
                                {setupPrice > 0 ? formatCurrency(setupPrice) : 'A definir'}
                            </span>
                        </div>
                    </div>
                ) : config.priceType === 'currency' ? (
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold font-montserrat ${theme.pricePrimary}`}>
                            {price > 0 ? formatCurrency(price) : 'Incluso'}
                        </span>
                    </div>
                ) : (
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${theme.bgIcon}`}>
                        {config.statusText}
                    </span>
                )}
            </div>
        </div>
    );
};
