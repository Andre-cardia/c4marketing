# Relatorio Mensal - Custo x Qualidade de Memoria

- Data UTC: 2026-03-03T17:43:52.742Z
- Janela analisada: 30 dias
- Limite de custo por interacao: $0.0100
- Meta de recall: 95%
- Fonte de telemetria: rpc_query_telemetry_summary

## Metricas

- Execucoes totais: 473
- Taxa de sucesso geral: 100%
- Custo total (USD): $6.2053
- Custo por interacao (USD): $0.013119
- Recall hit-rate: 90%
- Falhas criticas de canario: 0
- Status SLO: alert

## Decisao mensal

- Decisao: **RECUPERAR_QUALIDADE_E_CUSTO**
- Proxima acao: Atuar em paralelo: estabilizar recall (falhas canario/qualidade) e reduzir picos de custo nos fluxos com erro.
- Revisao da estrategia de retrieval: Revisar roteamento multi-RPC e reforcar retrieval deterministico antes de tentar cortes agressivos de custo.

## Parametros de governanca

| Parametro | Valor |
|---|---:|
| BRAIN_GOV_DAYS | 30 |
| BRAIN_GOV_RECALL_TARGET | 95 |
| BRAIN_GOV_MAX_CRITICAL_FAILURES | 0 |
| BRAIN_COST_LIMIT_PER_INTERACTION | 0.01 |

_Arquivo gerado automaticamente por scripts/check_brain_cost_quality_governance.js em docs/brain_memory_cost_quality_report_20260303_174352.md.
