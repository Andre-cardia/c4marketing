import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[FATAL] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const days = Number(process.env.BRAIN_SLO_DAYS || 1);
const recallTarget = Number(process.env.BRAIN_SLO_RECALL_TARGET || 95);
const maxCriticalCanaryFailures = Number(process.env.BRAIN_SLO_MAX_CRITICAL_FAILURES || 0);

if (!Number.isFinite(days) || days < 1) {
  console.error('[FATAL] BRAIN_SLO_DAYS must be a positive number');
  process.exit(1);
}

if (!Number.isFinite(recallTarget) || recallTarget < 0 || recallTarget > 100) {
  console.error('[FATAL] BRAIN_SLO_RECALL_TARGET must be between 0 and 100');
  process.exit(1);
}

if (!Number.isFinite(maxCriticalCanaryFailures) || maxCriticalCanaryFailures < 0) {
  console.error('[FATAL] BRAIN_SLO_MAX_CRITICAL_FAILURES must be >= 0');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

try {
  const { data, error } = await supabase.rpc('query_memory_slo', {
    p_days: Math.floor(days),
    p_target_recall_hit_rate: recallTarget,
    p_max_critical_canary_failures: Math.floor(maxCriticalCanaryFailures),
  });

  if (error) {
    console.error(`[FATAL] query_memory_slo failed: ${error.message}`);
    process.exit(1);
  }

  const recall = data?.recall || {};
  const canary = data?.canary || {};
  const alerts = data?.alerts || {};
  const targets = data?.targets || {};

  const formatRate = (value) => (typeof value === 'number' ? `${value.toFixed(2)}%` : 'n/a');

  console.log('=== Memory SLO ===');
  console.log(`Window: ${data?.period_days ?? days}d (cutoff=${data?.cutoff_date ?? 'n/a'})`);
  console.log(
    `Recall hit-rate: ${formatRate(recall.hit_rate)} | target >= ${targets.recall_hit_rate_min ?? recallTarget}% | total=${recall.total_requests ?? 0}`,
  );
  console.log(
    `Canary critical failures: ${canary.critical_failures ?? 0} | max=${targets.critical_canary_failures_max ?? maxCriticalCanaryFailures} | runs=${canary.runs ?? 0}`,
  );
  console.log(`Last canary: status=${canary.last_status ?? 'n/a'} at ${canary.last_run_at ?? 'n/a'}`);
  console.log(`Overall: ${alerts.overall ?? 'n/a'}`);

  if (alerts.overall === 'alert') {
    process.exit(1);
  }
} catch (error) {
  console.error('[FATAL] Memory SLO check crashed:', error?.message || error);
  process.exit(1);
}
