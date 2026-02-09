import { supabase } from './supabase';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export interface AgentReport {
    executiveSummary: string;
    tasks: {
        inProgress: Array<{ name: string; assignee: string; priority: string; daysActive: number }>;
        backlog: Array<{ name: string; assignee: string; deadline: string; priority: string }>;
        analysis: string;
    };
    proposals: {
        recentWon: Array<{ client: string; service: string; value: string }>;
        totalValue: string;
        celebrationMessage: string;
    };
    users: {
        newUsers: Array<{ name: string; role: string }>;
        totalActive: number;
        analysis: string;
    };
    recommendations: string[];
    timestamp: string;
}

/**
 * Fetches relevant system context for the AI agent.
 */
async function fetchSystemContext() {
    const now = new Date();
    // Use start of the current month to align with "this month" user expectation
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch recent tasks (keep as is, but maybe filter by updated_at or created_at)
    // We'll keep the 7 days window for tasks as "recent activity", or align to month?
    // Let's keep tasks as "active context" (last 7 days is good for checking immediate backlog)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tasks, error: taskError } = await supabase
        .from('project_tasks')
        .select('*')
        .or(`created_at.gte.${sevenDaysAgo},status.eq.todo,status.eq.doing`)
        .limit(20);

    if (taskError) console.error('Error fetching tasks:', taskError);

    // Fetch WON proposals (Acceptances) from the start of the month
    // We need to join with proposals to get the financial value
    const { data: acceptances, error: acceptanceError } = await supabase
        .from('acceptances')
        .select(`
            *,
            contract_snapshot,
            proposal:proposals (
                monthly_fee,
                setup_fee,
                services
            )
        `)
        .gte('timestamp', startOfMonth)
        .order('timestamp', { ascending: false });

    if (acceptanceError) console.error('Error fetching acceptances:', acceptanceError);

    // Calculate Financials correctly in code
    const wonProposals = acceptances?.map((acc: any) => {
        let monthly = acc.proposal?.monthly_fee || 0;
        let setup = acc.proposal?.setup_fee || 0;
        let services = acc.proposal?.services;

        // Fallback to snapshot if proposal is missing (Legacy or Broken Link)
        if (!acc.proposal && acc.contract_snapshot && acc.contract_snapshot.proposal) {
            monthly = acc.contract_snapshot.proposal.monthly_fee || 0;
            setup = acc.contract_snapshot.proposal.setup_fee || 0;
            services = acc.contract_snapshot.proposal.services;
        }

        const totalValue = monthly + setup;

        return {
            client: acc.company_name,
            service: services ? 'Serviços de Marketing' : 'Contrato', // Simplify or parse services
            value: totalValue,
            formattedValue: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)
        };
    }) || [];

    const totalSalesValue = wonProposals.reduce((sum, item) => sum + item.value, 0);
    const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSalesValue);

    // Fetch recent user activity (users created recently)
    const { data: users, error: userError } = await supabase
        .from('app_users')
        .select('*')
        .gte('created_at', sevenDaysAgo)
        .limit(10);

    if (userError) console.error('Error fetching users:', userError);

    return {
        tasks: tasks || [],
        sales: {
            won: wonProposals,
            totalFormatted: formattedTotal,
            totalNumeric: totalSalesValue
        },
        users: users || [],
        timestamp: now.toISOString(),
    };
}

/**
 * Analyzes the system context using OpenAI GPT-4o and returns a structured JSON report.
 */
export async function analyzeSystem(): Promise<AgentReport> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API Key is missing. Please check your .env file.');
    }

    const context = await fetchSystemContext();

    const systemPrompt = `
    Você é o Gerente Geral de IA da C4 Marketing. 
    Analise os dados do sistema e gere um relatório executivo ESTRUTURADO em JSON.
    
    DADOS DE VENDAS (CRÍTICO):
    - O valor TOTAL de vendas deste mês é EXATAMENTE: ${context.sales.totalFormatted}.
    - NÃO altere e NÃO recalcule esse valor. Use exatemente string fornecida.
    - Liste exatamente as ${context.sales.won.length} vendas fornecidas no contexto.

    Retorne APENAS um objeto JSON com a seguinte estrutura (sem markdown, sem \`\`\`json):
    {
        "executiveSummary": "Texto corrido de 2-3 frases resumindo o estado geral da empresa.",
        "tasks": {
            "inProgress": [
                { "name": "Nome da tarefa", "assignee": "Responsável", "priority": "Alta/Média/Baixa", "daysActive": 3 }
            ],
            "backlog": [
                { "name": "Nome da tarefa", "assignee": "Responsável", "deadline": "DD/MM/AAAA", "priority": "Alta/Média/Baixa" }
            ],
            "analysis": "Uma frase analisando gargalos ou fluxo de trabalho."
        },
        "proposals": {
            "recentWon": [
                { "client": "Nome Cliente", "service": "Descrição curta", "value": "R$ 0.000,00" }
            ],
            "totalValue": "${context.sales.totalFormatted}",
            "celebrationMessage": "Uma frase curta celebrando as conquistas."
        },
        "users": {
            "newUsers": [
                { "name": "Nome", "role": "Cargo" }
            ],
            "totalActive": 5,
            "analysis": "Breve comentário sobre o time."
        },
        "recommendations": [
            "Ação prática 1",
            "Ação prática 2",
            "Ação prática 3"
        ]
    }

    Dados do sistema:
    ${JSON.stringify({
        tasks: context.tasks,
        sales: context.sales,
        users: context.users
    }, null, 2)}
  `;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Gere o JSON do relatório.' }
                ],
                temperature: 0.2,
                response_format: { type: "json_object" }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to fetch analysis from OpenAI');
        }

        const reportData = JSON.parse(data.choices[0].message.content);

        return {
            ...reportData,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        throw error;
    }
}

export interface AiFeedback {
    id: number;
    user_email: string;
    message: string;
    is_read: boolean;
    created_at: string;
    read_at: string | null;
}

/**
 * Fetches the latest unread feedback for a user.
 */
export async function getLatestFeedback(userEmail: string): Promise<AiFeedback | null> {
    const { data, error } = await supabase
        .from('ai_feedback')
        .select('*')
        .eq('user_email', userEmail)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching feedback:', error);
        return null;
    }

    return data && data.length > 0 ? data[0] : null;
}

/**
 * Marks a feedback message as read.
 */
export async function markFeedbackRead(id: number): Promise<void> {
    const { error } = await supabase
        .from('ai_feedback')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        console.error('Error marking feedback as read:', error);
        throw error;
    }
}

/**
 * Generates new feedback for a user based on their tasks and performance.
 */
export async function generateUserFeedback(userEmail: string, userName: string): Promise<AiFeedback> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API Key is missing.');
    }

    try {
        // 1. Fetch User Tasks (Replicating logic from Account.tsx)
        const normalizeString = (str: string | undefined | null) => {
            if (!str) return '';
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        };

        const { data: tasksData } = await supabase
            .from('project_tasks')
            .select('*')
            .neq('status', 'done')
            .order('due_date', { ascending: true });

        let userTasks: any[] = [];

        if (tasksData) {
            const targetName = normalizeString(userName);
            userTasks = tasksData.filter((t: any) => {
                const assigneeName = normalizeString(t.assignee);
                if (!assigneeName || !targetName) return false;
                return assigneeName === targetName ||
                    assigneeName.includes(targetName) ||
                    targetName.includes(assigneeName);
            });
        }

        // 2. Analyzes Context
        const activeTasks = userTasks.filter(t => ['backlog', 'in_progress'].includes(t.status));
        const approvalTasks = userTasks.filter(t => t.status === 'approval');

        const overdueTasks = activeTasks.filter(t => new Date(t.due_date) < new Date());
        const highPriority = activeTasks.filter(t => t.priority === 'high');

        const systemPrompt = `
        Você é um Gerente de Projetos de IA experiente e mentor.
        Seu objetivo é enviar uma mensagem CURTA e DIRETA (máximo 2 frases) para o usuário "${userName}" sobre o desempenho dele.
        
        Contexto do Usuário:
        - Tarefas em andamento/backlog: ${activeTasks.length}
        - Tarefas aguardando aprovação: ${approvalTasks.length}
        - ENTRE AS TAREFAS EM ANDAMENTO, atrasadas: ${overdueTasks.length}
        - Alta prioridade (Ativas): ${highPriority.length}
        
        Diretrizes:
        - Se houver tarefas atrasadas (active + overdue), cobre de forma firme mas profissional.
        - Se houver tarefas em aprovação, mencione que estão sendo revisadas (positivo).
        - Se não houver tarefas atrasadas e o backlog estiver limpo, parabenize e motive.
        - Use emojis profissionais.
        - Não use markdown, apenas texto puro.
        `;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Gere a mensagem para o usuário.' }
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to generate feedback');
        }

        const messageContent = data.choices[0].message.content.trim();

        // 3. Save to Database
        const { data: insertData, error: insertError } = await supabase
            .from('ai_feedback')
            .insert({
                user_email: userEmail,
                message: messageContent,
                is_read: false
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        return insertData;

    } catch (error) {
        console.error('Error generating user feedback:', error);
        throw error;
    }
}
