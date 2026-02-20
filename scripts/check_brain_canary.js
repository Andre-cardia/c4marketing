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

const defaultUserId = '321f03b7-4b78-41f5-8133-6967d6aea169';
const userId = process.env.BRAIN_TEST_USER_ID || defaultUserId;
const userEmail = process.env.BRAIN_TEST_USER_EMAIL || 'andre@c4marketing.com';
const sessionId = process.env.BRAIN_TEST_SESSION_ID || randomUUID();

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

const marker = `CANARY_MEMORY_${Date.now()}`;
const serviceClient =
  serviceRoleKey && supabaseUrl
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

const b64u = (obj) =>
  Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const syntheticJwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({
  iss: 'supabase',
  ref: projectRef,
  role: 'authenticated',
  sub: userId,
  email: userEmail,
})}.signature`;

const chatEndpoint = `${supabaseUrl}/functions/v1/chat-brain`;

const callChat = async (query) => {
  const res = await fetch(chatEndpoint, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${syntheticJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      session_id: sessionId,
    }),
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

const hasIntegrationError = (text) => {
  const normalized = String(text || '').toLowerCase();
  return (
    normalized.includes('falha de integração') ||
    normalized.includes('sessão inválida') ||
    normalized.includes('sessao invalida') ||
    normalized.includes('invalid jwt')
  );
};

const tests = [];

const pushResult = (name, pass, detail, critical = false) => {
  tests.push({ name, pass, detail, critical });
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${name}`);
  if (detail) console.log(`       ${detail}`);
};

try {
  // 1) Health + normative flag
  const t1 = await callChat('Teste rápido de integração do cérebro. Responda em uma frase.');
  const t1Answer = t1.body?.answer || '';
  const t1Normative = t1.body?.meta?.normative_governance_enabled === true;
  const t1Pass = t1.status === 200 && t1Normative && !hasIntegrationError(t1Answer);
  pushResult(
    'Integração + Flag Normativa',
    t1Pass,
    `HTTP=${t1.status}, normative_governance_enabled=${String(t1Normative)}`,
    true
  );

  // 2) Multi-RPC query
  const t2 = await callChat('quantos usuários temos cadastrados no sistema e quantos projetos ativos?');
  const rpcs = Array.isArray(t2.body?.meta?.executed_db_rpcs) ? t2.body.meta.executed_db_rpcs : [];
  const hasUsers = rpcs.includes('query_all_users');
  const hasProjects = rpcs.includes('query_all_projects');
  const t2Pass = t2.status === 200 && hasUsers && hasProjects && !hasIntegrationError(t2.body?.answer);
  pushResult(
    'Pergunta Composta (multi-RPC)',
    t2Pass,
    `executed_db_rpcs=${JSON.stringify(rpcs)}`,
    true
  );

  // 3) Explicit memory save
  const t3 = await callChat(`guarde essa informação: ${marker}`);
  const memorySaved = t3.body?.meta?.memory_saved === true;
  const scope = t3.body?.meta?.memory_scope || 'unknown';
  const t3Pass = t3.status === 200 && memorySaved && !hasIntegrationError(t3.body?.answer);
  pushResult(
    'Salvar Memória Explícita',
    t3Pass,
    `memory_saved=${String(memorySaved)}, scope=${scope}`,
    true
  );

  // 4) Memory continuity (best effort; non-critical)
  const t4 = await callChat('qual informação eu acabei de pedir para salvar?');
  const t4Answer = String(t4.body?.answer || '');
  const t4Pass = t4.status === 200 && t4Answer.includes(marker);
  pushResult(
    'Recuperação Imediata da Memória',
    t4Pass,
    t4Pass ? 'Marker encontrado na resposta.' : 'Marker não foi encontrado na resposta.',
    false
  );

  // 5) Normative hierarchy (best effort; non-critical)
  const t5 = await callChat('Em conflito normativo, policy ou memo prevalece?');
  const t5Answer = String(t5.body?.answer || '').toLowerCase();
  const t5Pass = t5.status === 200 && t5Answer.includes('policy');
  pushResult(
    'Hierarquia Normativa',
    t5Pass,
    t5Pass ? 'Resposta mencionou policy como prioridade.' : 'Resposta não confirmou policy explicitamente.',
    false
  );

  const total = tests.length;
  const passed = tests.filter((t) => t.pass).length;
  const criticalFailed = tests.filter((t) => t.critical && !t.pass).length;

  if (serviceClient) {
    const { error: cleanupError } = await serviceClient
      .schema('brain')
      .from('documents')
      .delete()
      .ilike('content', `%${marker}%`);

    if (cleanupError) {
      console.warn(`[WARN] Canary marker cleanup failed: ${cleanupError.message}`);
    } else {
      console.log('[INFO] Canary marker cleanup executed (service role).');
    }
  } else {
    console.log('[INFO] Cleanup skipped: SUPABASE_SERVICE_ROLE_KEY not set in local env.');
  }

  console.log('\n=== Resumo ===');
  console.log(`Session ID: ${sessionId}`);
  console.log(`Marker: ${marker}`);
  console.log(`Resultado: ${passed}/${total} testes passaram.`);
  console.log(`Falhas críticas: ${criticalFailed}`);

  if (criticalFailed > 0) {
    process.exit(1);
  }
} catch (error) {
  console.error('[FATAL] Canary check crashed:', error?.message || error);
  process.exit(1);
}
