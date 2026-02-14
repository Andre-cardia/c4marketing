
// Configuration for Services sections

export interface ServiceConfig {
    id: string;
    title: string;
    description: string;
    icon: 'Layout' | 'Globe' | 'ShoppingCart' | 'Users' | 'LineChart';
    colorTheme: 'brand' | 'blue' | 'purple' | 'amber';
    priceLabel?: string; // Optional label e.g., "Item Adicional", "Status"
    priceType?: 'currency' | 'status'; // How to display the bottom value
    statusText?: string; // If status type, what text to show (e.g. "Selecionado")
    detailsLabel?: string; // Label for details box
    bgClass?: string; // Optional custom background class for special cards like LP
}

export const SERVICES_CONFIG: ServiceConfig[] = [
    {
        id: 'landing_page',
        title: 'Landing Page Premium',
        description: 'Desenvolvemos 1 página de alta conversão focada no produto ou serviço principal, otimizada para dispositivos móveis e com copy persuasivo.',
        icon: 'Layout',
        colorTheme: 'brand',
        priceLabel: 'Item Adicional',
        priceType: 'currency',
        detailsLabel: 'Detalhamento:',
        bgClass: 'bg-brand-dark text-white relative overflow-hidden',
    },
    {
        id: 'website',
        title: 'Web Site Institucional',
        description: 'Site completo com múltiplas páginas (Home, Sobre, Serviços, Contato), blog integrado e painel administrativo. Design exclusivo e otimizado para SEO.',
        icon: 'Globe',
        colorTheme: 'blue',
        priceLabel: 'Status',
        priceType: 'status',
        statusText: 'Selecionado',
        detailsLabel: 'Detalhamento:',
        bgClass: 'bg-white border border-slate-200 shadow-sm relative overflow-hidden',
    },
    {
        id: 'ecommerce',
        title: 'E-commerce Completo',
        description: 'Loja virtual integrada com meios de pagamento e logística. Cadastro de produtos ilimitado, gestão de estoque e área do cliente.',
        icon: 'ShoppingCart',
        colorTheme: 'purple',
        priceLabel: 'Status',
        priceType: 'status',
        statusText: 'Selecionado',
        detailsLabel: 'Detalhamento:',
        bgClass: 'bg-white border border-slate-200 shadow-sm relative overflow-hidden',
    },
    {
        id: 'consulting',
        title: 'Consultoria de Mkt & Vendas',
        description: 'Acompanhamento estratégico, definição de processos comerciais, treinamento de equipe e análise profunda de métricas de crescimento.',
        icon: 'Users',
        colorTheme: 'amber',
        priceLabel: 'Status',
        priceType: 'status',
        statusText: 'Selecionado',
        detailsLabel: 'Detalhamento:',
        bgClass: 'bg-white border border-slate-200 shadow-sm relative overflow-hidden',
    },
];

export const TRAFFIC_MANAGEMENT_CONFIG = {
    id: 'traffic_management',
    title: 'Gestão de Tráfego',
    platforms: [
        {
            name: "Google Ads",
            channels: ["Rede de Pesquisa (Search)", "Display", "Google Meu Negócio", "YouTube"],
            description: "Capturamos a demanda de quem já está procurando pelo seu serviço."
        },
        {
            name: "Meta Ads",
            channels: ["Facebook Ads", "Instagram Ads"],
            description: "Geramos desejo e autoridade interrompendo a navegação do seu público ideal."
        }
    ],
    coreWork: [
        "Criação de novas campanhas",
        "Otimização constante de lances e CTR",
        "Acompanhamento e monitoramento diário",
        "Suporte prioritário em horário comercial",
        "Relatórios mensais de performance (ROAS, CPC, CPA)",
        "Implementação em até 5 dias úteis pós-briefing"
    ]
};
