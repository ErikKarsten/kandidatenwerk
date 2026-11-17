-- Paket 106 (17.11.2026): Zustellprobleme von Mails erkennen (Fehlermeldung 05.11.: Kanzlei
-- bekam die Mail "Neuer Kandidat für Sie" nicht - Brevo hatte sie verschickt, der
-- Mailserver der Kanzlei hat sie abgelehnt, weil Brevos Versandserver auf einer
-- Spam-Sperrliste stand. Kandidatenwerk hielt sie für zugestellt.)
--
-- mail_versand: jede über Brevo verschickte Mail (Message-ID, Empfänger, Betreff,
--   Absendername, Antwortadresse), damit eine abgewiesene Mail erneut verschickt werden kann.
-- mail_zustellprobleme: abgewiesene Mails laut Brevo und was Kandidatenwerk damit gemacht
--   hat (einmal erneut verschickt oder gemeldet).
-- Nur der Server (Service-Rolle) liest und schreibt; RLS an, keine Policies.

create table if not exists public.mail_versand (
  message_id text primary key,
  recipients text[] not null,
  subject text not null,
  sender_name text,
  reply_to jsonb,
  retry_of text,
  created_at timestamptz not null default now()
);
create index if not exists mail_versand_created_at_idx on public.mail_versand (created_at);
alter table public.mail_versand enable row level security;

create table if not exists public.mail_zustellprobleme (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  email text not null,
  event text not null check (event in ('softBounces', 'hardBounces', 'blocked')),
  reason text,
  occurred_at timestamptz not null,
  handling text not null check (handling in ('erneut_gesendet', 'gemeldet')),
  retry_message_id text,
  created_at timestamptz not null default now(),
  unique (message_id, email, event)
);
create index if not exists mail_zustellprobleme_created_at_idx on public.mail_zustellprobleme (created_at);
alter table public.mail_zustellprobleme enable row level security;

NOTIFY pgrst, 'reload schema';
