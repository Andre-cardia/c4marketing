# Alterações na Proposta — Março 2026

**Data:** 24/03/2026  
**Responsável:** Antigravity (IA)  
**Área:** Componentes de Proposta Comercial

---

## Contexto

Ajustes nos componentes de exibição da proposta gerada (`Pricing.tsx` e `ContractDetails.tsx`) para incluir a exibição de **prazo de entrega** e **condições de pagamento** por serviço, campos que já eram coletados no formulário (`CreateProposal.tsx`) mas não eram renderizados na proposta pública.

---

## Arquivos Alterados

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

## Arquivos Não Alterados (referência)

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
│       ├── 🕐 Prazo estimado: [deliveryTimeline]   ← NOVO
│       └── Condições de pagamento: [paymentTerms]   ← já existia
│
└── Seção Cláusulas — ContractDetails.tsx
    └── Card "Condições de Pagamento dos Projetos Únicos"  ← NOVO
        └── Serviço: [paymentTerms] | Serviço 2: [paymentTerms]
```
