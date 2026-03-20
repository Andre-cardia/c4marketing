# Segundo Cérebro — Registro de Mudanças
**Data:** 19 de março de 2026
**Contexto:** Sessão de correções e melhorias estruturais

---

## Sumário Executivo

Esta sessão resolveu dois problemas críticos do Segundo Cérebro:

1. **Alucinação em contratos/propostas** — o agente inventava dados porque o banco vetorial não tinha documentos de proposals/acceptances e o router enviava essas perguntas para RAG puro.
2. **Responsável interno por projeto ausente** — nenhuma tabela registrava o membro da equipe C4 responsável por cada projeto; gestores não conseguiam atribuir ou alterar o responsável.

---

## 1. Correção de Alucinação em Contratos

### Causa Raiz

| Camada | Problema |
|--------|----------|
| ETL (brain-sync) | Sem triggers para `proposals` e `acceptances` → banco vetorial vazio |
| Router | Perguntas sobre contratos iam para `NORMATIVE_FIRST` (RAG puro), sem dados reais |
| RPC | `query_all_proposals(accepted)` retornava dados incompletos para o agente |

### Mudanças Aplicadas

#### Migration: `20260319200000_add_query_all_contracts_rpc.sql`
Nova RPC `public.query_all_contracts(p_status, p_company_name, p_limit)`:
- Une `acceptances` + `proposals` em uma única chamada
- Verifica existência de projetos gerados (traffic/website/landing_page)
- Retorna: `contract_id`, `company_name`, `client_name`, `email`, `status`, `signed_at`, `expiration_date`, `monthly_fee`, `setup_fee`, `services`, `has_traffic`, `has_website`, `has_lp`

#### Migration: `20260319201000_add_etl_triggers_proposals_acceptances.sql`
- Nova tabela `brain.proposals_sync_queue` (usa `TEXT` para `source_id`, suporta BIGINT e UUID)
- Trigger `T_brain_sync_proposals` em `public.proposals`
- Trigger `T_brain_sync_acceptances` em `public.acceptances`
- RPCs auxiliares: `get_pending_commercial_sync_items`, `update_commercial_sync_item_status`

#### Edge Function: `supabase/functions/brain-sync/index.ts`
- Processamento da `proposals_sync_queue` (proposals + acceptances)

#### Edge Function: `supabase/functions/_shared/agents/router.ts`
- `query_all_contracts` adicionado ao enum de ferramentas do ROUTER
- Parâmetros `p_status` e `p_company_name` no schema
- Nova regra de routing: perguntas sobre contratos → `db_query/query_all_contracts`
- Guardrail explícito: **"NUNCA invente dados sobre contratos"**

#### Edge Function: `supabase/functions/_shared/agents/controller.ts`
- Tool `query_all_contracts` adicionada ao ReAct loop (antes de `query_all_proposals`)

#### Edge Function: `supabase/functions/chat-brain/index.ts`
- `query_all_contracts` adicionado a `dbRpcNames`, `funcToAgent`, `inferSupplementalDbCalls`

---

## 2. Responsável Interno por Projeto

### Arquitetura da Solução

```
acceptances.responsible_user_id  ← âncora universal
    ↑ fallback se project table não tem responsável
traffic_projects.responsible_user_id
website_projects.responsible_user_id
landing_page_projects.responsible_user_id
```

**Por que `acceptances` é a âncora:** projetos de hospedagem, e-commerce, consultoria e agentes de IA não têm linhas em `traffic_projects`, `website_projects` ou `landing_page_projects`. A única tabela comum a todos é `acceptances`.

### Migrations Aplicadas

#### `20260320000000_add_responsible_user_id_to_projects.sql`
```sql
ALTER TABLE traffic_projects      ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE website_projects      ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE landing_page_projects ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
```
- Índices criados nas 3 tabelas
- Backfill: projetos ativos recebem `lucas@c4marketing.com.br` como responsável padrão

#### `20260320001000_update_rpcs_with_responsible_user.sql`
- `query_all_projects`: adiciona `responsible_user_id`, `responsible_user_name`, `responsible_user_email` via LEFT JOIN em `app_users`
- `query_all_tasks`: adiciona `project_responsible_name`, `project_responsible_email` via subqueries correlacionadas

#### `20260320002000_add_execute_update_project_responsible.sql`
RPC `public.execute_update_project_responsible(...)`:
- Recebe `p_project_id UUID` (ID da tabela específica, ex: `traffic_projects.id`)
- Protegida por `brain.assert_gestor()`
- Atualiza apenas a tabela correta baseada em `p_service_type`
- Retorna responsável anterior e novo para auditoria

#### `20260320003000_update_query_all_projects_add_acceptance_id.sql`
- Adiciona `a.id::text AS acceptance_id` ao SELECT de `query_all_projects`
- Necessário para o frontend correlacionar o responsável com a linha de acceptance

#### `20260320004000_add_responsible_to_acceptances.sql`
```sql
ALTER TABLE public.acceptances ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL;
```
- Backfill: puxa responsável das tabelas de projeto (COALESCE) ou Lucas como fallback
- Nova RPC `execute_update_responsible_by_acceptance(p_acceptance_id BIGINT, ...)`:
  - Atualiza `acceptances` + todas as project tables existentes de uma vez
  - Parâmetro `p_acceptance_id` é **BIGINT** (não UUID — correção de bug crítico)
- `query_all_projects` atualizado com `COALESCE(project.responsible_user_id, acceptance.responsible_user_id)`
- `query_all_tasks` atualizado com fallback em `acceptances.responsible_user_id`

### SQL Aplicado Diretamente (sem arquivo de migration)

Atualização de `brain.is_gestor()` e `brain.assert_gestor()` para aceitar role `'admin'`:

```sql
CREATE OR REPLACE FUNCTION brain.is_gestor()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.app_users
        WHERE email = auth.jwt() ->> 'email' AND role IN ('gestor', 'admin'));
END; $$;

CREATE OR REPLACE FUNCTION brain.assert_gestor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, brain AS $$
DECLARE v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.app_users WHERE email = auth.jwt() ->> 'email';
    IF v_role NOT IN ('gestor', 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas gestores podem usar o Agente Autônomo.';
    END IF;
END; $$;
```

### Agentes Atualizados

#### `supabase/functions/_shared/agents/specialists.ts`
- **Agent_Projects**: seção "RESPONSÁVEL INTERNO DO PROJETO"; análise de distribuição de carga (>8 projetos = alerta de sobrecarga); subtitle do GenUI atualizado
- **Agent_Client360**: campo responsável interno em alertas e análise de saúde do cliente
- **Agent_Executor**: `execute_update_project_responsible` listado em CAPACIDADES DISPONÍVEIS

#### `supabase/functions/brain-sync/index.ts`
- SELECT nos project queries inclui `app_users ( name, email )`
- `docContent` inclui linha "Responsável Interno: [nome]" para traffic, website e landing_page
- `responsible_user_email` nos metadados do documento vetorial

### Frontend Atualizado

#### `pages/Projects.tsx`
- Interface `Project` adiciona `responsible_user_name?` e `responsible_user_email?`
- `SortKey` inclui `'responsible_user_name'`
- `fetchProjects`: chama `query_all_projects` RPC; constrói `responsibleMap`; fallback para acceptances sem project table (busca `app_users` via `acceptance.responsible_user_id`)
- Nova coluna "Equipe C4" (`hidden lg:table-cell`) com ícone `UserCog`
- Busca e ordenação incluem `responsible_user_name`

#### `components/projects/CreateProjectModal.tsx`
- Props: adiciona `userRole?: string | null`
- `isGestor = userRole === 'gestor' || userRole === 'admin'`
- Campo "Responsável Interno (Equipe C4)" visível apenas para gestores no modo edição
- Carrega `app_users` (roles: gestor/operacional/comercial) com fallback para input de email
- `handleSubmit` modo edição: chama RPC `execute_update_responsible_by_acceptance` (uma chamada, substitui lógica anterior complexa)

---

## 3. Bugs Corrigidos

### Bug: `invalid input syntax for type uuid: "55"`
- **Causa:** `acceptances.id` é BIGINT, mas a RPC foi criada com `p_acceptance_id UUID`
- **Fix:** Parâmetro alterado para `BIGINT`; função anterior dropada antes de recriar
  ```sql
  DROP FUNCTION IF EXISTS public.execute_update_responsible_by_acceptance(uuid, text, uuid, text);
  ```

### Bug: Admin não conseguia alterar responsável
- **Causa 1 (UI):** `isGestor` verificava apenas `userRole === 'gestor'`
- **Fix UI:** `const isGestor = userRole === 'gestor' || userRole === 'admin'`
- **Causa 2 (backend):** `brain.assert_gestor()` bloqueava role `'admin'`
- **Fix SQL:** funções `is_gestor()` e `assert_gestor()` atualizadas para `IN ('gestor', 'admin')`

### Bug: Projetos sem responsável não salvavam
- **Causa:** Lógica anterior tentava encontrar IDs nas tabelas específicas (ex: `traffic_projects.id`) antes de chamar RPC. Para hospedagem não há entrada nessas tabelas → nada era atualizado
- **Fix:** Nova RPC `execute_update_responsible_by_acceptance` atualiza `acceptances` diretamente (âncora universal) + todas as project tables existentes de uma vez

---

## 4. Impacto e Cobertura

| Serviço | Tem tabela específica | Coberto pela âncora `acceptances` |
|---------|----------------------|----------------------------------|
| Gestão de Tráfego | ✅ `traffic_projects` | ✅ |
| Criação de Site | ✅ `website_projects` | ✅ |
| Landing Page | ✅ `landing_page_projects` | ✅ |
| Hospedagem | ❌ | ✅ |
| E-commerce | ❌ | ✅ |
| Consultoria | ❌ | ✅ |
| Agentes de IA | ❌ | ✅ |

---

## 5. Arquivos Modificados — Índice Completo

| Arquivo | Tipo | Ação |
|---------|------|------|
| `supabase/migrations/20260319200000_add_query_all_contracts_rpc.sql` | SQL Migration | Criado |
| `supabase/migrations/20260319201000_add_etl_triggers_proposals_acceptances.sql` | SQL Migration | Criado |
| `supabase/migrations/20260320000000_add_responsible_user_id_to_projects.sql` | SQL Migration | Criado |
| `supabase/migrations/20260320001000_update_rpcs_with_responsible_user.sql` | SQL Migration | Criado |
| `supabase/migrations/20260320002000_add_execute_update_project_responsible.sql` | SQL Migration | Criado |
| `supabase/migrations/20260320003000_update_query_all_projects_add_acceptance_id.sql` | SQL Migration | Criado |
| `supabase/migrations/20260320004000_add_responsible_to_acceptances.sql` | SQL Migration | Criado |
| `supabase/functions/brain-sync/index.ts` | Edge Function | Atualizado |
| `supabase/functions/_shared/agents/specialists.ts` | Edge Function | Atualizado |
| `supabase/functions/_shared/agents/router.ts` | Edge Function | Atualizado |
| `supabase/functions/_shared/agents/controller.ts` | Edge Function | Atualizado |
| `supabase/functions/chat-brain/index.ts` | Edge Function | Atualizado |
| `pages/Projects.tsx` | Frontend | Atualizado |
| `components/projects/CreateProjectModal.tsx` | Frontend | Atualizado |
| `brain.is_gestor()` (SQL direto) | Função DB | Atualizado |
| `brain.assert_gestor()` (SQL direto) | Função DB | Atualizado |
