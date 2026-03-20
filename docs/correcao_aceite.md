# Correção: Erro ao Aceitar Proposta

**Data:** 19/03/2026
**Severidade:** Crítica — bloqueava 100% dos novos aceites de proposta
**Status:** Resolvido ✅

---

## Descrição do Problema

Ao tentar aceitar uma proposta comercial, o cliente via o modal "Conferência de Dados", clicava em **"Confirmar e Aceitar"** e recebia a mensagem:

> **"Ocorreu um erro ao salvar. Tente novamente."**

O botão ficava travado em **"Finalizando..."** e o aceite não era registrado.

### Contexto observado

O caso que identificou o bug foi o aceite da proposta da **Baggio Industria Ltda** (Fabio Eduardo Baggio) em 19/03/2026.

---

## Causa Raiz

### Bug 1 — Coluna `status` inexistente na tabela `proposals`

A migração `20260313203000_fix_submit_acceptance_duplicate.sql` atualizou a RPC `submit_proposal_acceptance` para verificar o status da proposta antes de registrar o aceite:

```sql
SELECT status INTO v_proposal_status
FROM public.proposals
WHERE id = p_proposal_id;
```

Porém, **nenhuma migração havia criado a coluna `status` na tabela `proposals`**. O backup do banco de 01/03/2026 confirmou a ausência da coluna. Resultado em tempo de execução:

```
ERROR: column "status" does not exist
```

Este erro era capturado pelo `catch` em `ProposalView.tsx` e exibido como mensagem genérica ao usuário.

### Bug 2 — Política RLS removida sem substituto funcional

A migração `20260313202000_fix_proposals_public_access.sql` removeu a política pública de leitura de propostas (`Public proposals access`) e a substituiu por uma policy exclusiva para usuários autenticados, além de uma RPC `get_proposal_by_slug` para acesso anônimo.

Porém, `get_proposal_by_slug` também usava `AND status = 'active'`, portanto falharia pelo mesmo motivo (coluna inexistente). Clientes anônimos ficaram sem caminho funcional para carregar propostas.

### Bug 3 — Sem proteção contra aceite duplo

Mesmo após o aceite ser registrado, o link da proposta continuava acessível e permitia preencher e submeter um novo formulário. Não havia nenhum mecanismo na interface ou no banco para bloquear um segundo aceite da mesma proposta por outro usuário.

### Bug 4 — Segundo Cérebro retornando informação incorreta

Ao perguntar "qual contrato recebeu aceite hoje?", o cérebro chamava `query_all_proposals(p_status_filter='accepted')`, que retornava **todas** as propostas aceitas sem timestamp de aceite e sem ordenação por data. O LLM identificava a primeira da lista — **Amplexo Diesel** (aceite em fev/2026) — como o aceite do dia, em vez de **Baggio Industria Ltda**.

---

## Solução Aplicada

### Migração 1 — `20260319001000_add_status_to_proposals.sql`

Adicionou a coluna `status` à tabela `proposals` com valor padrão `'active'`:

```sql
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
```

Todos os registros existentes receberam `status = 'active'` automaticamente.

Também restaurou a política de leitura anônima, agora filtrada pelo status:

```sql
CREATE POLICY "anon_can_read_active_proposals"
ON public.proposals FOR SELECT TO anon
USING (status = 'active');
```

### Migração 2 — `20260319002000_lock_proposal_after_acceptance.sql`

Atualizou a RPC `submit_proposal_acceptance` para, após registrar o aceite com sucesso, marcar a proposta como aceita:

```sql
UPDATE public.proposals
SET status = 'accepted'
WHERE id = p_proposal_id;
```

A partir deste momento, qualquer nova tentativa de aceite na mesma proposta falha na verificação de status:

```sql
IF lower(coalesce(v_proposal_status, 'active')) NOT IN ('active', 'ativo') THEN
    RAISE EXCEPTION 'Esta proposta nao esta disponivel para aceite (status: %)', v_proposal_status;
END IF;
```

A política anônima foi ampliada para expor propostas com status `'active'` e `'accepted'` (mas não `'inactive'`), permitindo que a interface exiba a tela de "Proposta já aceita":

```sql
CREATE POLICY "anon_can_read_active_proposals"
ON public.proposals FOR SELECT TO anon
USING (status IN ('active', 'accepted'));
```

### Migração 3 — `20260319003000_add_query_recent_acceptances_rpc.sql`

Criou a RPC `query_recent_acceptances` com filtro por data e ordenação decrescente:

```sql
CREATE FUNCTION public.query_recent_acceptances(
    p_date  date DEFAULT NULL,
    p_limit int  DEFAULT 10
) RETURNS json ...
```

Retorna: `acceptance_id`, `client_name`, `company_name`, `acceptance_timestamp`, `acceptance_date_brasilia`, `monthly_fee`, `services`, entre outros.

### Alteração em `ProposalView.tsx`

- Interface `Proposal` passou a incluir `status?: string`
- Adicionada tela "Proposta já aceita" renderizada quando `proposal.status === 'accepted'` — o formulário nunca é exibido
- Tratamento de erro aprimorado no `catch` de `handleFinalConfirm`:
  - Erro de status bloqueado → recarrega proposta e esconde formulário
  - Erro de e-mail duplicado → mensagem clara ao usuário
  - Outros erros → mensagem genérica mantida

### Alterações no Segundo Cérebro (`router.ts` + `index.ts`)

- **`router.ts`**: Nova regra de roteamento (prioridade 4) direciona perguntas sobre "aceite hoje / aceite recente / último aceite" para `query_recent_acceptances`. Instrução explícita no system prompt proibindo o uso de `query_all_proposals` para este tipo de consulta.

- **`index.ts`**: Detecção heurística de frases como "aceite hoje", "quem aceitou", "novo contrato hoje" no pipeline de DB calls. Quando detectadas, passa `p_date = hoje` para filtrar apenas aceites do dia.

---

## Fluxo Pós-Correção

```
Cliente abre link da proposta
  → proposals.status = 'active' → carrega normalmente
  → proposals.status = 'accepted' → exibe "Proposta já aceita" (sem formulário)
  → proposals.status = 'inactive' / não encontrada → exibe 404

Cliente preenche formulário e confirma
  → RPC valida: proposta existe e status = 'active'
  → Insere aceite na tabela acceptances
  → Atualiza proposals.status = 'accepted'
  → Cria traffic_projects (frontend + fallback Edge Function)
  → Cria conta do cliente (create-client-user)
  → Exibe tela de sucesso com timestamp oficial

Segunda tentativa de aceite (qualquer usuário)
  → proposals.status = 'accepted' → tela "Proposta já aceita"
  → (ou) RPC bloqueia com exceção de status
```

---

## Arquivos Modificados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `supabase/migrations/20260319001000_add_status_to_proposals.sql` | Migration | Adiciona coluna `status` e restaura policy anônima |
| `supabase/migrations/20260319002000_lock_proposal_after_acceptance.sql` | Migration | RPC marca proposta como `accepted` após aceite |
| `supabase/migrations/20260319003000_add_query_recent_acceptances_rpc.sql` | Migration | Nova RPC para consulta de aceites recentes com data |
| `pages/ProposalView.tsx` | Frontend | Tela de proposta bloqueada + tratamento de erro melhorado |
| `supabase/functions/_shared/agents/router.ts` | Edge Function | Nova regra para `query_recent_acceptances` no roteador |
| `supabase/functions/chat-brain/index.ts` | Edge Function | Detecção de aceites recentes e chamada com `p_date` |
