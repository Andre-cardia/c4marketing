import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKeyFile = process.env.SUPABASE_SERVICE_ROLE_KEY_FILE || '/tmp/supabase_service_role_key.txt';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[FATAL] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const managedCanaryEmail = 'brain-canary@c4marketing.com';
const userEmail = (process.env.BRAIN_TEST_USER_EMAIL || managedCanaryEmail).trim().toLowerCase();
const userFullName = (process.env.BRAIN_TEST_USER_FULL_NAME || 'Brain Canary').trim();
const directAccessToken = process.env.BRAIN_TEST_ACCESS_TOKEN?.trim() || null;
const configuredPassword = process.env.BRAIN_TEST_USER_PASSWORD?.trim() || null;
const userRole = process.env.BRAIN_TEST_USER_ROLE || 'gestor';
const sessionId = process.env.BRAIN_TEST_SESSION_ID || randomUUID();
const managedCanaryMode = userEmail === managedCanaryEmail;

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
const sloTracked = (process.env.BRAIN_CANARY_SLO_TRACKED || 'false').toLowerCase() === 'true';
const chatEndpoint = `${supabaseUrl}/functions/v1/chat-brain`;
const createAnonClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

const readOptionalFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const value = raw.trim();
    return value || null;
  } catch {
    return null;
  }
};

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (await readOptionalFile(serviceRoleKeyFile));
const serviceClient =
  serviceRoleKey && supabaseUrl
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const ensureManagedCanaryUser = async (password) => {
  if (!serviceClient) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada. Defina a chave ou informe BRAIN_TEST_ACCESS_TOKEN/BRAIN_TEST_USER_PASSWORD.'
    );
  }

  const listUsersByEmail = async (email) => {
    const pageSize = 200;
    let page = 1;

    while (true) {
      const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: pageSize });
      if (error) throw error;

      const users = Array.isArray(data?.users) ? data.users : [];
      const found = users.find((user) => String(user.email || '').trim().toLowerCase() === email);
      if (found) return found;
      if (users.length < pageSize) return null;
      page += 1;
    }
  };

  let authUser = await listUsersByEmail(userEmail);

  if (authUser) {
    const { data, error } = await serviceClient.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user_metadata || {}),
        full_name: userFullName,
        name: userFullName,
      },
    });

    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: userFullName,
        name: userFullName,
      },
    });

    if (error) throw error;
    authUser = data.user;
  }

  const { error: upsertError } = await serviceClient
    .from('app_users')
    .upsert({
      id: authUser.id,
      name: userFullName,
      full_name: userFullName,
      email: userEmail,
      phone: null,
      role: userRole,
    }, { onConflict: 'id' });

  if (upsertError) throw upsertError;
};

const resolveAccessToken = async () => {
  if (directAccessToken) {
    return directAccessToken;
  }

  let effectivePassword = configuredPassword;

  if (managedCanaryMode) {
    effectivePassword = effectivePassword || `BrainCanary#${randomUUID()}Aa1`;
    await ensureManagedCanaryUser(effectivePassword);
  } else if (!effectivePassword) {
    throw new Error(
      'Defina BRAIN_TEST_USER_PASSWORD para o usuário informado ou use o canário gerenciado padrão brain-canary@c4marketing.com com SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const authClient = createAnonClient();
  const { data, error } = await authClient.auth.signInWithPassword({
    email: userEmail,
    password: effectivePassword,
  });

  if (error || !data.session?.access_token) {
    throw new Error(`Falha ao autenticar o usuário de teste real: ${error?.message || 'sessão ausente'}`);
  }

  return data.session.access_token;
};

let cachedAccessToken = directAccessToken;

const getAccessToken = async () => {
  if (!cachedAccessToken) {
    cachedAccessToken = await resolveAccessToken();
  }

  return cachedAccessToken;
};

const callChat = async (query) => {
  const accessToken = await getAccessToken();
  let res;
  try {
    res = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
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
const runStartedAt = Date.now();

const pushResult = (name, pass, detail, critical = false) => {
  tests.push({ name, pass, detail, critical });
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${name}`);
  if (detail) console.log(`       ${detail}`);
};

try {
  // 1) Health + v8.0 Telemetry
  const t1 = await callChat('Teste rápido de integração do cérebro. Responda em uma frase.');
  const t1Answer = t1.body?.answer || '';
  const meta = t1.body?.meta || {};

  const hasLatency = typeof meta.latency_ms === 'number' && meta.latency_ms > 0;
  const hasCost = typeof meta.cost_est === 'number' && meta.cost_est >= 0;
  const hasLogId = !!meta.log_id;
  const hasCanonical = meta.canonical_memory_enabled === true;

  const t1Pass = t1.status === 200 && hasLatency && hasLogId && !hasIntegrationError(t1Answer);

  pushResult(
    'v8.0: Saúde + Telemetria + Auditoria',
    t1Pass,
    `HTTP=${t1.status}, Latency=${meta.latency_ms}ms, Cost=$${meta.cost_est?.toFixed(6)}, LogID=${meta.log_id}, Canonical=${hasCanonical}`,
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
  if (!t4Pass) {
    console.log(`       t4.answer=${t4Answer}`);
    console.log(`       t4.meta=${JSON.stringify(t4.body?.meta || {})}`);
  }

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
  const memoryRecallPass = tests.find((t) => t.name === 'Recuperação Imediata da Memória')?.pass ?? null;
  const runLatencyMs = Date.now() - runStartedAt;

  if (serviceClient) {
    const { error: sloLogError } = await serviceClient.rpc('log_agent_execution', {
      p_session_id: sessionId,
      p_agent_name: 'Canary_BrainMemory',
      p_action: 'memory_canary',
      p_status: criticalFailed > 0 ? 'error' : 'success',
      p_params: {
        canary: 'brain_memory',
        slo_tracked: sloTracked,
        marker,
        total_tests: total,
        passed_tests: passed,
        critical_failed: criticalFailed,
      },
      p_result: {
        memory_recall_pass: memoryRecallPass,
      },
      p_latency_ms: runLatencyMs,
      p_error_message: criticalFailed > 0 ? 'Critical canary failures detected' : null,
    });

    if (sloLogError) {
      console.warn(`[WARN] Memory SLO canary log failed: ${sloLogError.message}`);
    }
  }

  if (serviceClient) {
    const { data: deletedRows, error: cleanupError } = await serviceClient.rpc(
      'cleanup_brain_canary_marker',
      { p_marker: marker }
    );

    if (cleanupError) {
      console.warn(`[WARN] Canary marker cleanup failed: ${cleanupError.message}`);
    } else {
      const deletedCount = Number.isFinite(Number(deletedRows)) ? Number(deletedRows) : 0;
      console.log(`[INFO] Canary marker cleanup executed (service role). deleted_rows=${deletedCount}`);
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
