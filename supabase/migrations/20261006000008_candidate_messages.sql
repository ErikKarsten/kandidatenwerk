-- Paket 18 (06.10.2026), T-84: Reiter "Kommunikation" beim Kandidaten.
-- Jede E-Mail, die das Team aus dem Kandidatenprofil an den Kandidaten schickt, wird hier
-- festgehalten (später auch WhatsApp, siehe Atlas T-85). Absender ist
-- info@kanzleistelle24.de mit dem Namen des Mitarbeiters, Antworten gehen an ihn.
create table if not exists public.candidate_messages (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  to_address text not null,
  subject text,
  body text not null,
  sent_by uuid references public.profiles(id) on delete set null,
  reply_to text,
  status text not null default 'gesendet' check (status in ('gesendet', 'fehler')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists candidate_messages_candidate_idx on public.candidate_messages (candidate_id, created_at desc);

alter table public.candidate_messages enable row level security;
create policy "Team verwaltet Kandidaten-Nachrichten"
on public.candidate_messages for all to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());
grant select, insert, update, delete on public.candidate_messages to authenticated, service_role;

notify pgrst, 'reload schema';
