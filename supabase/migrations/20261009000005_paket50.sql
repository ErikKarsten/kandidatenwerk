-- Paket 50: Kommentare beim Kunden mit Antworten (eine Ebene) und Reaktionen.
alter table public.client_comments
  add column if not exists parent_id uuid references public.client_comments(id) on delete cascade;
create index if not exists client_comments_parent_idx on public.client_comments (parent_id);

create table if not exists public.client_comment_reactions (
  comment_id uuid not null references public.client_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

alter table public.client_comment_reactions enable row level security;
drop policy if exists "Team liest Reaktionen" on public.client_comment_reactions;
create policy "Team liest Reaktionen" on public.client_comment_reactions for select to authenticated
  using ((select public.current_user_is_staff()));
drop policy if exists "Team reagiert selbst" on public.client_comment_reactions;
create policy "Team reagiert selbst" on public.client_comment_reactions for insert to authenticated
  with check ((select public.current_user_is_staff()) and user_id = (select auth.uid()));
drop policy if exists "Team nimmt eigene Reaktion zurück" on public.client_comment_reactions;
create policy "Team nimmt eigene Reaktion zurück" on public.client_comment_reactions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.client_comment_reactions to authenticated;
grant all on public.client_comment_reactions to service_role;
