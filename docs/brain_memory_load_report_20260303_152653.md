# Relatorio de Carga de Memoria Cognitiva

- Data UTC: 2026-03-03T15:26:53.506Z
- Query base: `quantos usuarios temos cadastrados no sistema e quantos projetos ativos?`
- Estagios: `20, 50, 100`
- Metas: success_rate >= 99% | consistency_rate >= 95% | p95 <= 20000ms

| Estagio | Total | Success | Consistency | Success % | Consistency % | p50 (ms) | p95 (ms) | p99 (ms) | Wall clock (ms) | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20 sessoes | 20 | 19 | 19 | 95% | 95% | 10869 | 16631 | 16900 | 16947 | FAIL |
| 50 sessoes | 50 | 48 | 48 | 96% | 96% | 10862 | 17216 | 19737 | 19745 | FAIL |
| 100 sessoes | 100 | 93 | 93 | 93% | 93% | 9659 | 13953 | 14815 | 15142 | FAIL |

## Recomendacoes operacionais

- Limite operacional recomendado: **0 sessoes simultaneas**.
- Gatilho de escala: Escalar quando atingir padrao do estagio 20: success_rate=95%, consistency_rate=95%, p95=16631ms.

## Erros por estagio (top 10)

### 20 sessoes
- http_503: 1

### 50 sessoes
- http_503: 2

### 100 sessoes
- http_503: 7

_Arquivo gerado automaticamente por scripts/check_brain_memory_load.js em docs/brain_memory_load_report_20260303_152653.md.
