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
const sampleSize = Number(process.env.BRAIN_QUALITY_SAMPLE_SIZE || 8);
const strictMode = (process.env.BRAIN_QUALITY_STRICT || 'false').toLowerCase() === 'true';

if (!Number.isFinite(sampleSize) || sampleSize < 1) {
  console.error('[FATAL] BRAIN_QUALITY_SAMPLE_SIZE must be >= 1');
  process.exit(1);
}

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
  })}.${b64u({ sig: 'memory-quality-audit' })}`;
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

const callChat = async ({ jwt, sessionId, query }) => {
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
      body: JSON.stringify({ query, session_id: sessionId }),
    });
  } catch (error) {
    return {
      status: null,
      body: {},
      elapsedMs: Date.now() - startedAt,
      transportError: error?.message || String(error),
    };
  }

  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body,
    elapsedMs: Date.now() - startedAt,
    transportError: null,
  };
};

const formatDateCompact = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
};

const now = new Date();
const runId = `${formatDateCompact(now)}-${randomUUID().split('-')[0]}`;

const classifySample = ({ recallResult, markerV1, markerV2, sampleId }) => {
  if (recallResult.transportError) {
    return {
      classification: 'incorreta',
      detail: `transport_error:${recallResult.transportError}`,
    };
  }

  const answer = String(recallResult.body?.answer || '');
  const meta = recallResult.body?.meta || {};

  if (recallResult.status !== 200 || meta.error || hasIntegrationError(answer)) {
    return {
      classification: 'incorreta',
      detail: `status=${recallResult.status} error=${String(meta.error || '').slice(0, 80)}`,
    };
  }

  if (answer.includes(markerV2)) {
    return {
      classification: 'correta',
      detail: 'Retornou a versao mais recente (V2).',
    };
  }

  if (answer.includes(markerV1)) {
    return {
      classification: 'desatualizada',
      detail: 'Retornou versao anterior (V1) em vez da mais recente.',
    };
  }

  const normalized = answer.toLowerCase();
  const hasAuditContext = normalized.includes(sampleId.toLowerCase()) || normalized.includes('audit');

  if (meta.memory_recall === 'hit' || hasAuditContext) {
    return {
      classification: 'parcial',
      detail: 'Recall hit sem retornar marcador esperado.',
    };
  }

  return {
    classification: 'incorreta',
    detail: 'Nao recuperou fato esperado nem contexto auditavel.',
  };
};

const runSample = async (index) => {
  const userId = randomUUID();
  const userEmail = `brain-quality-${runId}-${index}@c4marketing.com`;
  const sessionId = randomUUID();
  const jwt = buildSyntheticJwt({ userId, userEmail });
  const sampleId = `S${String(index).padStart(2, '0')}`;
  const markerV1 = `AUDIT::${runId}::${sampleId}::V1::${randomUUID().split('-')[0]}`;
  const markerV2 = `AUDIT::${runId}::${sampleId}::V2::${randomUUID().split('-')[0]}`;

  const saveV1 = await callChat({
    jwt,
    sessionId,
    query: `guarde essa informacao: ${markerV1}`,
  });

  const saveV2 = await callChat({
    jwt,
    sessionId,
    query: `guarde essa informacao: ${markerV2}`,
  });

  const saveV1Ok =
    saveV1.status === 200 &&
    saveV1.body?.meta?.memory_saved === true &&
    !hasIntegrationError(saveV1.body?.answer);

  const saveV2Ok =
    saveV2.status === 200 &&
    saveV2.body?.meta?.memory_saved === true &&
    !hasIntegrationError(saveV2.body?.answer);

  let recallResult;
  if (saveV1Ok && saveV2Ok) {
    recallResult = await callChat({
      jwt,
      sessionId,
      query: `qual foi a ultima informacao que pedi para salvar no contexto ${sampleId}?`,
    });
  } else {
    recallResult = {
      status: null,
      body: {},
      elapsedMs: null,
      transportError: `save_failed:v1=${saveV1.status}/saved=${String(saveV1.body?.meta?.memory_saved)};v2=${saveV2.status}/saved=${String(saveV2.body?.meta?.memory_saved)}`,
    };
  }

  const classification = classifySample({ recallResult, markerV1, markerV2, sampleId });

  return {
    sampleId,
    userId,
    sessionId,
    markerV1,
    markerV2,
    saveV1Ok,
    saveV2Ok,
    recallStatus: recallResult.status,
    recallLatencyMs: recallResult.elapsedMs,
    recallSource: recallResult.body?.meta?.memory_recall_source || null,
    recallScope: recallResult.body?.meta?.memory_recall_scope || null,
    classification: classification.classification,
    detail: classification.detail,
  };
};

const rate = (num, den) => {
  if (!den) return 0;
  return Math.round((num / den) * 10000) / 100;
};

const buildSummary = (samples) => {
  const total = samples.length;
  const counts = {
    correta: samples.filter((s) => s.classification === 'correta').length,
    parcial: samples.filter((s) => s.classification === 'parcial').length,
    incorreta: samples.filter((s) => s.classification === 'incorreta').length,
    desatualizada: samples.filter((s) => s.classification === 'desatualizada').length,
  };

  return {
    total,
    counts,
    rates: {
      correta: rate(counts.correta, total),
      parcial: rate(counts.parcial, total),
      incorreta: rate(counts.incorreta, total),
      desatualizada: rate(counts.desatualizada, total),
    },
  };
};

const markdownReport = ({ summary, samples, reportPath }) => {
  const lines = [];
  lines.push('# Relatorio Semanal de Qualidade de Memoria');
  lines.push('');
  lines.push(`- Run ID: ${runId}`);
  lines.push(`- Data UTC: ${new Date().toISOString()}`);
  lines.push(`- Total de amostras: ${summary.total}`);
  lines.push('');
  lines.push('## Taxa semanal por classe');
  lines.push('');
  lines.push('| Classe | Quantidade | Taxa |');
  lines.push('|---|---:|---:|');
  lines.push(`| correta | ${summary.counts.correta} | ${summary.rates.correta}% |`);
  lines.push(`| parcial | ${summary.counts.parcial} | ${summary.rates.parcial}% |`);
  lines.push(`| incorreta | ${summary.counts.incorreta} | ${summary.rates.incorreta}% |`);
  lines.push(`| desatualizada | ${summary.counts.desatualizada} | ${summary.rates.desatualizada}% |`);
  lines.push('');
  lines.push('## Amostras');
  lines.push('');
  lines.push('| Sample | Classe | Save V1 | Save V2 | Recall HTTP | Source | Scope | Latencia (ms) |');
  lines.push('|---|---|---|---|---:|---|---|---:|');
  for (const s of samples) {
    lines.push(
      `| ${s.sampleId} | ${s.classification} | ${s.saveV1Ok ? 'ok' : 'fail'} | ${s.saveV2Ok ? 'ok' : 'fail'} | ${s.recallStatus ?? 'n/a'} | ${s.recallSource ?? 'n/a'} | ${s.recallScope ?? 'n/a'} | ${s.recallLatencyMs ?? 'n/a'} |`,
    );
  }
  lines.push('');
  lines.push('## Notas');
  lines.push('');
  for (const s of samples) {
    lines.push(`- ${s.sampleId}: ${s.detail}`);
  }
  lines.push('');
  lines.push(`_Arquivo gerado automaticamente por scripts/check_brain_memory_quality_audit.js em ${reportPath}.`);
  lines.push('');
  return lines.join('\n');
};

const formatFileTs = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
};

const run = async () => {
  console.log('=== Brain Memory Quality Audit ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Sample size: ${sampleSize}`);

  const samples = [];
  for (let i = 1; i <= sampleSize; i += 1) {
    const sample = await runSample(i);
    samples.push(sample);
    console.log(
      `[${sample.classification.toUpperCase()}] ${sample.sampleId} | source=${sample.recallSource ?? 'n/a'} | scope=${sample.recallScope ?? 'n/a'} | detail=${sample.detail}`,
    );
  }

  const summary = buildSummary(samples);
  console.log('\n=== Weekly Rates ===');
  console.log(`correta=${summary.rates.correta}% (${summary.counts.correta}/${summary.total})`);
  console.log(`parcial=${summary.rates.parcial}% (${summary.counts.parcial}/${summary.total})`);
  console.log(`incorreta=${summary.rates.incorreta}% (${summary.counts.incorreta}/${summary.total})`);
  console.log(`desatualizada=${summary.rates.desatualizada}% (${summary.counts.desatualizada}/${summary.total})`);

  const reportPath =
    process.env.BRAIN_QUALITY_REPORT_PATH ||
    path.join('docs', `brain_memory_quality_audit_${formatFileTs()}.md`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdownReport({ summary, samples, reportPath }), 'utf8');
  console.log(`REPORT_PATH=${reportPath}`);

  const hasCritical = summary.counts.incorreta > 0 || summary.counts.desatualizada > 0;
  if (strictMode && hasCritical) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[FATAL] Quality audit crashed:', error?.message || error);
  process.exit(1);
});
