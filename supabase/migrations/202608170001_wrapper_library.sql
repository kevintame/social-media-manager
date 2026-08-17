create table public.wrappers (
  media_hash text primary key check (length(media_hash) = 64),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  slug text not null unique,
  title text not null,
  format text not null,
  source_creator text,
  source_brand text,
  featured_person text,
  platform text not null,
  original_filename text,
  media_relative_path text not null unique check (media_relative_path !~ '(^/|(^|/)\.\.(/|$))'),
  media_file_name text not null,
  media_mime_type text not null,
  media_size_bytes bigint not null check (media_size_bytes >= 0),
  created_on date,
  tags text[] not null default '{}',
  analysis_markdown text not null,
  takeaway text not null,
  search_text text not null default '',
  search_vector tsvector generated always as (to_tsvector('english', search_text)) stored,
  indexed_at timestamptz not null default now()
);

create index wrappers_search_idx on public.wrappers using gin(search_vector);
create index wrappers_filters_idx on public.wrappers(platform, format, created_on desc);

alter table public.wrappers enable row level security;
create policy "members read wrappers" on public.wrappers for select using (public.is_workspace_member());

grant select on public.wrappers to authenticated;
grant all privileges on public.wrappers to service_role;
