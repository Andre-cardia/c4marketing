# Relatorio de Carga de Memoria Cognitiva

- Data UTC: 2026-03-03T20:38:39.320Z
- Query base: `quantos usuarios temos cadastrados no sistema e quantos projetos ativos?`
- Estagios: `20, 50, 100`
- Metas: success_rate >= 99% | consistency_rate >= 95% | p95 <= 20000ms

| Estagio | Total | Success | Consistency | Success % | Consistency % | p50 (ms) | p95 (ms) | p99 (ms) | Wall clock (ms) | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20 sessoes | 20 | 0 | 0 | 0% | 0% | 35 | 36 | 67 | 69 | FAIL |
| 50 sessoes | 50 | 0 | 0 | 0% | 0% | 16 | 21 | 21 | 23 | FAIL |
| 100 sessoes | 100 | 0 | 0 | 0% | 0% | 26 | 26 | 26 | 30 | FAIL |

## Recomendacoes operacionais

- Limite operacional recomendado: **10 sessoes simultaneas**.
- Gatilho de escala: Escalar imediatamente quando concorrencia >= 20 ate novo hardening; manter operacao em 10 sessoes e reavaliar apos mitigacoes de 503/timeouts.

## Erros por estagio (top 10)

### 20 sessoes
- transport_error:fetch failed: 20

### 50 sessoes
- transport_error:fetch failed: 50

### 100 sessoes
- transport_error:fetch failed: 100

_Arquivo gerado automaticamente por scripts/check_brain_memory_load.js em docs/brain_memory_load_report_20260303_203839.md.
