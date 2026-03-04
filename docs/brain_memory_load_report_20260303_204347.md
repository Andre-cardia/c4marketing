# Relatorio de Carga de Memoria Cognitiva

- Data UTC: 2026-03-03T20:43:47.823Z
- Query base: `quantos usuarios temos cadastrados no sistema e quantos projetos ativos?`
- Estagios: `20, 50, 100`
- Metas: success_rate >= 99% | consistency_rate >= 95% | p95 <= 20000ms

| Estagio | Total | Success | Consistency | Success % | Consistency % | p50 (ms) | p95 (ms) | p99 (ms) | Wall clock (ms) | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20 sessoes | 20 | 20 | 20 | 100% | 100% | 1731 | 8526 | 9240 | 9268 | PASS |
| 50 sessoes | 50 | 50 | 50 | 100% | 100% | 2734 | 8335 | 8944 | 8945 | PASS |
| 100 sessoes | 100 | 100 | 100 | 100% | 100% | 2875 | 4938 | 7766 | 12857 | PASS |

## Recomendacoes operacionais

- Limite operacional recomendado: **100 sessoes simultaneas**.
- Gatilho de escala: Escalar quando houver degradacao sustentada: success_rate < meta, consistency_rate < meta ou p95 acima do limite por 3 ciclos consecutivos.

## Erros por estagio (top 10)

### 20 sessoes
- Sem erros relevantes.

### 50 sessoes
- Sem erros relevantes.

### 100 sessoes
- Sem erros relevantes.

_Arquivo gerado automaticamente por scripts/check_brain_memory_load.js em docs/brain_memory_load_report_20260303_204347.md.
