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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent tasks
    const { data: tasks, error: taskError } = await supabase
        .from('project_tasks')
        .select('*')
        .or(`created_at.gte.${sevenDaysAgo},status.eq.todo,status.eq.doing`)
        .limit(20);

    if (taskError) console.error('Error fetching tasks:', taskError);

    // Fetch recent proposals
    const { data: proposals, error: proposalError } = await supabase
        .from('proposals')
        .select('*')
        .gte('created_at', sevenDaysAgo)
        .limit(10);

    if (proposalError) console.error('Error fetching proposals:', proposalError);

    // Fetch recent user activity (users created recently)
    const { data: users, error: userError } = await supabase
        .from('app_users')
        .select('*')
        .gte('created_at', sevenDaysAgo)
        .limit(10);

    if (userError) console.error('Error fetching users:', userError);

    return {
        tasks: tasks || [],
        proposals: proposals || [],
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
    
    Seu objetivo é alimentar um dashboard visual, então seja preciso nos dados.

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
            "totalValue": "Soma total estimada das recentes",
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
    ${JSON.stringify(context, null, 2)}
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
