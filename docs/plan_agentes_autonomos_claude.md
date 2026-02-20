# Plano: Agentes Autônomos com Skills no C4 Marketing

## Contexto

O sistema "Segundo Cérebro" da C4 Marketing possui 6 agentes **reativos** (só respondem a perguntas do usuário). O objetivo é adicionar **agentes autônomos** capazes de executar tarefas reais no sistema — criar tarefas, rascunhar propostas, analisar projetos e atualizar status — tanto por comando no chat quanto por triggers automáticos (cron/eventos).

---

## Arquitetura Proposta

```
CHAT (usuário)          CRON / EVENTOS
      │                       │
      ▼                       ▼
 chat-brain ──────────► agent-runner (novo Edge Function)
  (detecta intent               │
   autônomo)                    ▼
                         ReAct Loop
                    Think → Skill → Observe
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         Skills DB   Skills Write  Skills Read
         (Supabase)  (create_task) (query_all_*)
              │
              ▼
         agent_tasks (nova tabela) ← Realtime → Frontend
```

---

## Fase 1: Database — Tabela e RPCs

### 1.1 Nova tabela `agent_tasks`

**Arquivo**: `supabase/migrations/YYYYMMDDHHMMSS_agent_tasks.sql`

```sql
CREATE TABLE public.agent_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    goal text NOT NULL,
    status text DEFAULT 'pending',  -- pending | running | awaiting_confirmation | completed | failed
    agent_name text,
    skill_calls jsonb DEFAULT '[]',
    result jsonb,
    confirmation_payload jsonb,     -- dados do rascunho para o usuário aprovar
    user_id text NOT NULL,
    session_id text,
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
-- RLS: usuário vê apenas suas tasks
```

### 1.2 Novos RPCs de escrita

**Arquivo**: `supabase/migrations/YYYYMMDDHHMMSS_agent_write_rpcs.sql`

- `create_task(p_title, p_description, p_project_id, p_assigned_to, p_priority, p_status)`
- `update_task_status(p_task_id, p_new_status)`
- `update_client_status(p_client_id, p_new_status)`
- `insert_proposal_draft(p_client_id, p_title, p_content_json)` → grava como rascunho (status='draft')

### 1.3 pg_cron para triggers automáticos

```sql
-- Exemplo: análise diária de saúde de projetos às 8h
SELECT cron.schedule('daily-project-health', '0 8 * * *',
  $$INSERT INTO agent_tasks(goal, user_id) VALUES ('Analisar saúde de todos os projetos ativos e gerar relatório', 'system')$$
);
```

---

## Fase 2: Skills Registry

### 2.1 Interface base

**Arquivo**: `supabase/functions/_shared/skills/types.ts`

```typescript
interface Skill {
    name: string;
    description: string;
    parameters: object;           // JSON Schema para OpenAI function calling
    riskLevel: 'low' | 'medium' | 'high';
    requiresConfirmation: boolean;
    execute: (params: any, ctx: AgentContext) => Promise<SkillResult>;
}

interface SkillResult {
    success: boolean;
    data: any;
    summary: string;
    requiresConfirmation?: boolean;
    confirmationPayload?: any;    // rascunho para o usuário aprovar
}

interface AgentContext {
    userId: string;
    sessionId?: string;
    supabaseAdmin: SupabaseClient;
    openai: OpenAI;
}
```

### 2.2 Skills a implementar

| Skill | Risco | Confirmação | Arquivo |
|-------|-------|-------------|---------|
| `skill_query_proposals` | baixo | não | `skill_query_data.ts` |
| `skill_query_projects` | baixo | não | `skill_query_data.ts` |
| `skill_query_tasks` | baixo | não | `skill_query_data.ts` |
| `skill_query_clients` | baixo | não | `skill_query_data.ts` |
| `skill_create_task` | baixo | não | `skill_create_task.ts` |
| `skill_update_task_status` | baixo | não | `skill_update_task.ts` |
| `skill_analyze_project` | baixo | não | `skill_analyze_project.ts` |
| `skill_draft_proposal` | médio | **sim** | `skill_draft_proposal.ts` |
| `skill_update_client_status` | médio | **sim** | `skill_update_client.ts` |

**Arquivo índice**: `supabase/functions/_shared/skills/index.ts`

---

## Fase 3: Edge Function `agent-runner`

**Arquivo**: `supabase/functions/agent-runner/index.ts`

### 3.1 Input/Output

```typescript
// POST /functions/v1/agent-runner
// Input
type AgentRunnerInput = {
    goal: string;
    context?: { project_id?: string; client_id?: string };
    session_id?: string;
    task_id?: string;       // para retomar task existente
    confirm?: boolean;      // para confirmar ação pendente
}

// Output
type AgentRunnerOutput = {
    task_id: string;
    status: 'completed' | 'awaiting_confirmation' | 'failed';
    result?: string;        // resposta final
    confirmation?: {        // se status = awaiting_confirmation
        skill: string;
        preview: any;       // rascunho/dados para o usuário revisar
    };
}
```

### 3.2 ReAct Loop (máx. 7 iterações)

```
1. Carregar contexto (user_id, dados do task se task_id fornecido)
2. Montar system prompt do orquestrador
3. Loop (max 7x):
   a. Chamar GPT-4o com skills como tools (function calling)
   b. Se sem tool_calls → resposta final → encerrar
   c. Para cada tool_call:
      - Se skill.requiresConfirmation → pausar, salvar estado, retornar awaiting_confirmation
      - Senão → executar skill → adicionar resultado ao contexto
4. Salvar resultado em agent_tasks
5. Retornar output
```

### 3.3 Fluxo de confirmação

```
Usuário: "rascunhe proposta para cliente X"
    → agent-runner executa skill_draft_proposal
    → retorna status: 'awaiting_confirmation' + preview do rascunho
    → Frontend mostra modal com rascunho
Usuário: aprova
    → Frontend chama agent-runner com { confirm: true, task_id: "..." }
    → Agent executa insert_proposal_draft RPC
    → Retorna status: 'completed'
```

---

## Fase 4: Integração com `chat-brain`

**Arquivo**: `supabase/functions/chat-brain/index.ts` (modificação)

### 4.1 Detecção de intent autônomo

Adicionar função `isAutonomousTaskIntent(text: string)` que detecta verbos de ação:
- "crie", "cria", "execute", "faça", "faz", "atualize", "atualiza", "gere", "gera", "analise", "analisa", "rascunhe"

### 4.2 Dispatch para agent-runner

Quando detectado:
1. Chamar `agent-runner` internamente (fetch para a função)
2. Retornar resposta especial no chat com `task_id` e status
3. Chat responde: "Tarefa iniciada! Acompanhe em tempo real no painel de agentes."

---

## Fase 5: Frontend

### 5.1 Novos componentes

- **`AgentTaskPanel.tsx`**: painel lateral ou aba mostrando tasks em tempo real
  - Usa Supabase Realtime: `supabase.channel('agent_tasks').on('postgres_changes', ...)`
  - Lista tasks com status, ícone animado para 'running'
  - Botão "Ver resultado" para tasks completas

- **`AgentConfirmModal.tsx`**: modal de confirmação
  - Mostra preview do rascunho/ação
  - Botões: "Confirmar" e "Cancelar"
  - Ao confirmar: chama `agent-runner` com `{ confirm: true, task_id }`

### 5.2 Novo arquivo de cliente

**Arquivo**: `lib/agent-runner.ts`

```typescript
async function dispatchAgentTask(goal: string, context?: any): Promise<AgentRunnerOutput>
async function confirmAgentTask(taskId: string): Promise<AgentRunnerOutput>
async function cancelAgentTask(taskId: string): Promise<void>
```

---

## Arquivos a Criar/Modificar

### Criar (novos)
1. `supabase/migrations/YYYYMMDD_agent_tasks.sql`
2. `supabase/migrations/YYYYMMDD_agent_write_rpcs.sql`
3. `supabase/functions/agent-runner/index.ts`
4. `supabase/functions/_shared/skills/types.ts`
5. `supabase/functions/_shared/skills/index.ts`
6. `supabase/functions/_shared/skills/skill_query_data.ts`
7. `supabase/functions/_shared/skills/skill_create_task.ts`
8. `supabase/functions/_shared/skills/skill_update_task.ts`
9. `supabase/functions/_shared/skills/skill_analyze_project.ts`
10. `supabase/functions/_shared/skills/skill_draft_proposal.ts`
11. `supabase/functions/_shared/skills/skill_update_client.ts`
12. `lib/agent-runner.ts`
13. `components/AgentTaskPanel.tsx`
14. `components/AgentConfirmModal.tsx`

### Modificar (existentes)
15. `supabase/functions/chat-brain/index.ts` — adicionar detecção de intent autônomo + dispatch
16. `supabase/functions/_shared/brain-types.ts` — adicionar tipos AgentContext, SkillResult
17. Uma página existente (ex: `pages/Dashboard.tsx` ou `Brain.tsx`) — incluir `AgentTaskPanel`

---

## Ordem de Implementação

1. **Migration**: tabela `agent_tasks` + RPCs de escrita
2. **Skills**: types.ts → skill_query_data.ts → skill_create_task.ts → skill_update_task.ts → skill_analyze_project.ts → skill_draft_proposal.ts → skill_update_client.ts → index.ts
3. **agent-runner**: Edge Function completa com ReAct loop
4. **chat-brain**: adicionar detecção + dispatch
5. **Frontend**: lib/agent-runner.ts → AgentConfirmModal → AgentTaskPanel → integrar na página
6. **Deploy**: agent-runner + chat-brain + testar canário
7. **cron**: configurar pg_cron para triggers automáticos

---

## Verificação / Teste

1. **Teste manual via chat**: "crie uma tarefa: revisar proposta do cliente X"
   - Esperado: task criada no banco, resposta no chat com confirmação

2. **Teste de confirmação**: "rascunhe uma proposta para o cliente Y"
   - Esperado: modal com preview, usuário confirma, proposta inserida como draft

3. **Teste de análise**: "analise a saúde do projeto Z"
   - Esperado: relatório retornado no chat, task salva com resultado

4. **Teste de cron**: trigger manual de pg_cron → task inserida → agent-runner processa

5. **Teste de Realtime**: AgentTaskPanel atualiza automaticamente ao concluir task
