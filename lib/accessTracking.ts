import { supabase } from './supabase';

export const ACCESS_LOG_THROTTLE_MS = 5 * 60 * 1000;
export const ACCESS_LOG_ONLINE_WINDOW_MS = 15 * 60 * 1000;
const ACCESS_LOG_FUTURE_DRIFT_TOLERANCE_MS = 60 * 1000;

function getAccessLogStorageKey(userId: string) {
    return `lastAccessLog_${userId}`;
}

function readLastAccessLogTimestamp(storageKey: string, nowTs: number): number {
    const lastLogRaw = localStorage.getItem(storageKey);
    const lastLogTs = lastLogRaw ? Number(lastLogRaw) : 0;

    if (!Number.isFinite(lastLogTs) || lastLogTs <= 0) {
        localStorage.removeItem(storageKey);
        return 0;
    }

    // Clear poisoned timestamps so an old/future client state cannot suppress logging indefinitely.
    if (lastLogTs > (nowTs + ACCESS_LOG_FUTURE_DRIFT_TOLERANCE_MS)) {
        localStorage.removeItem(storageKey);
        return 0;
    }

    return lastLogTs;
}

export async function logUserAccess(options?: { force?: boolean }): Promise<boolean> {
    const force = options?.force ?? false;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user?.id) return false;

    const storageKey = getAccessLogStorageKey(user.id);
    const nowTs = Date.now();
    const lastLogTs = readLastAccessLogTimestamp(storageKey, nowTs);

    if (!force && Number.isFinite(lastLogTs) && lastLogTs > 0 && (nowTs - lastLogTs) < ACCESS_LOG_THROTTLE_MS) {
        return false;
    }

    const directInsert = await supabase.from('access_logs').insert({
        user_id: user.id,
        user_email: user.email ?? null,
    });

    if (directInsert.error) {
        console.error('Direct access log insert failed:', directInsert.error);
        return false;
    }

    localStorage.setItem(storageKey, String(nowTs));
    return true;
}

export function isUserConsideredOnline(accessedAt?: string | null): boolean {
    if (!accessedAt) return false;
    const accessedMs = new Date(accessedAt).getTime();
    if (Number.isNaN(accessedMs)) return false;
    return (Date.now() - accessedMs) <= ACCESS_LOG_ONLINE_WINDOW_MS;
}
