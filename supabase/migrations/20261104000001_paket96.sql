-- Paket 96: Matching-Übersicht. Vorqualifizierte Kandidaten, die zu einer Live-Kampagne im
-- Umkreis passen (gleiches Berufsbild) und dieser Kanzlei noch nie zugeordnet waren.
-- Der stündliche Cronjob /api/cron/matching gleicht die Liste ab, Mo + Do um 8 Uhr geht eine
-- Sammel-Mail mit den neuen Vorschlägen an die Empfänger aus Einstellungen -> Automatisierung.
--
-- Bewusst eigene Tabelle statt candidate_campaign_matches: deren Anzahl wird als
-- "passende Kandidaten" an Kanzleistelle24 übertragen und soll sich nicht ändern.

-- 1) Vorschläge Kandidat -> Kampagne. Offen = dismissed_at ist leer. "Nicht vorschlagen"
--    bleibt dauerhaft stehen, damit der Kandidat bei dieser Kampagne nicht wieder auftaucht.
create table public.matching_suggestions (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  distance_km numeric,
  first_seen_at timestamptz not null default now(),
  -- In einer Sammel-Mail enthalten (leer = gilt in der Übersicht als "neu").
  notified_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  dismiss_reason text,
  primary key (candidate_id, campaign_id)
);

create index matching_suggestions_campaign_id_idx on public.matching_suggestions (campaign_id);

alter table public.matching_suggestions enable row level security;

create policy "Team verwaltet Matching-Vorschläge"
on public.matching_suggestions
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

grant select, insert, update, delete on public.matching_suggestions to authenticated, service_role;

-- 2) Empfänger der Sammel-Mail - gleiches Muster wie lead_notification_recipients.
create table public.matching_mail_recipients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agency_id, profile_id)
);

alter table public.matching_mail_recipients enable row level security;

create policy "Team verwaltet Matching-Mail-Empfänger der eigenen Agentur"
on public.matching_mail_recipients
for all
to authenticated
using (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
)
with check (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
);

grant select, insert, update, delete on public.matching_mail_recipients to authenticated, service_role;

-- Startwert (Entscheidung vom 04.11.2026): Steffen Neubert und Elea Günther.
insert into public.matching_mail_recipients (agency_id, profile_id)
select agency_id, id from public.profiles
where full_name in ('Steffen Neubert', 'Elea Günther')
  and role in ('agency_admin', 'agency_member')
  and agency_id is not null
on conflict (agency_id, profile_id) do nothing;

NOTIFY pgrst, 'reload schema';
