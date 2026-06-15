create extension if not exists pgcrypto;

create table if not exists public.class_ideas (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  author text not null default '익명',
  title text not null,
  content text not null,
  stage text not null default 'raw' check (stage in ('raw', 'building', 'tested')),
  parent_id uuid references public.class_ideas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_idea_events (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.class_ideas(id) on delete cascade,
  room_id text not null,
  author text not null default '익명',
  action text not null check (action in ('created', 'branched', 'revised', 'tested')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists class_ideas_room_updated_idx
  on public.class_ideas (room_id, updated_at desc);

create index if not exists class_ideas_parent_idx
  on public.class_ideas (parent_id);

create index if not exists class_idea_events_room_created_idx
  on public.class_idea_events (room_id, created_at desc);

alter table public.class_ideas enable row level security;
alter table public.class_idea_events enable row level security;

drop policy if exists "class ideas are readable" on public.class_ideas;
drop policy if exists "class ideas can be created" on public.class_ideas;
drop policy if exists "class ideas can be updated" on public.class_ideas;
drop policy if exists "class events are readable" on public.class_idea_events;
drop policy if exists "class events can be created" on public.class_idea_events;

create policy "class ideas are readable"
  on public.class_ideas
  for select
  using (true);

create policy "class ideas can be created"
  on public.class_ideas
  for insert
  with check (
    char_length(room_id) between 1 and 80
    and char_length(author) between 1 and 40
    and char_length(title) between 1 and 120
    and char_length(content) between 1 and 600
  );

create policy "class ideas can be updated"
  on public.class_ideas
  for update
  using (true)
  with check (
    char_length(author) between 1 and 40
    and char_length(title) between 1 and 120
    and char_length(content) between 1 and 600
  );

create policy "class events are readable"
  on public.class_idea_events
  for select
  using (true);

create policy "class events can be created"
  on public.class_idea_events
  for insert
  with check (
    char_length(room_id) between 1 and 80
    and char_length(author) between 1 and 40
    and char_length(content) between 1 and 700
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_ideas'
  ) then
    alter publication supabase_realtime add table public.class_ideas;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_idea_events'
  ) then
    alter publication supabase_realtime add table public.class_idea_events;
  end if;
end
$$;
