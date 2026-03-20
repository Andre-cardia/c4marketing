import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config();

const stripBOM = (s) => (typeof s === 'string' ? s.replace(/^\uFEFF/, '') : s);

const supabaseUrl = stripBOM(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
const serviceRoleKey = stripBOM(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[FATAL] Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const days = Number(process.env.BRAIN_GOV_DAYS || 30);
const recallTarget = Number(process.env.BRAIN_GOV_RECALL_TARGET || 95);
const maxCriticalCanaryFailures = Number(process.env.BRAIN_GOV_MAX_CRITICAL_FAILURES || 0);
const costLimitPerInteraction = Number(process.env.BRAIN_COST_LIMIT_PER_INTERACTION || 0.01);

if (!Number.isFinite(days) || days < 1) {
  console.error('[FATAL] BRAIN_GOV_DAYS must be >= 1');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const round = (n, d = 4) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const formatTs = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes(),
  )}${pad(d.getUTCSeconds())}`;
};

const fetchTelemetrySummary = async () => {
  const rpc = await supabase.rpc('query_telemetry_summary', {
    p_days: Math.floor(days),
  });

  if (!rpc.error) {
    return {
      telemetry: rpc.data || {},
      source: 'rpc_query_telemetry_summary',
    };
  }

  const message = String(rpc.error?.message || '').toLowerCase();
  const isAccessDenied = message.includes('acesso negado') || message.includes('denied');
  if (!isAccessDenied) {
    throw new Error(`query_telemetry_summary failed: ${rpc.error.message}`);
  }

  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const pageSize = 1000;
  let from = 0;
  let total = 0;
  let success = 0;
  let totalCost = 0;

  while (true) {
    const page = await supabase
      .schema('brain')
      .from('execution_logs')
      .select('status,cost_est,created_at')
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (page.error) {
      throw new Error(`execution_logs fallback failed: ${page.error.message}`);
    }

    const rows = Array.isArray(page.data) ? page.data : [];
    if (!rows.length) break;

    for (const row of rows) {
      total += 1;
      if (String(row.status || '').toLowerCase() === 'success') {
        success += 1;
      }
      totalCost += Number(row.cost_est || 0);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return {
    telemetry: {
      period_days: days,
      total_executions: total,
      success_count: success,
      error_count: Math.max(0, total - success),
      success_rate: total > 0 ? round((success / total) * 100, 2) : 0,
      cost_total_usd: round(totalCost, 6),
    },
    source: 'fallback_brain.execution_logs',
  };
};

const decidePolicy = ({ costPerInteraction, recallHitRate, criticalFailures }) => {
  const qualityGood = Number.isFinite(recallHitRate)
    ? recallHitRate >= recallTarget && criticalFailures <= maxCriticalCanaryFailures
    : false;

  if (!Number.isFinite(costPerInteraction)) {
    return {
      decision: 'NO_DATA',
      nextAction: 'Coletar mais execucoes no periodo para calcular custo por interacao.',
      retrievalReview: 'Sem dados suficientes para revisar estrategia de retrieval.',
    };
  }

  if (costPerInteraction > costLimitPerInteraction && qualityGood) {
    return {
      decision: 'OTIMIZAR_CUSTO',
      nextAction:
        'Reduzir custo por interacao sem afetar recall: revisar modelo default, top_k e tamanho de contexto nas consultas com maior custo.',
      retrievalReview:
        'Priorizar compressao de contexto e deduplicacao de documentos antes da chamada ao LLM; manter politica atual de recall.',
    };
  }

  if (costPerInteraction > costLimitPerInteraction && !qualityGood) {
    return {
      decision: 'RECUPERAR_QUALIDADE_E_CUSTO',
      nextAction:
        'Atuar em paralelo: estabilizar recall (falhas canario/qualidade) e reduzir picos de custo nos fluxos com erro.',
      retrievalReview:
        'Revisar roteamento multi-RPC e reforcar retrieval deterministico antes de tentar cortes agressivos de custo.',
    };
  }

  if (costPerInteraction <= costLimitPerInteraction && !qualityGood) {
    return {
      decision: 'PRIORIZAR_QUALIDADE',
      nextAction:
        'Manter budget atual e focar em elevar recall para meta com correcoes de retrieval, memoria explicita e consistencia de resposta.',
      retrievalReview:
        'Aumentar robustez de recall (metadados, priorizacao session/user, tratamento de misses) mantendo observabilidade de custo.',
    };
  }

  return {
    decision: 'MANTER_E_MONITORAR',
    nextAction:
      'Manter configuracao atual e monitorar mensalmente custo por interacao e recall hit-rate para detectar regressao precoce.',
    retrievalReview:
      'Estrategia de retrieval atual adequada para o periodo; revisar novamente no proximo ciclo mensal.',
  };
};

const reportMarkdown = ({
  telemetry,
  telemetrySource,
  slo,
  costPerInteraction,
  policy,
  reportPath,
}) => {
  const lines = [];
  lines.push('# Relatorio Mensal - Custo x Qualidade de Memoria');
  lines.push('');
  lines.push(`- Data UTC: ${new Date().toISOString()}`);
  lines.push(`- Janela analisada: ${days} dias`);
  lines.push(`- Limite de custo por interacao: $${costLimitPerInteraction.toFixed(4)}`);
  lines.push(`- Meta de recall: ${recallTarget}%`);
  lines.push(`- Fonte de telemetria: ${telemetrySource}`);
  lines.push('');
  lines.push('## Metricas');
  lines.push('');
  lines.push(`- Execucoes totais: ${telemetry.total_executions}`);
  lines.push(`- Taxa de sucesso geral: ${telemetry.success_rate}%`);
  lines.push(`- Custo total (USD): $${telemetry.cost_total_usd}`);
  lines.push(`- Custo por interacao (USD): $${round(costPerInteraction, 6)}`);
  lines.push(`- Recall hit-rate: ${slo.recall.hit_rate ?? 'n/a'}%`);
  lines.push(`- Falhas criticas de canario: ${slo.canary.critical_failures}`);
  lines.push(`- Status SLO: ${slo.alerts.overall}`);
  lines.push('');
  lines.push('## Decisao mensal');
  lines.push('');
  lines.push(`- Decisao: **${policy.decision}**`);
  lines.push(`- Proxima acao: ${policy.nextAction}`);
  lines.push(`- Revisao da estrategia de retrieval: ${policy.retrievalReview}`);
  lines.push('');
  lines.push('## Parametros de governanca');
  lines.push('');
  lines.push('| Parametro | Valor |');
  lines.push('|---|---:|');
  lines.push(`| BRAIN_GOV_DAYS | ${days} |`);
  lines.push(`| BRAIN_GOV_RECALL_TARGET | ${recallTarget} |`);
  lines.push(`| BRAIN_GOV_MAX_CRITICAL_FAILURES | ${maxCriticalCanaryFailures} |`);
  lines.push(`| BRAIN_COST_LIMIT_PER_INTERACTION | ${costLimitPerInteraction} |`);
  lines.push('');
  lines.push(`_Arquivo gerado automaticamente por scripts/check_brain_cost_quality_governance.js em ${reportPath}.`);
  lines.push('');
  return lines.join('\n');
};

const run = async () => {
  const telemetryResult = await fetchTelemetrySummary();

  const { data: sloData, error: sloError } = await supabase.rpc('query_memory_slo', {
    p_days: Math.floor(days),
    p_target_recall_hit_rate: recallTarget,
    p_max_critical_canary_failures: Math.floor(maxCriticalCanaryFailures),
  });

  if (sloError) {
    console.error(`[FATAL] query_memory_slo failed: ${sloError.message}`);
    process.exit(1);
  }

  const telemetry = telemetryResult.telemetry || {};
  const slo = sloData || { recall: {}, canary: {}, alerts: {} };

  const totalExecutions = Number(telemetry.total_executions || 0);
  const totalCost = Number(telemetry.cost_total_usd || 0);
  const recallHitRate =
    typeof slo?.recall?.hit_rate === 'number' ? Number(slo.recall.hit_rate) : Number.NaN;
  const criticalFailures = Number(slo?.canary?.critical_failures || 0);
  const costPerInteraction = totalExecutions > 0 ? totalCost / totalExecutions : Number.NaN;

  const policy = decidePolicy({ costPerInteraction, recallHitRate, criticalFailures });

  console.log('=== Memory Cost x Quality Governance ===');
  console.log(`window_days=${days}`);
  console.log(`total_executions=${totalExecutions}`);
  console.log(`cost_total_usd=${totalCost}`);
  console.log(`cost_per_interaction_usd=${round(costPerInteraction, 6)}`);
  console.log(`recall_hit_rate=${Number.isFinite(recallHitRate) ? recallHitRate : 'n/a'}`);
  console.log(`critical_canary_failures=${criticalFailures}`);
  console.log(`slo_overall=${slo?.alerts?.overall || 'n/a'}`);
  console.log(`monthly_decision=${policy.decision}`);

  const reportPath =
    process.env.BRAIN_GOV_REPORT_PATH ||
    path.join('docs', `brain_memory_cost_quality_report_${formatTs()}.md`);

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    reportMarkdown({
      telemetry,
      telemetrySource: telemetryResult.source,
      slo,
      costPerInteraction,
      policy,
      reportPath,
    }),
    'utf8',
  );

  console.log(`REPORT_PATH=${reportPath}`);
};

run().catch((error) => {
  console.error('[FATAL] Governance report crashed:', error?.message || error);
  process.exit(1);
});
