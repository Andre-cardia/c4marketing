-- Migration: ETL Setup for Brain Sync
-- 1. Create Sync Queue Table
create table if not exists brain.sync_queue (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz default now(),
  processed_at timestamptz,
  error_message text
);
create index if not exists idx_brain_sync_queue_status on brain.sync_queue(status) where status = 'pending';
-- 2. Trigger Function
create or replace function brain.handle_project_change()
returns trigger
language plpgsql
security definer
as $$
declare
  target_id uuid;
  target_table text;
begin
  -- Logic to map current change to a Parent Project ID
  
  -- Case: Directly modifying a Project Table
  if TG_TABLE_NAME = 'website_projects' then
    target_table := 'website_projects';
    target_id := COALESCE(NEW.id, OLD.id);
  elsif TG_TABLE_NAME = 'landing_page_projects' then
    target_table := 'landing_page_projects';
    target_id := COALESCE(NEW.id, OLD.id);
  elsif TG_TABLE_NAME = 'traffic_projects' then
    target_table := 'traffic_projects';
    target_id := COALESCE(NEW.id, OLD.id);
    
  -- Case: Modifying a Child Table (bubbling up)
  elsif TG_TABLE_NAME = 'websites' then
    target_table := 'website_projects';
    target_id := COALESCE(NEW.website_project_id, OLD.website_project_id);
  elsif TG_TABLE_NAME = 'landing_pages' then
    target_table := 'landing_page_projects';
    target_id := COALESCE(NEW.landing_page_project_id, OLD.landing_page_project_id);
  elsif TG_TABLE_NAME = 'traffic_campaigns' then
    target_table := 'traffic_projects';
    target_id := COALESCE(NEW.traffic_project_id, OLD.traffic_project_id);
  end if;

  -- Insert into Queue
  if target_id is not null then
    insert into brain.sync_queue (source_table, source_id, operation)
    values (target_table, target_id, TG_OP);
  end if;

  return COALESCE(NEW, OLD);
end;
$$;
-- 3. Apply Triggers
-- Website Projects
drop trigger if exists T_brain_sync_website_projects on public.website_projects;
create trigger T_brain_sync_website_projects
after insert or update or delete on public.website_projects
for each row execute function brain.handle_project_change();
drop trigger if exists T_brain_sync_websites on public.websites;
create trigger T_brain_sync_websites
after insert or update or delete on public.websites
for each row execute function brain.handle_project_change();
-- Landing Page Projects
drop trigger if exists T_brain_sync_lp_projects on public.landing_page_projects;
create trigger T_brain_sync_lp_projects
after insert or update or delete on public.landing_page_projects
for each row execute function brain.handle_project_change();
drop trigger if exists T_brain_sync_landing_pages on public.landing_pages;
create trigger T_brain_sync_landing_pages
after insert or update or delete on public.landing_pages
for each row execute function brain.handle_project_change();
-- Traffic Projects
drop trigger if exists T_brain_sync_traffic_projects on public.traffic_projects;
create trigger T_brain_sync_traffic_projects
after insert or update or delete on public.traffic_projects
for each row execute function brain.handle_project_change();
drop trigger if exists T_brain_sync_traffic_campaigns on public.traffic_campaigns;
create trigger T_brain_sync_traffic_campaigns
after insert or update or delete on public.traffic_campaigns
for each row execute function brain.handle_project_change();
