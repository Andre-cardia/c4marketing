import { supabase } from './supabase';

export const ACCESS_LOG_THROTTLE_MS = 5 * 60 * 1000;
export const ACCESS_LOG_ONLINE_WINDOW_MS = 15 * 60 * 1000;

function getAccessLogStorageKey(userId: string) {
    return `lastAccessLog_${userId}`;
}

export async function logUserAccess(options?: { force?: boolean }): Promise<boolean> {
    const force = options?.force ?? false;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user?.id) return false;

    const storageKey = getAccessLogStorageKey(user.id);
    const lastLogRaw = localStorage.getItem(storageKey);
    const lastLogTs = lastLogRaw ? Number(lastLogRaw) : 0;
    const nowTs = Date.now();

    if (!force && Number.isFinite(lastLogTs) && lastLogTs > 0 && (nowTs - lastLogTs) < ACCESS_LOG_THROTTLE_MS) {
        return false;
    }

    const rpcResult = await supabase.rpc('log_user_access');
    if (rpcResult.error) {
        console.warn('log_user_access RPC failed, trying direct insert fallback:', rpcResult.error.message);

        const fallbackInsert = await supabase.from('access_logs').insert({
            user_id: user.id,
            user_email: user.email ?? null,
        });

        if (fallbackInsert.error) {
            console.error('Fallback access log insert failed:', fallbackInsert.error);
            return false;
        }
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
