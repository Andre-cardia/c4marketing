
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTasks() {
    console.log('Checking ALL tasks...');

    const { data: allTasks, error } = await supabase
        .from('project_tasks')
        .select('*');

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    if (!allTasks || allTasks.length === 0) {
        console.log('No tasks found in project_tasks table.');
        return;
    }

    const statuses = new Set(allTasks.map(t => t.status));
    const assignees = new Set(allTasks.map(t => t.assignee));

    console.log('Available Statuses:', Array.from(statuses));
    console.log('Available Assignees:', Array.from(assignees));

    allTasks.forEach(t => {
        console.log(`
        ID: ${t.id}
        Title: ${t.title}
        Status: ${t.status}
        Assignee: ${t.assignee}
        Due: ${t.due_date}
        -------------------`);
    });
}

checkTasks();
