create table public.pacepal_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pacepal_states enable row level security;

revoke all on table public.pacepal_states from anon, authenticated;
grant select, insert, update, delete on table public.pacepal_states to authenticated;

create policy "Users can read their own PacePal state"
on public.pacepal_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own PacePal state"
on public.pacepal_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own PacePal state"
on public.pacepal_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own PacePal state"
on public.pacepal_states
for delete
to authenticated
using ((select auth.uid()) = user_id);
