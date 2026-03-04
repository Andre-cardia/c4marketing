create table if not exists task_history (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references project_tasks(id) on delete set null,
  project_id bigint references acceptances(id) on delete cascade not null,
  action text not null, -- 'created', 'status_change', 'updated', 'deleted'
  old_status text,
  new_status text,
  changed_by text,
  changed_at timestamptz default now(),
  details jsonb
);
create index if not exists idx_task_history_task_id on task_history(task_id);
create index if not exists idx_task_history_project_id on task_history(project_id);
alter table task_history enable row level security;
create policy "Enable all access for authenticated users" on task_history
  for all using (true) with check (true);
