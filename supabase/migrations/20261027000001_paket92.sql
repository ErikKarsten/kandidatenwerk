-- Paket 92: Anrufen über sipgate neo. Click-to-Call aus Kandidatenwerk, Anrufe kommen über
-- die sipgate.io-Push-API zurück und landen im Verlauf des Kandidaten.

-- 1) sipgate-Zuordnung je Teammitglied (automatisch über die E-Mail, Gerät wählbar).
alter table public.profiles
  add column if not exists sipgate_user_id text,
  add column if not exists sipgate_device_id text;

-- 2) Telefonnummer der Kandidaten in einheitlicher Form (nur Ziffern, international ohne +,
--    z. B. 4915111030580) - so findet ein Anruf den Kandidaten. Muss zu normalizePhone()
--    in src/lib/phone.ts passen.
alter table public.candidates
  add column if not exists phone_normalized text generated always as (
    case
      when phone is null or regexp_replace(regexp_replace(phone, '\(0\)', '', 'g'), '\D', '', 'g') = '' then null
      when regexp_replace(regexp_replace(phone, '\(0\)', '', 'g'), '\D', '', 'g') like '00%'
        then substr(regexp_replace(regexp_replace(phone, '\(0\)', '', 'g'), '\D', '', 'g'), 3)
      when regexp_replace(regexp_replace(phone, '\(0\)', '', 'g'), '\D', '', 'g') like '0%'
        then '49' || substr(regexp_replace(regexp_replace(phone, '\(0\)', '', 'g'), '\D', '', 'g'), 2)
      else regexp_replace(regexp_replace(phone, '\(0\)', '', 'g'), '\D', '', 'g')
    end
  ) stored;
create index if not exists candidates_phone_normalized_idx on public.candidates (phone_normalized);

-- 3) Anrufe (nur Service-Role, wie campaign_automation_runs): Zuordnung der Push-Ereignisse
--    (newCall, answer, hangup) zum Kandidaten und zum Teammitglied.
create table if not exists public.candidate_calls (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidates(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  direction text not null check (direction in ('out', 'in')),
  number text not null,
  call_sid text,
  sipgate_call_id text unique,
  status text not null default 'gestartet' check (status in ('gestartet', 'klingelt', 'verbunden', 'beendet', 'fehler')),
  cause text,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer
);
create index if not exists candidate_calls_number_idx on public.candidate_calls (number, started_at desc);
create index if not exists candidate_calls_candidate_idx on public.candidate_calls (candidate_id, started_at desc);
alter table public.candidate_calls enable row level security;

-- 4) Verlaufseinträge vom Typ "call".
alter table public.candidate_history drop constraint if exists candidate_history_type_check;
alter table public.candidate_history add constraint candidate_history_type_check
  check (type = any (array['note', 'status_change', 'automation', 'email', 'call']));

NOTIFY pgrst, 'reload schema';
