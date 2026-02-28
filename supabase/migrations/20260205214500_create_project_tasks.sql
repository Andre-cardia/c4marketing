create table if not exists project_tasks (
  id uuid default gen_random_uuid() primary key,
  project_id bigint references acceptances(id) on delete cascade not null,
  title text not null,
  description text,
  status text check (status in ('backlog', 'in_progress', 'approval', 'done', 'paused')) default 'backlog',
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  assignee text,
  due_date timestamptz,
  created_at timestamptz default now()
);
-- Add index for performance
create index if not exists idx_project_tasks_project_id on project_tasks(project_id);
create index if not exists idx_project_tasks_status on project_tasks(status);
-- Enable RLS (Optional, but good practice. Assuming public access for simplicity based on existing repo, or standard policies)
alter table project_tasks enable row level security;
create policy "Enable all access for authenticated users" on project_tasks
  for all using (true) with check (true);
