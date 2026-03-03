# Relatorio Diario - Memoria Long Horizon

- Data UTC: 2026-03-03T20:56:12.139Z
- Auto-init: enabled
- PASS: 1
- PENDING: 2
- FAIL: 0
- Due windows avaliadas agora: 1

## Resultado por horizonte

| Horizonte | Status | Age (dias) | Scope | Source | Candidates | Marker |
|---|---|---:|---|---|---:|---|
| T+1 | PASS | 1 | user | explicit_fact_store | 5 | LH::T+1::anchor=2026-03-02::id=2626ba62 |

Detalhe T+1: Due and recalled (age=1d, target=1d)

| T+7 | PENDING | 1 | user | explicit_fact_store | 5 | LH::T+7::anchor=2026-03-02::id=138baad0 |

Detalhe T+7: Seed exists but not due yet (age=1d, target=7d)

| T+30 | PENDING | 1 | user | explicit_fact_store | 5 | LH::T+30::anchor=2026-03-02::id=fcef08bb |

Detalhe T+30: Seed exists but not due yet (age=1d, target=30d)

_Arquivo gerado automaticamente por scripts/check_brain_memory_long_horizon.js em docs/brain_memory_long_horizon_report_20260303_205612.md.
