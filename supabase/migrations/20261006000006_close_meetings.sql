-- Paket 17 (06.10.2026), T-54: Gespräche aus Close beim Kunden.
-- Close meldet per Webhook Besprechungen (Meeting-Aktivitäten) mit Notetaker-Zusammenfassung.
-- Sie werden hier vorgemerkt und vom Cronjob close-meetings mit Claude knapp
-- zusammengefasst; das Ergebnis landet als Kommentar "Gespräch" im Projekt des Kunden.
create table if not exists public.close_meeting_summaries (
  close_activity_id text primary key,
  lead_id text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text,
  starts_at timestamptz,
  user_name text,
  attendees text,
  raw_summary text not null,
  status text not null default 'offen' check (status in ('offen', 'erledigt', 'fehler')),
  attempts integer not null default 0,
  error text,
  comment_id uuid references public.client_comments(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists close_meeting_summaries_open_idx on public.close_meeting_summaries (status) where status = 'offen';

-- Nur serverseitig (Webhook, Cronjob) - keine Policies für angemeldete Nutzer.
alter table public.close_meeting_summaries enable row level security;
grant select, insert, update, delete on public.close_meeting_summaries to service_role;

-- Neue Kommentar-Art "Gespräch".
alter table public.client_comments drop constraint if exists client_comments_kind_check;
alter table public.client_comments add constraint client_comments_kind_check
  check (kind in ('notiz', 'termin', 'telefonat', 'email', 'gespraech', 'system'));

notify pgrst, 'reload schema';
