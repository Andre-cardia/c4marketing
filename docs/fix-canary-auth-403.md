# Fix: Erro 403 no Canário de Autenticação do Chat-Brain

**Data:** 2026-03-20  
**Arquivo corrigido:** `scripts/check_brain_canary.js`  
**Workflow afetado:** `.github/workflows/brain-memory-long-horizon-daily.yml`

---

## Problema

O script `check_brain_canary.js` enviava um **JWT sintético** (sem assinatura válida) como Bearer token para a Edge Function `chat-brain`. Isso causava falha silenciosa na validação e o retorno de **HTTP 403 Forbidden** nos testes do canário diário.

### Fluxo com falha

```
check_brain_canary.js
  └─▶ POST /functions/v1/chat-brain
        └─▶ client.auth.getUser(token)   ← FALHA (JWT não assinado pelo GoTrue)
              └─▶ fallback: busca userId em app_users
                    └─▶ userId não encontrado → role = 'authenticated'
                          └─▶ 403 Forbidden
```

O `userId` embutido no JWT sintético (`321f03b7-4b78-41f5-8133-6967d6aea169`) não existia (ou não tinha role `gestor`) na tabela `app_users`, portanto o fallback sempre retornava role inválido.

---

## Solução

Substituído o JWT sintético por **token de acesso real**, obtido via Admin API do Supabase:

```javascript
// 1. Gera magic link via admin API (requer SUPABASE_SERVICE_ROLE_KEY)
const { data: linkData } = await serviceClient.auth.admin.generateLink({
  type: 'magiclink',
  email: userEmail,          // 'andre@c4marketing.com'
  options: { redirectTo: supabaseUrl },
});

// 2. Extrai o token_hash do action_link
const tokenHash = new URL(linkData.properties.action_link)
  .searchParams.get('token');

// 3. Troca pelo access_token real (fluxo OTP)
const { data: sessionData } = await anonClient.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink',
});

accessToken = sessionData.session.access_token;
```

### Fluxo corrigido

```
check_brain_canary.js
  └─▶ admin.generateLink('magiclink') → token_hash
        └─▶ anonClient.verifyOtp(token_hash) → access_token real
              └─▶ POST /functions/v1/chat-brain  (Bearer = access_token real)
                    └─▶ client.auth.getUser(token)  ← SUCESSO
                          └─▶ busca role em app_users por userId real
                                └─▶ role = 'gestor' → 200 OK
```

---

## Fallback Local

Quando `SUPABASE_SERVICE_ROLE_KEY` **não** está disponível (ex: debug local sem `.env` completo), o script mantém o JWT sintético com aviso explícito no log:

```
[AUTH] AVISO: Não foi possível obter token real. Usando JWT sintético como fallback local.
[AUTH] Este modo pode causar 403 se o userId não existir na tabela app_users.
```

> **Atenção:** nunca use o modo fallback em CI/CD. Garanta que `SUPABASE_SERVICE_ROLE_KEY` esteja configurado como secret no repositório.

---

## CI/CD — Nenhuma Mudança Necessária

O workflow `brain-memory-long-horizon-daily.yml` já mapeava corretamente o secret:

```yaml
# .github/workflows/brain-memory-long-horizon-daily.yml
env:
  VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}  # ✅ já presente
```

---

## Resumo das Alterações

| Arquivo | Tipo | Descrição |
|---|---|---|
| `scripts/check_brain_canary.js` | Modificado | Substituiu JWT sintético por token real via `admin.generateLink` + `verifyOtp`; mantém fallback local com aviso |
| `.github/workflows/brain-memory-long-horizon-daily.yml` | Sem alteração | `SUPABASE_SERVICE_ROLE_KEY` já estava mapeado corretamente |
