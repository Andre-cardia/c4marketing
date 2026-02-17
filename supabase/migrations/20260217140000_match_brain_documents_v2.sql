-- Migration: match_brain_documents_v2
-- Description: Updates the retrieval function to support complex JSONB filters (allowlist, blocklist, time window, etc.)
-- Date: 2026-02-17

create or replace function match_brain_documents(
  query_embedding vector(1536),
  match_count int,
  filters jsonb
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  with params as (
    select
      (filters->>'tenant_id')::uuid as tenant_id,
      filters->'type_allowlist' as type_allowlist,
      filters->'type_blocklist' as type_blocklist,
      filters->>'artifact_kind' as artifact_kind,
      filters->'source_table' as source_table,
      filters->>'client_id' as client_id,
      filters->>'project_id' as project_id,
      filters->>'source_id' as source_id,
      coalesce(filters->>'status','active') as status,
      nullif(filters->>'time_window_minutes','')::int as time_window_minutes
  )
  select
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from brain.documents d
  cross join params p
  where
    -- tenant isolation (adjust to your metadata storage if needed, assuming metadata->>'tenant_id' exists)
    -- If tenant_id is NOT in metadata, comment this line or adjust schema.
    -- (d.metadata->>'tenant_id')::uuid = p.tenant_id

    -- status (optional match)
    (p.status is null or d.metadata->>'status' = p.status)

    -- artifact kind
    and (p.artifact_kind is null or d.metadata->>'artifact_kind' = p.artifact_kind)

    -- source_id exact filter
    and (p.source_id is null or d.metadata->>'source_id' = p.source_id)

    -- client/project filters
    and (p.client_id is null or d.metadata->>'client_id' = p.client_id)
    and (p.project_id is null or d.metadata->>'project_id' = p.project_id)

    -- source_table can be string or array
    and (
      p.source_table is null
      or (
        jsonb_typeof(p.source_table) = 'string'
        and d.metadata->>'source_table' = trim(both '"' from p.source_table::text)
      )
      or (
        jsonb_typeof(p.source_table) = 'array'
        and (d.metadata->>'source_table') = any (
          select jsonb_array_elements_text(p.source_table)
        )
      )
    )

    -- allowlist (if present)
    and (
      p.type_allowlist is null
      or jsonb_typeof(p.type_allowlist) <> 'array'
      or (d.metadata->>'type') = any (
        select jsonb_array_elements_text(p.type_allowlist)
      )
    )

    -- blocklist (if present)
    and not (
      p.type_blocklist is not null
      and jsonb_typeof(p.type_blocklist) = 'array'
      and (d.metadata->>'type') = any (
        select jsonb_array_elements_text(p.type_blocklist)
      )
    )

    -- time window (only when set)
    and (
      p.time_window_minutes is null
      or d.created_at >= now() - make_interval(mins => p.time_window_minutes)
    )
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
