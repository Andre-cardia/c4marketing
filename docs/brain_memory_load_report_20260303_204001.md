# Relatorio de Carga de Memoria Cognitiva

- Data UTC: 2026-03-03T20:40:01.832Z
- Query base: `quantos usuarios temos cadastrados no sistema e quantos projetos ativos?`
- Estagios: `20, 50, 100`
- Metas: success_rate >= 99% | consistency_rate >= 95% | p95 <= 20000ms

| Estagio | Total | Success | Consistency | Success % | Consistency % | p50 (ms) | p95 (ms) | p99 (ms) | Wall clock (ms) | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20 sessoes | 20 | 8 | 8 | 40% | 40% | 7041 | 48654 | 48693 | 48694 | FAIL |
| 50 sessoes | 50 | 14 | 14 | 28% | 28% | 10840 | 14038 | 18142 | 18152 | FAIL |
| 100 sessoes | 100 | 3 | 3 | 3% | 3% | 274 | 1250 | 5372 | 5556 | FAIL |

## Recomendacoes operacionais

- Limite operacional recomendado: **10 sessoes simultaneas**.
- Gatilho de escala: Escalar imediatamente quando concorrencia >= 20 ate novo hardening; manter operacao em 10 sessoes e reavaliar apos mitigacoes de 503/timeouts.

## Erros por estagio (top 10)

### 20 sessoes
- http_502: 12

### 50 sessoes
- http_502: 31
- http_503: 5

### 100 sessoes
- http_502: 97

_Arquivo gerado automaticamente por scripts/check_brain_memory_load.js em docs/brain_memory_load_report_20260303_204001.md.
