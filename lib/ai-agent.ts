import { supabase } from './supabase';

export interface AgentReport {
    executiveSummary: string;
    tasks: {
        inProgress: Array<{ name: string; assignee: string; priority: string; daysActive: number }>;
        backlog: Array<{ name: string; assignee: string; deadline: string; priority: string }>;
        analysis: string;
    };
    proposals: {
        recentWon: Array<{ client: string; service: string; value: string }>;
        totalValue: string;
        celebrationMessage: string;
    };
    users: {
        newUsers: Array<{ name: string; role: string }>;
        totalActive: number;
        analysis: string;
    };
    recommendations: string[];
    timestamp: string;
}

/**
 * Fetches relevant system context for the AI agent.
 */
async function fetchSystemContext() {
    const now = new Date();
    // Use start of the current month to align with "this month" user expectation
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch recent tasks (keep as is, but maybe filter by updated_at or created_at)
    // We'll keep the 7 days window for tasks as "recent activity", or align to month?
    // Let's keep tasks as "active context" (last 7 days is good for checking immediate backlog)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tasks, error: taskError } = await supabase
        .from('project_tasks')
        .select('*')
        .in('status', ['backlog', 'in_progress', 'approval'])
        .limit(50);

    if (taskError) console.error('Error fetching tasks:', taskError);

    // Fetch WON proposals (Acceptances) from the start of the month
    // We need to join with proposals to get the financial value
    const { data: acceptances, error: acceptanceError } = await supabase
        .from('acceptances')
        .select(`
            *,
            contract_snapshot,
            proposal:proposals (
                monthly_fee,
                setup_fee,
                services
            )
        `)
        .gte('timestamp', startOfMonth)
        .order('timestamp', { ascending: false });

    if (acceptanceError) console.error('Error fetching acceptances:', acceptanceError);

    // Calculate Financials correctly in code
    const wonProposals = acceptances?.map((acc: any) => {
        let monthly = acc.proposal?.monthly_fee || 0;
        let setup = acc.proposal?.setup_fee || 0;
        let services = acc.proposal?.services;

        // Fallback to snapshot if proposal is missing (Legacy or Broken Link)
        if (!acc.proposal && acc.contract_snapshot && acc.contract_snapshot.proposal) {
            monthly = acc.contract_snapshot.proposal.monthly_fee || 0;
            setup = acc.contract_snapshot.proposal.setup_fee || 0;
            services = acc.contract_snapshot.proposal.services;
        }

        const totalValue = monthly + setup;

        return {
            client: acc.company_name,
            service: services ? 'Serviços de Marketing' : 'Contrato', // Simplify or parse services
            value: totalValue,
            formattedValue: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)
        };
    }) || [];

    const totalSalesValue = wonProposals.reduce((sum, item) => sum + item.value, 0);
    const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSalesValue);

    // Fetch recent user activity (users created recently)
    const { data: users, error: userError } = await supabase
        .from('app_users')
        .select('*')
        .gte('created_at', sevenDaysAgo)
        .limit(10);

    if (userError) console.error('Error fetching users:', userError);

    return {
        tasks: tasks || [],
        sales: {
            won: wonProposals,
            totalFormatted: formattedTotal,
            totalNumeric: totalSalesValue
        },
        users: users || [],
        timestamp: now.toISOString(),
    };
}

/**
 * Analyzes the system context using the ai-proxy Edge Function and returns a structured JSON report.
 */
export async function analyzeSystem(): Promise<AgentReport> {
    const context = await fetchSystemContext();

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
            action: 'analyze_system',
            tasks: context.tasks,
            sales: context.sales,
            users: context.users,
        },
    });

    if (error) throw new Error(error.message || 'Falha ao gerar relatório.');

    return {
        ...data,
        timestamp: new Date().toISOString(),
    };
}

export interface AiFeedback {
    id: number;
    user_email: string;
    message: string;
    is_read: boolean;
    created_at: string;
    read_at: string | null;
}

/**
 * Fetches the latest unread feedback for a user.
 */
export async function getLatestFeedback(userEmail: string): Promise<AiFeedback | null> {
    const { data, error } = await supabase
        .from('ai_feedback')
        .select('*')
        .eq('user_email', userEmail)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching feedback:', error);
        return null;
    }

    return data && data.length > 0 ? data[0] : null;
}

/**
 * Marks a feedback message as read.
 */
export async function markFeedbackRead(id: number): Promise<void> {
    const { error } = await supabase
        .from('ai_feedback')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        console.error('Error marking feedback as read:', error);
        throw error;
    }
}

/**
 * Generates new feedback for a user based on their tasks and performance.
 */
export async function generateUserFeedback(userEmail: string, userName: string): Promise<AiFeedback> {
    const { activeTasks, approvalTasks, overdueTasks, highPriority } = await getUserTaskStats(userName);

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
            action: 'generate_user_feedback',
            userName,
            activeTasks: activeTasks.length,
            approvalTasks: approvalTasks.length,
            overdueTasks: overdueTasks.length,
            highPriority: highPriority.length,
        },
    });

    if (error) throw new Error(error.message || 'Falha ao gerar feedback.');

    const { data: insertData, error: insertError } = await supabase
        .from('ai_feedback')
        .insert({
            user_email: userEmail,
            message: data.message,
            is_read: false,
        })
        .select()
        .single();

    if (insertError) throw insertError;

    return insertData;
}

// Helper to get stats (shared)
async function getUserTaskStats(userName: string) {
    const normalizeString = (str: string | undefined | null) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };

    const { data: tasksData } = await supabase
        .from('project_tasks')
        .select('*')
        .neq('status', 'done')
        .order('due_date', { ascending: true });

    let userTasks: any[] = [];

    if (tasksData) {
        const targetName = normalizeString(userName);
        userTasks = tasksData.filter((t: any) => {
            const assigneeName = normalizeString(t.assignee);
            if (!assigneeName || !targetName) return false;
            return assigneeName === targetName ||
                assigneeName.includes(targetName) ||
                targetName.includes(assigneeName);
        });
    }

    const activeTasks = userTasks.filter(t => ['backlog', 'in_progress'].includes(t.status));
    const approvalTasks = userTasks.filter(t => t.status === 'approval');

    // Normalize "today" to start of day local
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Helper for local date parsing
    const parseDate = (d: string) => {
        if (!d) return new Date(0); // far past
        const clean = d.split('T')[0];
        const [y, m, day] = clean.split('-').map(Number);
        return new Date(y, m - 1, day);
    };

    const overdueTasks = activeTasks.filter(t => t.due_date && parseDate(t.due_date) < today);
    const highPriority = activeTasks.filter(t => t.priority === 'high');

    return { activeTasks, approvalTasks, overdueTasks, highPriority };
}

export interface SmartFeedback {
    feedback: AiFeedback | null;
    isPersistent: boolean;
}

// How long before a feedback message is considered stale and needs regeneration (ms)
const FEEDBACK_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Returns true if the feedback message was generated before the overdue condition
 * existed, or is simply older than FEEDBACK_STALE_MS.
 */
function isFeedbackStale(feedback: AiFeedback | undefined): boolean {
    if (!feedback) return true;
    return Date.now() - new Date(feedback.created_at).getTime() > FEEDBACK_STALE_MS;
}

/**
 * Gets feedback intelligently:
 * - Overdue tasks → always show latest; regenerate if stale (> 6 h) so message reflects real state.
 * - No overdue tasks → show latest UNREAD; generate positive reinforcement if none.
 */
export async function getSmartUserFeedback(userEmail: string, userName: string): Promise<SmartFeedback> {
    const { overdueTasks, activeTasks } = await getUserTaskStats(userName);
    const hasOverdue = overdueTasks.length > 0;

    // 1. Fetch latest feedback (read or unread)
    const { data: latestAny, error } = await supabase
        .from('ai_feedback')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) throw error;

    const latest = latestAny?.[0] as AiFeedback | undefined;

    // 2. Logic
    if (hasOverdue) {
        // If feedback is stale (older than 6 h or missing), regenerate so the
        // message reflects the CURRENT overdue state — not a past "all clear" message.
        if (isFeedbackStale(latest)) {
            const newFeedback = await generateUserFeedback(userEmail, userName);
            return { feedback: newFeedback, isPersistent: true };
        }
        return { feedback: latest!, isPersistent: true };
    } else {
        // No overdue tasks.
        if (latest && !latest.is_read) {
            // Has unread feedback → show it
            return { feedback: latest, isPersistent: false };
        }

        // All messages read and no overdue: generate positive reinforcement
        // only if we haven't already done so in the last 6 h.
        if (isFeedbackStale(latest)) {
            const newFeedback = await generateUserFeedback(userEmail, userName);
            return { feedback: newFeedback, isPersistent: false };
        }

        return { feedback: latest ?? null, isPersistent: false };
    }
}
