# Relatorio de Carga de Memoria Cognitiva

- Data UTC: 2026-03-03T15:28:25.433Z
- Query base: `quantos usuarios temos cadastrados no sistema e quantos projetos ativos?`
- Estagios: `20, 50, 100`
- Metas: success_rate >= 99% | consistency_rate >= 95% | p95 <= 20000ms

| Estagio | Total | Success | Consistency | Success % | Consistency % | p50 (ms) | p95 (ms) | p99 (ms) | Wall clock (ms) | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20 sessoes | 20 | 20 | 20 | 100% | 100% | 7975 | 10716 | 20749 | 20766 | PASS |
| 50 sessoes | 50 | 49 | 49 | 98% | 98% | 10755 | 14906 | 16557 | 16566 | FAIL |
| 100 sessoes | 100 | 96 | 96 | 96% | 96% | 10788 | 17753 | 19406 | 20431 | FAIL |

## Recomendacoes operacionais

- Limite operacional recomendado: **20 sessoes simultaneas**.
- Gatilho de escala: Escalar quando atingir padrao do estagio 50: success_rate=98%, consistency_rate=98%, p95=14906ms.

## Erros por estagio (top 10)

### 20 sessoes
- Sem erros relevantes.

### 50 sessoes
- http_503: 1

### 100 sessoes
- http_503: 4

_Arquivo gerado automaticamente por scripts/check_brain_memory_load.js em docs/brain_memory_load_report_20260303_152825.md.
