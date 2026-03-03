import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const runNow = new Date();
const todayIso = runNow.toISOString().slice(0, 10);
const todayUtcMs = Date.UTC(runNow.getUTCFullYear(), runNow.getUTCMonth(), runNow.getUTCDate());
const autoInit = (process.env.BRAIN_LH_AUTOINIT ?? 'true').toLowerCase() !== 'false';
const role = process.env.BRAIN_TEST_USER_ROLE || 'gestor';
const chatEndpoint = `${supabaseUrl}/functions/v1/chat-brain`;
const serviceClient =
  serviceRoleKey && supabaseUrl
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      })
    : null;

const horizons = [
  {
    label: 'T+1',
    days: 1,
    userId: process.env.BRAIN_LH_T1_USER_ID || '11111111-1111-4111-8111-111111111111',
    userEmail: process.env.BRAIN_LH_T1_USER_EMAIL || 'brain-lh-t1@c4marketing.com',
  },
  {
    label: 'T+7',
    days: 7,
    userId: process.env.BRAIN_LH_T7_USER_ID || '22222222-2222-4222-8222-222222222222',
    userEmail: process.env.BRAIN_LH_T7_USER_EMAIL || 'brain-lh-t7@c4marketing.com',
  },
  {
    label: 'T+30',
    days: 30,
    userId: process.env.BRAIN_LH_T30_USER_ID || '33333333-3333-4333-8333-333333333333',
    userEmail: process.env.BRAIN_LH_T30_USER_EMAIL || 'brain-lh-t30@c4marketing.com',
  },
];

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
  })}.${b64u({ sig: 'long-horizon-canary' })}`;
};

const hasIntegrationError = (text) => {
  const normalized = String(text || '').toLowerCase();
  const folded = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (
    folded.includes('falha de integracao') ||
    folded.includes('sessao invalida') ||
    folded.includes('invalid jwt')
  );
};

const parseMarker = (text) => {
  const match = String(text || '').match(
    /LH::(T\+1|T\+7|T\+30)::anchor=(\d{4}-\d{2}-\d{2})::id=([a-zA-Z0-9_-]+)/i,
  );
  if (!match) return null;
  return {
    horizon: match[1].toUpperCase(),
    anchorDate: match[2],
    markerId: match[3],
    raw: match[0],
  };
};

const getAgeDays = (anchorDate) => {
  const anchorMs = Date.parse(`${anchorDate}T00:00:00Z`);
  if (!Number.isFinite(anchorMs)) return null;
  return Math.floor((todayUtcMs - anchorMs) / (24 * 60 * 60 * 1000));
};

const hasRecallMeta = (meta) => {
  if (!meta || typeof meta !== 'object') return false;
  const hasRecall = meta.memory_recall === 'hit';
  const hasScope = typeof meta.memory_recall_scope === 'string' && meta.memory_recall_scope.length > 0;
  const hasSource = typeof meta.memory_recall_source === 'string' && meta.memory_recall_source.length > 0;
  const hasCandidates = typeof meta.memory_recall_candidates === 'number';
  return hasRecall && hasScope && hasSource && hasCandidates;
};

const makeMarker = (label) => `LH::${label}::anchor=${todayIso}::id=${randomUUID().split('-')[0]}`;

const callChat = async ({ jwt, sessionId, query }) => {
  let response;
  try {
    response = await fetch(chatEndpoint, {
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
  } catch (fetchError) {
    const cause = fetchError?.cause ? ` | cause=${String(fetchError.cause)}` : '';
    throw new Error(`chat-brain fetch failed: ${fetchError?.message || fetchError}${cause}`);
  }

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

const evaluateRecall = ({ horizon, recall }) => {
  const answer = String(recall.body?.answer || '');
  const meta = recall.body?.meta || {};
  const marker = parseMarker(answer);

  if (recall.status !== 200 || hasIntegrationError(answer)) {
    return {
      status: 'FAIL',
      detail: `Recall HTTP=${recall.status} with integration/auth error`,
    };
  }

  if (!marker) {
    if (meta.memory_recall === 'hit') {
      return {
        status: 'PENDING',
        detail: 'Recall hit without canonical LH marker format',
        meta,
      };
    }
    return null;
  }

  if (marker.horizon !== horizon.label) {
    const ageDays = getAgeDays(marker.anchorDate);
    const isDue = typeof ageDays === 'number' && ageDays >= horizon.days;
    return {
      status: isDue ? 'FAIL' : 'PENDING',
      detail: `Recall returned marker for ${marker.horizon} while validating ${horizon.label}`,
      marker,
      ageDays,
      meta,
    };
  }

  const ageDays = getAgeDays(marker.anchorDate);
  if (ageDays === null || ageDays < 0) {
    return {
      status: 'FAIL',
      detail: `Invalid anchor date in marker: ${marker.anchorDate}`,
    };
  }

  if (!hasRecallMeta(meta)) {
    return {
      status: 'FAIL',
      detail: 'Missing recall metadata (memory_recall_scope/source/candidates)',
      marker,
      ageDays,
    };
  }

  if (ageDays >= horizon.days) {
    return {
      status: 'PASS',
      detail: `Due and recalled (age=${ageDays}d, target=${horizon.days}d)`,
      marker,
      ageDays,
      meta,
    };
  }

  return {
    status: 'PENDING',
    detail: `Seed exists but not due yet (age=${ageDays}d, target=${horizon.days}d)`,
    marker,
    ageDays,
    meta,
  };
};

const processHorizon = async (horizon) => {
  const sessionId = randomUUID();
  const jwt = buildSyntheticJwt({
    userId: horizon.userId,
    userEmail: horizon.userEmail,
  });

  const initialRecall = await callChat({
    jwt,
    sessionId,
    query: 'qual informa\u00e7\u00e3o eu acabei de pedir para salvar?',
  });

  const existingEvaluation = evaluateRecall({
    horizon,
    recall: initialRecall,
  });

  if (existingEvaluation) {
    return {
      horizon,
      ...existingEvaluation,
    };
  }

  if (!autoInit) {
    return {
      horizon,
      status: 'FAIL',
      detail: 'No valid marker found and auto init is disabled',
    };
  }

  const marker = makeMarker(horizon.label);
  const save = await callChat({
    jwt,
    sessionId,
    query: `guarde essa informa\u00e7\u00e3o: ${marker}`,
  });

  const saveOk =
    save.status === 200 &&
    save.body?.meta?.memory_saved === true &&
    !hasIntegrationError(save.body?.answer);

  if (!saveOk) {
    return {
      horizon,
      status: 'FAIL',
      detail: `Save failed (HTTP=${save.status}, memory_saved=${String(save.body?.meta?.memory_saved)})`,
    };
  }

  const seededRecall = await callChat({
    jwt,
    sessionId,
    query: 'qual informa\u00e7\u00e3o eu acabei de pedir para salvar?',
  });

  const seededAnswer = String(seededRecall.body?.answer || '');
  const seededMeta = seededRecall.body?.meta || {};

  if (
    seededRecall.status !== 200 ||
    !seededAnswer.includes(marker) ||
    !hasRecallMeta(seededMeta) ||
    hasIntegrationError(seededAnswer)
  ) {
    return {
      horizon,
      status: 'FAIL',
      detail: `Seeded marker but recall validation failed (HTTP=${seededRecall.status})`,
    };
  }

  return {
    horizon,
    status: 'PENDING',
    detail: `Seeded new marker; waiting until ${horizon.days}d window is due`,
    marker: parseMarker(seededAnswer),
    ageDays: 0,
    meta: seededMeta,
  };
};

const printResult = (result) => {
  const { horizon, status, detail, marker, meta } = result;
  const source = meta?.memory_recall_source ?? 'n/a';
  const scope = meta?.memory_recall_scope ?? 'n/a';
  const candidates = meta?.memory_recall_candidates ?? 'n/a';
  const markerText = marker?.raw || 'n/a';
  console.log(
    `[${status}] ${horizon.label} | target=${horizon.days}d | scope=${scope} | source=${source} | candidates=${candidates}`,
  );
  console.log(`       ${detail}`);
  console.log(`       marker=${markerText}`);
};

const run = async () => {
  try {
    const runStartedAt = Date.now();
    console.log('=== Brain Memory Long Horizon ===');
    console.log(`Date (UTC): ${todayIso}`);
    console.log(`Auto-init: ${autoInit ? 'enabled' : 'disabled'}`);
    console.log('');

    const results = [];
    for (const horizon of horizons) {
      // Run sequentially to keep logs easy to read and avoid noisy concurrent load.
      const result = await processHorizon(horizon);
      results.push(result);
      printResult(result);
    }

    const passed = results.filter((r) => r.status === 'PASS').length;
    const pending = results.filter((r) => r.status === 'PENDING').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const dueNow = results.filter(
      (r) => (typeof r.ageDays === 'number' ? r.ageDays >= r.horizon.days : false),
    ).length;

    console.log('\n=== Summary ===');
    console.log(`Pass: ${passed}`);
    console.log(`Pending: ${pending}`);
    console.log(`Fail: ${failed}`);
    console.log(`Due windows evaluated now: ${dueNow}`);

    if (serviceClient) {
      const logStatus = failed > 0 ? 'error' : 'success';
      const runSessionId = randomUUID();
      const compactResults = results.map((r) => ({
        horizon: r.horizon.label,
        status: r.status,
        age_days: typeof r.ageDays === 'number' ? r.ageDays : null,
        source: r.meta?.memory_recall_source ?? null,
      }));

      const { error: logError } = await serviceClient.rpc('log_agent_execution', {
        p_session_id: runSessionId,
        p_agent_name: 'Canary_BrainMemory',
        p_action: 'memory_long_horizon',
        p_status: logStatus,
        p_params: {
          auto_init: autoInit,
          total_horizons: results.length,
          pass: passed,
          pending,
          fail: failed,
          due_now: dueNow,
        },
        p_result: {
          results: compactResults,
        },
        p_latency_ms: Date.now() - runStartedAt,
        p_error_message: failed > 0 ? 'Long horizon failures detected' : null,
      });

      if (logError) {
        console.warn(`[WARN] Memory long-horizon log failed: ${logError.message}`);
      }
    } else {
      console.log('[INFO] Long-horizon execution log skipped: SUPABASE_SERVICE_ROLE_KEY not set.');
    }

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[FATAL] Long horizon check crashed:', error?.message || error);
    process.exit(1);
  }
};

await run();
