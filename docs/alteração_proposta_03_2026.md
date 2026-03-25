# Alterações na Proposta — Março 2026

**Data:** 24/03/2026  
**Responsável:** Antigravity (IA)  
**Área:** Componentes de Proposta Comercial e Contrato

---

## Contexto

Ajustes nos componentes de exibição da proposta gerada (`Pricing.tsx` e `ContractDetails.tsx`) para incluir a exibição de **prazo de entrega** e **condições de pagamento** por serviço, campos que já eram coletados no formulário (`CreateProposal.tsx`) mas não eram renderizados na proposta pública.

Posteriormente, foi identificado e corrigido um bug crítico onde o **prazo de entrega no contrato** sempre exibia 30 dias, ignorando o valor real cadastrado na proposta.

---

## Alterações — Sessão 1 (Proposta Pública)

### `components/Pricing.tsx`

**Alterações:**
- Adicionado campo `deliveryTimeline?: string` na interface `PricingProps`
- Importada função `normalizeWebsiteDeliveryTimeline` de `lib/contractTerms`
- Nos cards da seção **"Condições dos Projetos Únicos"**, agora exibe o prazo estimado de entrega do serviço quando preenchido, com ícone de relógio

**Comportamento:**
```
[ícone relógio] Prazo estimado: 30 dias úteis
50% na entrada e 50% na entrega do serviço.
```
> O prazo só aparece se o campo `deliveryTimeline` estiver preenchido.

---

### `components/ContractDetails.tsx`

**Alterações:**
- Importadas funções de `lib/proposalPaymentTerms`:
  - `getProposalServiceLabel`
  - `hasServicePaymentTerms`
  - `isOneTimeProposalService`
  - `normalizeOneTimePaymentTerms`
  - `DEFAULT_ONE_TIME_PAYMENT_TERMS`
- Adicionada lógica de agrupamento das condições de pagamento por serviço one-time
- Nova cláusula dinâmica **"Condições de Pagamento dos Projetos Únicos"** adicionada ao grid de cláusulas

**Comportamento:**
- A cláusula aparece apenas se houver serviços one-time (`landing_page`, `website`, `ecommerce`, `consulting`)
- Exibe o `paymentTerms` de cada serviço; se não preenchido, usa o padrão: `50% na entrada e 50% na entrega do serviço.`
- Formato: `Web Site Institucional: [termos] | Landing Page: [termos]`

---

## Arquivos Não Alterados — Sessão 1 (referência)

| Arquivo | Motivo |
|---|---|
| `components/CreateProposal.tsx` | Campos já existiam no formulário (linhas 319–361) |
| `lib/proposalPaymentTerms.ts` | Todos os exports necessários já existiam |
| `lib/contractTerms.ts` | `normalizeWebsiteDeliveryTimeline` já exportada (linha 41) |

---

## Onde os campos aparecem na proposta

```
Proposta pública (visão do cliente)
├── Seção Preços — Pricing.tsx
│   └── Card "Condições dos Projetos Únicos"
│       ├── 🕐 Prazo estimado: [deliveryTimeline]   ← NOVO (sessão 1)
│       └── Condições de pagamento: [paymentTerms]   ← já existia
│
└── Seção Cláusulas — ContractDetails.tsx
    └── Card "Condições de Pagamento dos Projetos Únicos"  ← NOVO (sessão 1)
        └── Serviço: [paymentTerms] | Serviço 2: [paymentTerms]
```

---

## Alterações — Sessão 2 (Correção de Bug no Contrato)

### Bug identificado

**Sintoma:** O contrato (`/p/<slug>/contract`) sempre exibia **"30 dias úteis"** como prazo de entrega do website, mesmo quando a proposta tinha um prazo diferente cadastrado (ex: 180 dias).

**Causa raiz:** Em `pages/ContractView.tsx`, o código buscava `proposal.deliveryTimeline` para substituir o placeholder de prazo no template do contrato. Porém, esse campo **não existe na raiz do objeto `proposal`** — o `deliveryTimeline` é armazenado dentro de cada serviço (`services[].deliveryTimeline`). Como `proposal.deliveryTimeline` retornava sempre `undefined`, o código sempre caía no fallback `WEBSITE_DEFAULT_DELIVERY_TIMELINE = '30 dias úteis'` e substituía o template por esse valor incorreto.

```tsx
// ❌ ANTES — proposal.deliveryTimeline é sempre undefined
const rawTimeline = proposal.deliveryTimeline || WEBSITE_DEFAULT_DELIVERY_TIMELINE;
const deliveryTimeline = normalizeWebsiteDeliveryTimeline(rawTimeline);
// → deliveryTimeline = null (normalizeWebsiteDeliveryTimeline retorna null para o default)
// → replace substituía '30 dias úteis' por null/undefined → bug visual
```

---

### `pages/ContractView.tsx`

**Commit:** `3bf5e1a` — `fix: corrige prazo de entrega no contrato usando deliveryTimeline do servico`

**Alterações:**

1. **Fonte do `deliveryTimeline` corrigida** — de `proposal.deliveryTimeline` (inexistente na raiz) para `serviceData?.deliveryTimeline` (campo correto dentro do serviço encontrado pelo template)

2. **Fallback pós-normalização adicionado** — `normalizeWebsiteDeliveryTimeline` retorna `null` quando o valor não é válido; adicionado `|| WEBSITE_DEFAULT_DELIVERY_TIMELINE` após a normalização para garantir que o replace nunca use `null`

3. **Interface `Proposal` corrigida** — removido campo `deliveryTimeline?: string` da interface, que não existia na raiz do objeto e induzia ao erro

```tsx
// ✅ DEPOIS — lê do serviço correto
const rawTimeline = serviceData?.deliveryTimeline || WEBSITE_DEFAULT_DELIVERY_TIMELINE;
const deliveryTimeline = normalizeWebsiteDeliveryTimeline(rawTimeline) || WEBSITE_DEFAULT_DELIVERY_TIMELINE;
processedContent = processedContent.replace(/30 dias úteis/g, deliveryTimeline);
```

**Impacto:** O contrato agora exibe corretamente o prazo definido na proposta (ex: "180 dias úteis") para o serviço de website. A correção se aplica tanto na visualização em localhost quanto em produção (deploy via push no branch `main`).

---

## Resumo de todos os arquivos alterados em março/2026

| Arquivo | Sessão | Tipo de alteração |
|---|---|---|
| `components/Pricing.tsx` | 1 | Feature — exibir prazo estimado na proposta pública |
| `components/ContractDetails.tsx` | 1 | Feature — nova cláusula de condições de pagamento |
| `pages/ContractView.tsx` | 2 | Bugfix — prazo de entrega no contrato sempre exibia 30 dias |
