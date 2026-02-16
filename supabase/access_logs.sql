-- Create table for tracking user access
create table if not exists access_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  user_email text, -- Cached for easier display if needed
  accessed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table access_logs enable row level security;

-- Policy: Users can insert their own logs
create policy "Users can insert their own access logs"
  on access_logs for insert
  with check (auth.uid() = user_id);

-- Policy: Gestors/Admins can view all logs (assuming raw app_users check or broad read for now)
-- Adjust based on your specific role system. For simplicity allowing read for authenticated for this demo feature.
create policy "Authenticated users can read access logs"
  on access_logs for select
  using (auth.role() = 'authenticated');
