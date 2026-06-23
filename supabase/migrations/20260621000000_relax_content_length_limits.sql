drop policy if exists "class ideas can be created" on public.class_ideas;
drop policy if exists "class ideas can be updated" on public.class_ideas;
drop policy if exists "class events can be created" on public.class_idea_events;

create policy "class ideas can be created"
  on public.class_ideas
  for insert
  with check (
    char_length(room_id) between 1 and 80
    and char_length(author) between 1 and 40
    and char_length(title) between 1 and 120
    and char_length(content) >= 1
  );

create policy "class ideas can be updated"
  on public.class_ideas
  for update
  using (true)
  with check (
    char_length(author) between 1 and 40
    and char_length(title) between 1 and 120
    and char_length(content) >= 1
  );

create policy "class events can be created"
  on public.class_idea_events
  for insert
  with check (
    char_length(room_id) between 1 and 80
    and char_length(author) between 1 and 40
    and char_length(content) >= 1
  );
