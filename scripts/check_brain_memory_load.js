import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[FATAL] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0];
  } catch {
    return null;
  }
})();

if (!projectRef) {
  console.error('[FATAL] Invalid VITE_SUPABASE_URL');
  process.exit(1);
}

const role = process.env.BRAIN_TEST_USER_ROLE || 'gestor';
const endpoint = `${supabaseUrl}/functions/v1/chat-brain`;
const query =
  process.env.BRAIN_LOAD_QUERY ||
  'quantos usuarios temos cadastrados no sistema e quantos projetos ativos?';

const expectedRpcs = ['query_all_users', 'query_all_projects'];
const stages = String(process.env.BRAIN_LOAD_STAGES || '20,50,100')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

if (stages.length === 0) {
  console.error('[FATAL] BRAIN_LOAD_STAGES must define at least one positive number.');
  process.exit(1);
}

const thresholds = {
  successRateMin: Number(process.env.BRAIN_LOAD_SUCCESS_RATE_MIN || 99),
  consistencyRateMin: Number(process.env.BRAIN_LOAD_CONSISTENCY_RATE_MIN || 95),
  p95LatencyMaxMs: Number(process.env.BRAIN_LOAD_P95_MAX_MS || 20000),
};

if (
  !Number.isFinite(thresholds.successRateMin) ||
  !Number.isFinite(thresholds.consistencyRateMin) ||
  !Number.isFinite(thresholds.p95LatencyMaxMs)
) {
  console.error('[FATAL] Invalid thresholds in env vars.');
  process.exit(1);
}

const strictMode = (process.env.BRAIN_LOAD_STRICT || 'false').toLowerCase() === 'true';

const b64u = (obj) =>
  Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const buildSyntheticJwt = ({ userId, userEmail }) => {
  const nowSec = Math.floor(Date.now() / 1000);
  return `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
    iss: 'supabase',
    ref: projectRef,
    role,
    sub: userId,
    email: userEmail,
    iat: nowSec,
    exp: nowSec + 60 * 60,
  })}.${b64u({ sig: 'memory-load' })}`;
};

const hasIntegrationError = (text) => {
  const normalized = String(text || '').toLowerCase();
  const folded = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (
    folded.includes('falha de integracao') ||
    folded.includes('sessao invalida') ||
    folded.includes('invalid jwt') ||
    folded.includes('incorrect api key')
  );
};

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
};

const round = (n, d = 2) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const timestampForFile = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
};

const callChat = async ({ sessionId, jwt }) => {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        session_id: sessionId,
      }),
    });
  } catch (error) {
    return {
      transportError: error?.message || String(error),
      elapsedMs: Date.now() - startedAt,
    };
  }

  const body = await response.json().catch(() => ({}));

  return {
    status: response.status,
    body,
    elapsedMs: Date.now() - startedAt,
  };
};

const runWorker = async ({ stageLabel, index }) => {
  const userId = randomUUID();
  const userEmail = `brain-load-${stageLabel.toLowerCase()}-${index}@c4marketing.com`;
  const jwt = buildSyntheticJwt({ userId, userEmail });
  const sessionId = randomUUID();
  const result = await callChat({ sessionId, jwt });

  if (result.transportError) {
    return {
      success: false,
      consistent: false,
      measuredLatencyMs: result.elapsedMs,
      serverLatencyMs: null,
      reason: `transport_error:${result.transportError}`,
      status: null,
      executedDbRpcs: [],
    };
  }

  const answer = String(result.body?.answer || '');
  const meta = result.body?.meta || {};
  const executedDbRpcs = Array.isArray(meta.executed_db_rpcs) ? meta.executed_db_rpcs : [];
  const hasExpectedRpcs = expectedRpcs.every((rpc) => executedDbRpcs.includes(rpc));
  const noError = !meta.error && !hasIntegrationError(answer);
  const success = result.status === 200 && noError;
  const consistent = success && hasExpectedRpcs;

  let reason = 'ok';
  if (!success) {
    if (result.status !== 200) {
      reason = `http_${result.status}`;
    } else if (meta.error) {
      reason = `meta_error:${String(meta.error).slice(0, 120)}`;
    } else if (hasIntegrationError(answer)) {
      reason = 'integration_error';
    } else {
      reason = 'unknown_error';
    }
  } else if (!consistent) {
    reason = `inconsistent_rpcs:${JSON.stringify(executedDbRpcs)}`;
  }

  return {
    success,
    consistent,
    measuredLatencyMs: result.elapsedMs,
    serverLatencyMs: typeof meta.latency_ms === 'number' ? meta.latency_ms : null,
    reason,
    status: result.status,
    executedDbRpcs,
  };
};

const summarizeStage = ({ concurrency, results, wallClockMs }) => {
  const total = results.length;
  const successCount = results.filter((r) => r.success).length;
  const consistencyCount = results.filter((r) => r.consistent).length;
  const measured = results.map((r) => r.measuredLatencyMs).filter((n) => Number.isFinite(n));
  const server = results.map((r) => r.serverLatencyMs).filter((n) => Number.isFinite(n));

  const reasons = new Map();
  for (const r of results) {
    if (r.reason === 'ok') continue;
    reasons.set(r.reason, (reasons.get(r.reason) || 0) + 1);
  }

  const reasonList = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  const successRate = total > 0 ? (successCount / total) * 100 : 0;
  const consistencyRate = total > 0 ? (consistencyCount / total) * 100 : 0;
  const p95 = percentile(measured, 95);

  const stagePass =
    successRate >= thresholds.successRateMin &&
    consistencyRate >= thresholds.consistencyRateMin &&
    (p95 ?? Number.POSITIVE_INFINITY) <= thresholds.p95LatencyMaxMs;

  return {
    concurrency,
    total,
    successCount,
    consistencyCount,
    successRate: round(successRate, 2),
    consistencyRate: round(consistencyRate, 2),
    measuredLatency: {
      avg: round(measured.reduce((acc, n) => acc + n, 0) / Math.max(1, measured.length), 2),
      p50: percentile(measured, 50),
      p95,
      p99: percentile(measured, 99),
    },
    serverLatency: {
      avg: server.length ? round(server.reduce((acc, n) => acc + n, 0) / server.length, 2) : null,
      p50: server.length ? percentile(server, 50) : null,
      p95: server.length ? percentile(server, 95) : null,
      p99: server.length ? percentile(server, 99) : null,
    },
    wallClockMs,
    stagePass,
    reasons: reasonList,
  };
};

const runStage = async (concurrency) => {
  const stageLabel = `S${concurrency}`;
  const startedAt = Date.now();
  const tasks = Array.from({ length: concurrency }, (_, idx) =>
    runWorker({ stageLabel, index: idx + 1 }),
  );

  const results = await Promise.all(tasks);
  const wallClockMs = Date.now() - startedAt;
  return summarizeStage({ concurrency, results, wallClockMs });
};

const buildRecommendations = (stageSummaries) => {
  const sorted = [...stageSummaries].sort((a, b) => a.concurrency - b.concurrency);
  const firstFail = sorted.find((s) => !s.stagePass);
  const highestPass = [...sorted].reverse().find((s) => s.stagePass);
  const lowestStage = sorted[0]?.concurrency || 0;

  const operationalLimit = highestPass
    ? highestPass.concurrency
    : Math.max(1, Math.floor(lowestStage * 0.5));

  let scaleTrigger;
  if (!firstFail) {
    scaleTrigger =
      'Escalar quando houver degradacao sustentada: success_rate < meta, consistency_rate < meta ou p95 acima do limite por 3 ciclos consecutivos.';
  } else if (!highestPass) {
    scaleTrigger = `Escalar imediatamente quando concorrencia >= ${lowestStage} ate novo hardening; manter operacao em ${operationalLimit} sessoes e reavaliar apos mitigacoes de 503/timeouts.`;
  } else {
    scaleTrigger = `Escalar quando atingir padrao do estagio ${firstFail.concurrency}: success_rate=${firstFail.successRate}%, consistency_rate=${firstFail.consistencyRate}%, p95=${firstFail.measuredLatency.p95}ms.`;
  }

  return { operationalLimit, scaleTrigger };
};

const markdownReport = ({ stageSummaries, recommendations, reportPath }) => {
  const now = new Date().toISOString();
  const lines = [];
  lines.push('# Relatorio de Carga de Memoria Cognitiva');
  lines.push('');
  lines.push(`- Data UTC: ${now}`);
  lines.push(`- Query base: \`${query}\``);
  lines.push(`- Estagios: \`${stages.join(', ')}\``);
  lines.push(
    `- Metas: success_rate >= ${thresholds.successRateMin}% | consistency_rate >= ${thresholds.consistencyRateMin}% | p95 <= ${thresholds.p95LatencyMaxMs}ms`,
  );
  lines.push('');
  lines.push('| Estagio | Total | Success | Consistency | Success % | Consistency % | p50 (ms) | p95 (ms) | p99 (ms) | Wall clock (ms) | Status |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');

  for (const s of stageSummaries) {
    lines.push(
      `| ${s.concurrency} sessoes | ${s.total} | ${s.successCount} | ${s.consistencyCount} | ${s.successRate}% | ${s.consistencyRate}% | ${s.measuredLatency.p50 ?? 'n/a'} | ${s.measuredLatency.p95 ?? 'n/a'} | ${s.measuredLatency.p99 ?? 'n/a'} | ${s.wallClockMs} | ${s.stagePass ? 'PASS' : 'FAIL'} |`,
    );
  }

  lines.push('');
  lines.push('## Recomendacoes operacionais');
  lines.push('');
  lines.push(`- Limite operacional recomendado: **${recommendations.operationalLimit} sessoes simultaneas**.`);
  lines.push(`- Gatilho de escala: ${recommendations.scaleTrigger}`);
  lines.push('');
  lines.push('## Erros por estagio (top 10)');
  lines.push('');

  for (const s of stageSummaries) {
    lines.push(`### ${s.concurrency} sessoes`);
    if (!s.reasons.length) {
      lines.push('- Sem erros relevantes.');
    } else {
      for (const r of s.reasons) {
        lines.push(`- ${r.reason}: ${r.count}`);
      }
    }
    lines.push('');
  }

  lines.push(`_Arquivo gerado automaticamente por scripts/check_brain_memory_load.js em ${reportPath}.`);
  lines.push('');

  return lines.join('\n');
};

const run = async () => {
  console.log('=== Brain Memory Load Test ===');
  console.log(`Stages: ${stages.join(', ')}`);
  console.log(`Query: ${query}`);
  console.log('');

  const summaries = [];
  for (const stage of stages) {
    console.log(`[RUN] Stage ${stage} concurrent sessions...`);
    const summary = await runStage(stage);
    summaries.push(summary);
    console.log(
      `[DONE] ${stage} | success=${summary.successRate}% | consistency=${summary.consistencyRate}% | p95=${summary.measuredLatency.p95}ms | status=${summary.stagePass ? 'PASS' : 'FAIL'}`,
    );
  }

  const recommendations = buildRecommendations(summaries);

  console.log('\n=== Summary ===');
  console.log(`Operational limit: ${recommendations.operationalLimit}`);
  console.log(`Scale trigger: ${recommendations.scaleTrigger}`);

  const reportPath =
    process.env.BRAIN_LOAD_REPORT_PATH ||
    path.join('docs', `brain_memory_load_report_${timestampForFile()}.md`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    markdownReport({ stageSummaries: summaries, recommendations, reportPath }),
    'utf8',
  );

  console.log(`REPORT_PATH=${reportPath}`);

  const hasFail = summaries.some((s) => !s.stagePass);
  if (strictMode && hasFail) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[FATAL] Load test crashed:', error?.message || error);
  process.exit(1);
});
