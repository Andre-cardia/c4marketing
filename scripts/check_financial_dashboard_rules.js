import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const supabaseKey = serviceRoleKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  console.error('[FATAL] Missing Supabase credentials. Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_* equivalents).');
  process.exit(1);
}

const targetYear = Number(process.env.FINANCIAL_CHECK_YEAR || new Date().getFullYear());
const tolerance = Number(process.env.FINANCIAL_CHECK_TOLERANCE || 0.01);

if (!Number.isFinite(targetYear) || targetYear < 2000 || targetYear > 2100) {
  console.error('[FATAL] FINANCIAL_CHECK_YEAR must be a valid year (e.g. 2026).');
  process.exit(1);
}

if (!Number.isFinite(tolerance) || tolerance < 0) {
  console.error('[FATAL] FINANCIAL_CHECK_TOLERANCE must be a number >= 0.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const activeStatuses = ['Ativo', 'Onboarding', 'Em andamento', 'ativo', 'onboarding'].map((s) => s.toLowerCase());

function parseDateLike(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toEndOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

function isActiveContract(acc) {
  const status = (acc?.status || '').trim();
  if (!status) return true;
  return activeStatuses.includes(status.toLowerCase());
}

function getMonthlyFee(acc) {
  if (acc?.proposal?.monthly_fee != null) return Number(acc.proposal.monthly_fee) || 0;
  if (acc?.contract_snapshot?.proposal?.monthly_fee != null) return Number(acc.contract_snapshot.proposal.monthly_fee) || 0;
  if (acc?.contract_snapshot?.proposal?.value != null) return Number(acc.contract_snapshot.proposal.value) || 0;
  if (acc?.contract_snapshot?.monthly_fee != null) return Number(acc.contract_snapshot.monthly_fee) || 0;
  return 0;
}

// Keep this aligned with lib/commercial-ai-agent.ts.
function getFinancialStartDate(acc) {
  const billingStart = parseDateLike(acc?.billing_start_date);
  if (billingStart) return billingStart;

  const snapshotBillingStart = parseDateLike(acc?.contract_snapshot?.billing_start_date);
  if (snapshotBillingStart) return snapshotBillingStart;

  const snapshotProposalBillingStart = parseDateLike(acc?.contract_snapshot?.proposal?.billing_start_date);
  if (snapshotProposalBillingStart) return snapshotProposalBillingStart;

  return parseDateLike(acc?.timestamp);
}

function isFinanciallyActiveAtDate(acc, referenceDate) {
  if (!isActiveContract(acc)) return false;

  const financialStart = getFinancialStartDate(acc);
  if (financialStart && financialStart > referenceDate) return false;

  const expirationDate = parseDateLike(acc?.expiration_date, true);
  if (expirationDate && expirationDate < referenceDate) return false;

  return true;
}

function mrrAtDate(acceptances, referenceDate) {
  return acceptances
    .filter((acc) => isFinanciallyActiveAtDate(acc, referenceDate))
    .reduce((sum, acc) => sum + getMonthlyFee(acc), 0);
}

function extractRpcMrr(payload) {
  if (payload == null) return null;
  if (typeof payload === 'number') return payload;
  if (typeof payload === 'string') {
    const parsed = Number(payload);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(payload)) {
    if (payload.length === 0) return 0;
    return extractRpcMrr(payload[0]);
  }
  if (typeof payload === 'object') {
    const direct = payload?.totals?.mrr;
    if (direct != null) return Number(direct) || 0;
    const nested = payload?.data?.totals?.mrr;
    if (nested != null) return Number(nested) || 0;
  }
  return null;
}

const syntheticTests = [
  {
    name: 'billing_start_date excludes contract before start date',
    acc: {
      status: 'Ativo',
      timestamp: '2026-02-20T10:00:00.000Z',
      billing_start_date: '2026-04-01',
      expiration_date: null,
      proposal: { monthly_fee: 3500 },
      contract_snapshot: null,
    },
    beforeDate: new Date('2026-03-31T23:59:59'),
    afterDate: new Date('2026-04-01T23:59:59'),
    expectedBefore: false,
    expectedAfter: true,
  },
  {
    name: 'expiration_date excludes contract after expiration',
    acc: {
      status: 'Ativo',
      timestamp: '2026-01-10T10:00:00.000Z',
      billing_start_date: '2026-01-10',
      expiration_date: '2026-02-28',
      proposal: { monthly_fee: 1000 },
      contract_snapshot: null,
    },
    beforeDate: new Date('2026-02-28T23:59:59'),
    afterDate: new Date('2026-03-01T00:00:00'),
    expectedBefore: true,
    expectedAfter: false,
  },
  {
    name: 'billing_start_date fallback from contract_snapshot',
    acc: {
      status: 'Ativo',
      timestamp: '2026-02-01T00:00:00.000Z',
      billing_start_date: null,
      expiration_date: null,
      proposal: null,
      contract_snapshot: { billing_start_date: '2026-05-01', proposal: { monthly_fee: 1200 } },
    },
    beforeDate: new Date('2026-04-30T23:59:59'),
    afterDate: new Date('2026-05-01T23:59:59'),
    expectedBefore: false,
    expectedAfter: true,
  },
];

try {
  console.log('=== Financial Dashboard Rule Check ===');
  console.log(`Year: ${targetYear}`);
  console.log(`Mode: ${serviceRoleKey ? 'service_role' : 'anon'} key`);

  let syntheticPass = 0;
  let syntheticFail = 0;

  for (const test of syntheticTests) {
    const before = isFinanciallyActiveAtDate(test.acc, test.beforeDate);
    const after = isFinanciallyActiveAtDate(test.acc, test.afterDate);
    const ok = before === test.expectedBefore && after === test.expectedAfter;
    if (ok) {
      syntheticPass += 1;
      console.log(`[PASS] synthetic: ${test.name}`);
    } else {
      syntheticFail += 1;
      console.log(`[FAIL] synthetic: ${test.name} (before=${before}, after=${after})`);
    }
  }

  const { data: acceptances, error } = await supabase
    .from('acceptances')
    .select(`
      id,
      company_name,
      status,
      timestamp,
      billing_start_date,
      expiration_date,
      contract_snapshot,
      proposal:proposals(monthly_fee)
    `)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error(`[FATAL] Failed to read acceptances: ${error.message}`);
    process.exit(1);
  }

  const rows = acceptances || [];
  console.log(`Contracts loaded: ${rows.length}`);

  const billingCandidates = rows.filter((acc) => isActiveContract(acc) && getFinancialStartDate(acc));
  let billingPass = 0;
  let billingFail = 0;
  const billingFailSample = [];

  for (const acc of billingCandidates) {
    const financialStart = getFinancialStartDate(acc);
    if (!financialStart) continue;

    const beforeStart = toEndOfDay(addDays(financialStart, -1));
    const atStart = toEndOfDay(financialStart);
    const expirationDate = parseDateLike(acc.expiration_date, true);
    if (expirationDate && expirationDate < atStart) continue;

    const beforeActive = isFinanciallyActiveAtDate(acc, beforeStart);
    const startActive = isFinanciallyActiveAtDate(acc, atStart);
    const ok = beforeActive === false && startActive === true;

    if (ok) {
      billingPass += 1;
    } else {
      billingFail += 1;
      if (billingFailSample.length < 5) {
        billingFailSample.push({
          id: acc.id,
          company: acc.company_name,
          start: toDateOnly(financialStart),
          beforeActive,
          startActive,
        });
      }
    }
  }

  const expirationCandidates = rows.filter((acc) => isActiveContract(acc) && parseDateLike(acc.expiration_date, true));
  let expirationPass = 0;
  let expirationFail = 0;
  const expirationFailSample = [];

  for (const acc of expirationCandidates) {
    const expirationDate = parseDateLike(acc.expiration_date, true);
    const financialStart = getFinancialStartDate(acc);
    if (!expirationDate) continue;
    if (financialStart && financialStart > expirationDate) continue;

    const atExpiration = new Date(expirationDate);
    const dayAfterExpiration = addDays(toEndOfDay(expirationDate), 1);
    const activeAtExpiration = isFinanciallyActiveAtDate(acc, atExpiration);
    const activeAfterExpiration = isFinanciallyActiveAtDate(acc, dayAfterExpiration);
    const ok = activeAtExpiration === true && activeAfterExpiration === false;

    if (ok) {
      expirationPass += 1;
    } else {
      expirationFail += 1;
      if (expirationFailSample.length < 5) {
        expirationFailSample.push({
          id: acc.id,
          company: acc.company_name,
          expiration: toDateOnly(expirationDate),
          activeAtExpiration,
          activeAfterExpiration,
        });
      }
    }
  }

  console.log(`[PASS] billing_start_date transition: ${billingPass}/${billingCandidates.length}`);
  if (billingFail > 0) {
    console.log(`[FAIL] billing_start_date transition failures: ${billingFail}`);
    console.log(`       sample=${JSON.stringify(billingFailSample)}`);
  }

  if (expirationCandidates.length === 0) {
    console.log('[WARN] expiration_date transition: no active contracts with expiration_date found.');
  } else {
    console.log(`[PASS] expiration_date transition: ${expirationPass}/${expirationCandidates.length}`);
    if (expirationFail > 0) {
      console.log(`[FAIL] expiration_date transition failures: ${expirationFail}`);
      console.log(`       sample=${JSON.stringify(expirationFailSample)}`);
    }
  }

  const mrrMonthlyRows = [];
  for (let month = 0; month < 12; month += 1) {
    const monthEnd = new Date(targetYear, month + 1, 0, 23, 59, 59, 999);
    const dateKey = toDateOnly(monthEnd);
    mrrMonthlyRows.push({
      month: String(month + 1).padStart(2, '0'),
      date: dateKey,
      localMrr: mrrAtDate(rows, monthEnd),
    });
  }

  console.log('MRR by month-end (local logic):');
  for (const row of mrrMonthlyRows) {
    console.log(`  ${row.month}/${targetYear} (${row.date}) => ${row.localMrr.toFixed(2)}`);
  }

  let rpcFail = 0;
  if (serviceRoleKey) {
    for (const row of mrrMonthlyRows) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('query_financial_summary', {
        p_reference_date: row.date,
        p_status: 'Ativo',
      });

      if (rpcError) {
        rpcFail += 1;
        console.log(`[FAIL] RPC query_financial_summary for ${row.date}: ${rpcError.message}`);
        continue;
      }

      const rpcMrr = extractRpcMrr(rpcData);
      if (rpcMrr == null) {
        rpcFail += 1;
        console.log(`[FAIL] RPC query_financial_summary for ${row.date}: could not parse totals.mrr`);
        continue;
      }

      const diff = Math.abs(rpcMrr - row.localMrr);
      if (diff > tolerance) {
        rpcFail += 1;
        console.log(`[FAIL] RPC parity ${row.date}: local=${row.localMrr.toFixed(2)} rpc=${rpcMrr.toFixed(2)} diff=${diff.toFixed(2)}`);
      } else {
        console.log(`[PASS] RPC parity ${row.date}: local=${row.localMrr.toFixed(2)} rpc=${rpcMrr.toFixed(2)}`);
      }
    }
  } else {
    console.log('[WARN] RPC parity skipped: SUPABASE_SERVICE_ROLE_KEY not provided.');
  }

  const hardFailures =
    syntheticFail +
    billingFail +
    expirationFail +
    rpcFail;

  console.log('=== Summary ===');
  console.log(`Synthetic tests: ${syntheticPass}/${syntheticTests.length}`);
  console.log(`Billing transition failures: ${billingFail}`);
  console.log(`Expiration transition failures: ${expirationFail}`);
  console.log(`RPC parity failures: ${rpcFail}`);

  if (hardFailures > 0) {
    process.exit(1);
  }
} catch (fatalError) {
  console.error('[FATAL] Financial dashboard rule check crashed:', fatalError?.message || fatalError);
  process.exit(1);
}
