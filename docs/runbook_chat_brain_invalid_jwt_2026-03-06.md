# Runbook: Segundo Cérebro com `Invalid JWT` (2026-03-06)

## Objetivo
Registrar a correção aplicada para o incidente em que o chat do Segundo Cérebro retornava continuamente:

- `Sua sessão expirou ou ficou inválida...`
- `POST .../functions/v1/chat-brain 401 (Unauthorized)`
- `askBrain ... failed: Invalid JWT`

## Sintoma observado
No browser console:

- `askBrain first attempt failed: Invalid JWT`
- `askBrain second attempt (refresh + invoke) failed: Invalid JWT`
- `askBrain third attempt (direct fetch) failed: Invalid JWT`
- endpoint `chat-brain` respondendo `401`.

## Causa raiz (confirmada)
1. A Edge Function `chat-brain` estava sendo rejeitada no gateway por validação JWT em camada anterior ao handler.
2. O frontend ainda podia enviar token em formato inadequado (ex.: prefixo `Bearer ` duplicado/formatado de forma inconsistente), agravando o `Invalid JWT`.

Observação histórica: nas versões de estabilização v5.0/v6.0/v8.6, a arquitetura adotada foi:

- `verify_jwt = false` no gateway da função `chat-brain`
- validação de autenticação feita dentro do handler (`chat-brain/index.ts`).

## Correção aplicada

### 1) Backend (Supabase Function)
Redeploy da função `chat-brain` com verificação JWT desativada no gateway:

```bash
SUPABASE_ACCESS_TOKEN="<token>" supabase functions deploy chat-brain \
  --project-ref xffdrdoaysxfkpebhywl \
  --no-verify-jwt \
  --workdir .
```

Validação:

```bash
SUPABASE_ACCESS_TOKEN="<token>" supabase functions list \
  --project-ref xffdrdoaysxfkpebhywl -o json
```

Critério esperado para `chat-brain`:

- `"status": "ACTIVE"`
- `"verify_jwt": false`

Estado pós-fix (2026-03-06):

- função `chat-brain` ativa
- `verify_jwt: false`
- versão: `141`

### 2) Frontend (`lib/brain.ts`)
Ajustes aplicados:

1. Remoção de logout forçado no erro de JWT (evita redirecionamento automático para login).
2. Pré-check de sessão não bloqueante (alinhado ao histórico v5/v6).
3. Normalização do token antes de chamar a função:
   - remove `Bearer ` duplicado
   - aplica `trim`
   - valida formato JWT básico (`header.payload.signature`)
4. Mantida estratégia de tentativa em camadas:
   - `invoke`
   - refresh + `invoke`
   - fetch direto

Arquivo alterado:

- `lib/brain.ts`

## Deploy de frontend (produção)
Deploy aplicado após ajustes de token/sessão:

- Vercel deploy id: `dpl_KXyoXRgYackHaRD2heXPPc3N5sXC`
- domínio: `https://sistema.c4marketing.com.br`

## Checklist de validação
1. Fazer hard refresh no navegador (`Ctrl/Cmd + Shift + R`).
2. Abrir `/brain` autenticado como `gestor`.
3. Enviar mensagem simples (`oi`).
4. Confirmar que:
   - não há redirecionamento para login
   - não há loop da mensagem de sessão inválida
   - requisição `chat-brain` retorna `200`/resposta do agente

## Se o erro voltar
1. Revalidar `verify_jwt` da função `chat-brain` (deve ser `false`).
2. Confirmar que a build em produção contém a versão atual de `lib/brain.ts`.
3. Coletar do console/browser:
   - linhas `askBrain ... failed`
   - status + response body da chamada `POST /functions/v1/chat-brain`
4. Reexecutar deploy da função com `--no-verify-jwt` e redeploy frontend.

## Referências internas
- `docs/brain_tech_report_v5.0.md`
- `docs/brain_tech_report_v6.0.md`
- `docs/brain_tech_report_v8.6.md`
