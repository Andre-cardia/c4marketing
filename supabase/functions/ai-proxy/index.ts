import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, getErrorMessage } from '../_shared/evolution.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_BASE = 'https://api.openai.com';

async function chatCompletion(messages: object[], options: { model?: string; temperature?: number; response_format?: object } = {}) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada no servidor.');

  const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model ?? 'gpt-4o',
      messages,
      temperature: options.temperature ?? 0.3,
      ...(options.response_format ? { response_format: options.response_format } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`);
  return data.choices[0].message.content as string;
}

async function handleAnalyzeSystem(body: Record<string, any>) {
  const { tasks, sales, users } = body;

  const systemPrompt = `
Você é o Gerente Geral de IA da C4 Marketing.
Analise os dados do sistema e gere um relatório executivo ESTRUTURADO em JSON.

DADOS DE VENDAS (CRÍTICO):
- O valor TOTAL de vendas deste mês é EXATAMENTE: ${sales?.totalFormatted ?? 'R$ 0,00'}.
- NÃO altere e NÃO recalcule esse valor. Use exatamente a string fornecida.
- Liste exatamente as ${sales?.won?.length ?? 0} vendas fornecidas no contexto.

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
        "totalValue": "${sales?.totalFormatted ?? 'R$ 0,00'}",
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
${JSON.stringify({ tasks, sales, users }, null, 2)}
  `;

  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Gere o JSON do relatório.' },
    ],
    { temperature: 0.2, response_format: { type: 'json_object' } }
  );

  return JSON.parse(content);
}

async function handleGenerateUserFeedback(body: Record<string, any>) {
  const { userName, activeTasks, approvalTasks, overdueTasks, highPriority } = body;

  const systemPrompt = `
Você é um Gerente de Projetos de IA experiente e mentor.
Seu objetivo é enviar uma mensagem CURTA e DIRETA (máximo 2 frases) para o usuário "${userName}" sobre o desempenho dele.

Contexto do Usuário:
- Tarefas em andamento/backlog: ${activeTasks}
- Tarefas aguardando aprovação: ${approvalTasks}
- ENTRE AS TAREFAS EM ANDAMENTO, atrasadas: ${overdueTasks}
- Alta prioridade (Ativas): ${highPriority}

Diretrizes:
- Se houver tarefas atrasadas, cobre de forma firme mas profissional.
- Se houver tarefas em aprovação, mencione que estão sendo revisadas (positivo).
- Se não houver tarefas atrasadas e o backlog estiver limpo, parabenize e motive.
- Use emojis profissionais e encorajadores.
- Não use markdown, apenas texto puro.
  `;

  const message = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Gere a mensagem para o usuário.' },
    ],
    { temperature: 0.7 }
  );

  return { message: message.trim() };
}

async function handleChatDirector(body: Record<string, any>) {
  const { messages, contextSummary } = body;

  const systemPrompt = `Você é o Diretor Comercial de IA da C4 Marketing.
Seu papel é analisar métricas comerciais, identificar tendências, fazer análises preditivas e recomendar ações estratégicas.

Capacidades:
- Análise de MRR, ARR, churn e conversão
- Identificação de tendências de crescimento ou declínio
- Análise preditiva baseada em padrões históricos
- Recomendações de estratégia comercial
- Comparações entre períodos

Regras:
- Responda SEMPRE em português do Brasil
- Seja direto e objetivo, com insights acionáveis
- Use dados numéricos para embasar suas análises
- Quando fizer previsões, explique o raciocínio
- Use emojis profissionais de forma moderada
- Formate números monetários em BRL (R$)
- Não invente dados que não existam no contexto

${contextSummary}`;

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...(messages ?? []),
  ];

  const reply = await chatCompletion(fullMessages, { temperature: 0.4 });
  return { reply: reply.trim() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Não autorizado.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) return jsonResponse({ error: 'Configuração do servidor ausente.' }, 500);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Sessão inválida.' }, 401);

    const body: Record<string, any> = await req.json();
    const { action } = body;

    if (action === 'analyze_system') {
      const result = await handleAnalyzeSystem(body);
      return jsonResponse(result);
    }

    if (action === 'generate_user_feedback') {
      const result = await handleGenerateUserFeedback(body);
      return jsonResponse(result);
    }

    if (action === 'chat_director') {
      const result = await handleChatDirector(body);
      return jsonResponse(result);
    }

    return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error('[ai-proxy]', err);
    return jsonResponse({ error: getErrorMessage(err) }, 500);
  }
});
