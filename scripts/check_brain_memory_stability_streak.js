import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[FATAL] Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const windowDays = Number(process.env.BRAIN_STABILITY_WINDOW_DAYS || 30);
const targetStreakDays = Number(process.env.BRAIN_STABILITY_TARGET_STREAK || 14);

if (!Number.isFinite(windowDays) || windowDays < 1) {
  console.error('[FATAL] BRAIN_STABILITY_WINDOW_DAYS must be >= 1');
  process.exit(1);
}

if (!Number.isFinite(targetStreakDays) || targetStreakDays < 1) {
  console.error('[FATAL] BRAIN_STABILITY_TARGET_STREAK must be >= 1');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const pad = (n) => String(n).padStart(2, '0');

const utcDay = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const formatTs = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes(),
  )}${pad(d.getUTCSeconds())}`;
};

const fetchDailyStatus = async () => {
  const { data, error } = await supabase.rpc('query_memory_stability_daily', {
    p_days: Math.floor(windowDays),
  });

  if (error) {
    throw new Error(`query_memory_stability_daily failed: ${error.message}`);
  }

  const rawDaily = Array.isArray(data?.daily) ? data.daily : [];
  return rawDaily.map((row) => {
    const canary = String(row?.canary || 'no_data').toLowerCase();
    const longHorizon = String(row?.long_horizon || row?.longHorizon || 'no_data').toLowerCase();
    return {
      day: String(row?.day || utcDay(new Date())),
      canary,
      longHorizon,
      stable: canary === 'success' && longHorizon === 'success',
    };
  });
};

const reportMarkdown = ({ currentStreak, gateStatus, dailyRows, reportPath }) => {
  const lines = [];
  const streakLabel = currentStreak === 1 ? 'dia' : 'dias';
  lines.push('# Relatorio Diario - Estabilidade de Memoria (14 dias)');
  lines.push('');
  lines.push(`- Data UTC: ${new Date().toISOString()}`);
  lines.push(`- Janela analisada: ${windowDays} dias`);
  lines.push(`- Meta de estabilidade: ${targetStreakDays} dias consecutivos`);
  lines.push(`- Streak atual: ${currentStreak} ${streakLabel}`);
  lines.push(`- Status do gate: **${gateStatus}**`);
  lines.push('');
  lines.push('## Status diario (canary + long horizon)');
  lines.push('');
  lines.push('| Dia (UTC) | Canary | Long Horizon | Dia estavel |');
  lines.push('|---|---|---|---|');
  for (const row of dailyRows) {
    lines.push(`| ${row.day} | ${row.canary} | ${row.longHorizon} | ${row.stable ? 'SIM' : 'NAO'} |`);
  }
  lines.push('');
  lines.push(
    `_Arquivo gerado automaticamente por scripts/check_brain_memory_stability_streak.js em ${reportPath}.`,
  );
  lines.push('');
  return lines.join('\n');
};

const run = async () => {
  const dailyRows = await fetchDailyStatus();

  let currentStreak = 0;
  for (const row of dailyRows) {
    if (row.stable) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  const today = dailyRows[0] || { canary: 'no_data', longHorizon: 'no_data', stable: false };
  const gateStatus = currentStreak >= targetStreakDays ? 'PASS' : 'PENDING';
  const reportPath =
    process.env.BRAIN_STABILITY_REPORT_PATH ||
    path.join('docs', `brain_memory_stability_streak_report_${formatTs()}.md`);

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    reportMarkdown({
      currentStreak,
      gateStatus,
      dailyRows,
      reportPath,
    }),
    'utf8',
  );

  console.log('=== Brain Memory Stability Streak ===');
  console.log(`window_days=${windowDays}`);
  console.log(`target_streak_days=${targetStreakDays}`);
  console.log(`current_streak_days=${currentStreak}`);
  console.log(`today_canary=${today.canary}`);
  console.log(`today_long_horizon=${today.longHorizon}`);
  console.log(`gate_status=${gateStatus}`);
  console.log(`report_path=${reportPath}`);

  if (!today.stable) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[FATAL] Stability streak check crashed:', error?.message || error);
  process.exit(1);
});
