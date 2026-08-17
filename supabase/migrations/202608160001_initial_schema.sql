create extension if not exists pgcrypto with schema extensions;

create type public.post_status as enum ('draft', 'needs_changes', 'ready_for_review', 'approved', 'posted');
create type public.post_platform as enum ('linkedin', 'other');
create type public.document_kind as enum ('post', 'daily_bundle', 'strategy', 'idea', 'template', 'wrapper', 'source', 'published', 'other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  can_approve boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  relative_path text not null unique check (relative_path !~ '(^/|(^|/)\.\.(/|$))'),
  kind public.document_kind not null default 'other',
  title text not null,
  excerpt text not null default '',
  content_text text not null default '',
  source_hash text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  modified_at timestamptz,
  indexed_at timestamptz not null default now(),
  deleted_at timestamptz,
  search_vector tsvector generated always as
    (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(relative_path, '') || ' ' || coalesce(content_text, ''))) stored
);

create table public.posts (
  id uuid primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  source_path text not null,
  source_locator text not null default 'document',
  source_hash text not null,
  title text not null,
  platform public.post_platform not null default 'linkedin',
  status public.post_status not null default 'draft',
  content text not null default '',
  post_type text not null default 'original',
  source_url text,
  target_date date,
  recommended_time text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  approved_content_hash text,
  published_at timestamptz,
  live_url text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_path, source_locator),
  constraint approval_complete check (
    (approved_at is null and approved_by is null and approved_content_hash is null)
    or (approved_at is not null and approved_by is not null and approved_content_hash is not null)
  ),
  constraint posted_complete check (status <> 'posted' or (published_at is not null and approved_at is not null))
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  relative_path text not null unique check (relative_path !~ '(^/|(^|/)\.\.(/|$))'),
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sort_order integer not null default 0,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 10000),
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_activity (
  id bigint generated always as identity primary key,
  post_id uuid references public.posts(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  changes jsonb not null default '{}'::jsonb,
  source_revision text,
  created_at timestamptz not null default now()
);

create table public.sync_state (
  id boolean primary key default true check (id),
  status text not null default 'idle' check (status in ('idle', 'scanning', 'stale', 'error')),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  summary jsonb not null default '{}'::jsonb
);
insert into public.sync_state (id) values (true);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  content_hash text not null,
  platform public.post_platform not null,
  published_at timestamptz not null,
  live_url text,
  ledger_path text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index documents_search_idx on public.documents using gin(search_vector);
create index documents_kind_idx on public.documents(kind) where deleted_at is null;
create index posts_filters_idx on public.posts(status, platform, target_date, updated_at desc);
create index posts_source_idx on public.posts(source_path);
create index comments_post_idx on public.post_comments(post_id, created_at);
create index activity_post_idx on public.post_activity(post_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger comments_updated_at before update on public.post_comments for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.can_current_user_approve()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select can_approve from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_activity enable row level security;
alter table public.sync_state enable row level security;
alter table public.publications enable row level security;

create policy "members read profiles" on public.profiles for select using (public.is_workspace_member());
create policy "members read documents" on public.documents for select using (public.is_workspace_member());
create policy "members read posts" on public.posts for select using (public.is_workspace_member());
create policy "members read media" on public.post_media for select using (public.is_workspace_member());
create policy "members read comments" on public.post_comments for select using (public.is_workspace_member());
create policy "members create comments" on public.post_comments for insert with check (public.is_workspace_member() and author_id = auth.uid());
create policy "authors edit comments" on public.post_comments for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "members read activity" on public.post_activity for select using (public.is_workspace_member());
create policy "members add activity" on public.post_activity for insert with check (public.is_workspace_member() and actor_id = auth.uid());
create policy "members read sync" on public.sync_state for select using (public.is_workspace_member());
create policy "members read publications" on public.publications for select using (public.is_workspace_member());

revoke update, delete on public.post_activity from authenticated;
revoke insert, update, delete on public.documents, public.posts, public.post_media, public.sync_state, public.publications from authenticated;
grant execute on function public.is_workspace_member() to authenticated;
grant execute on function public.can_current_user_approve() to authenticated;
