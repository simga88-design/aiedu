create table if not exists public.class_idea_likes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.class_ideas(id) on delete cascade,
  room_id text not null,
  author text not null default '익명',
  client_id text not null,
  created_at timestamptz not null default now(),
  unique (idea_id, client_id)
);

create table if not exists public.class_idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.class_ideas(id) on delete cascade,
  room_id text not null,
  author text not null default '익명',
  client_id text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists class_idea_likes_room_created_idx
  on public.class_idea_likes (room_id, created_at desc);

create index if not exists class_idea_likes_idea_idx
  on public.class_idea_likes (idea_id);

create index if not exists class_idea_comments_room_created_idx
  on public.class_idea_comments (room_id, created_at desc);

create index if not exists class_idea_comments_idea_created_idx
  on public.class_idea_comments (idea_id, created_at desc);

alter table public.class_idea_likes enable row level security;
alter table public.class_idea_comments enable row level security;

drop policy if exists "class likes are readable" on public.class_idea_likes;
drop policy if exists "class likes can be created" on public.class_idea_likes;
drop policy if exists "class likes can be deleted" on public.class_idea_likes;
drop policy if exists "class comments are readable" on public.class_idea_comments;
drop policy if exists "class comments can be created" on public.class_idea_comments;

create policy "class likes are readable"
  on public.class_idea_likes
  for select
  using (true);

create policy "class likes can be created"
  on public.class_idea_likes
  for insert
  with check (
    char_length(room_id) between 1 and 80
    and char_length(author) between 1 and 40
    and char_length(client_id) between 1 and 80
  );

create policy "class likes can be deleted"
  on public.class_idea_likes
  for delete
  using (true);

create policy "class comments are readable"
  on public.class_idea_comments
  for select
  using (true);

create policy "class comments can be created"
  on public.class_idea_comments
  for insert
  with check (
    char_length(room_id) between 1 and 80
    and char_length(author) between 1 and 40
    and char_length(client_id) between 1 and 80
    and char_length(content) between 1 and 700
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_idea_likes'
  ) then
    alter publication supabase_realtime add table public.class_idea_likes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_idea_comments'
  ) then
    alter publication supabase_realtime add table public.class_idea_comments;
  end if;
end
$$;
