-- Mail-Benachrichtigung bei neuem Lead, mit konfigurierbaren Empfängern (Einstellungen
-- -> Automatisierung). Wer benachrichtigt wird, wird agenturweit als kleine Liste von
-- Team-Mitgliedern gepflegt - gleiches Agentur-Scoping-Muster wie bei email_templates
-- (20260922000004), inkl. explizitem current_user_is_staff()-Check von Anfang an
-- (siehe 20260923000000_harden_own_agency_policies_client_role_check.sql) statt es wie
-- bei den älteren Tabellen nachzuholen.
create table public.lead_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agency_id, profile_id)
);

alter table public.lead_notification_recipients enable row level security;

create policy "Team verwaltet Lead-Benachrichtigungs-Empfänger der eigenen Agentur"
on public.lead_notification_recipients
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

grant select, insert, update, delete on public.lead_notification_recipients to authenticated, service_role;

-- Startwert: Christina Hohler vorausgewählt (änderbar über Einstellungen ->
-- Automatisierung). Per Name statt hartcodierter UUID nachgeschlagen, damit die
-- Migration nicht von einer möglicherweise falsch erinnerten ID abhängt.
insert into public.lead_notification_recipients (agency_id, profile_id)
select agency_id, id from public.profiles
where full_name = 'Christina Hohler'
  and role in ('agency_admin', 'agency_member')
  and agency_id is not null
on conflict (agency_id, profile_id) do nothing;

NOTIFY pgrst, 'reload schema';
