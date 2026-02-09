import { supabase } from './supabase';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

interface AIAnalysisResult {
    analysis: string;
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
 * Analyzes the system context using OpenAI GPT-4o-mini.
 */
export async function analyzeSystem(): Promise<AIAnalysisResult> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API Key is missing. Please check your .env file.');
    }

    const context = await fetchSystemContext();

    const systemPrompt = `
Você é o Gerente Geral de IA da C4 Marketing. 
Analise os dados do sistema e gere um relatório executivo BEM FORMATADO.

ESTRUTURA OBRIGATÓRIA (siga EXATAMENTE este formato):

# Relatório de Status do Sistema

## Resumo Executivo

[Parágrafo de 2-3 linhas descrevendo a situação geral]

## Tarefas

### Tarefas em Andamento

- **[Nome da Tarefa]** - Responsável: [Nome] | Status: [Status] | Prioridade: [Prioridade]
- **[Nome da Tarefa]** - Responsável: [Nome] | Status: [Status] | Prioridade: [Prioridade]

### Tarefas em Backlog

- **[Nome da Tarefa]** - Responsável: [Nome] | Prazo: [Data]
- **[Nome da Tarefa]** - Responsável: [Nome] | Prazo: [Data]

**Observação:** [Análise crítica sobre as tarefas]

## Propostas

### Propostas Aceitas

- **[Cliente]**: [Descrição do serviço] - Valor: R$ [valor]
- **[Cliente]**: [Descrição do serviço] - Valor: R$ [valor]

**Celebração:** [Comentário positivo sobre as vendas]

## Usuários

**Total de Usuários Ativos:** [número]

Novos usuários recentes:
- **[Nome]** - Perfil: [perfil]
- **[Nome]** - Perfil: [perfil]

**Observação:** [Análise sobre o crescimento da equipe]

## Recomendações

1. [Recomendação específica]
2. [Recomendação específica]

---

REGRAS CRÍTICAS:
- Use # apenas UMA VEZ para o título principal
- Use ## para TODAS as seções principais
- Use ### apenas para subsSeções
- Deixe SEMPRE uma linha em branco antes e depois de títulos
- Use **negrito** para nomes, valores e dados importantes
- Seja conciso mas informativo

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
                    { role: 'user', content: 'Gere o relatório de status atual do sistema seguindo EXATAMENTE a estrutura fornecida.' }
                ],
                temperature: 0.3,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to fetch analysis from OpenAI');
        }

        return {
            analysis: data.choices[0].message.content,
            timestamp: new Date().toISOString(),
        };
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        throw error;
    }
}
