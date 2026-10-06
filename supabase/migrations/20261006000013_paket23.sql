-- Paket 23 (06.10.2026)
--
-- T-93/T-94: Einstellungen je Agentur - zentrale Eingangsbestätigung an Kandidaten
-- (Vorlage, ein/aus, gilt ab dem Einschalten) und Logo für alle Mails.
create table if not exists public.agency_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  logo_url text,
  confirmation_active boolean not null default false,
  confirmation_template_id uuid references public.automation_templates(id) on delete set null,
  confirmation_active_since timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.agency_settings enable row level security;
create policy "Team liest Agentur-Einstellungen" on public.agency_settings for select to authenticated
  using (public.current_user_is_staff() and agency_id = public.current_user_agency_id());
create policy "Admins pflegen Agentur-Einstellungen" on public.agency_settings for all to authenticated
  using (public.current_user_is_agency_admin() and agency_id = public.current_user_agency_id())
  with check (public.current_user_is_agency_admin() and agency_id = public.current_user_agency_id());
grant select, insert, update on public.agency_settings to authenticated;
grant select, insert, update, delete on public.agency_settings to service_role;
insert into public.agency_settings (agency_id) select id from public.agencies on conflict do nothing;

-- Je Kandidat und Art nur eine zentrale Mail (z.B. Eingangsbestätigung); wird VOR dem
-- Versand geschrieben, damit Webhook und Cronjob nicht doppelt senden.
create table if not exists public.candidate_mail_runs (
  kind text not null,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, candidate_id)
);
alter table public.candidate_mail_runs enable row level security;
grant select, insert, delete on public.candidate_mail_runs to service_role;

-- Die Eingangsbestätigung läuft jetzt zentral - nicht mehr über das Standard-Set der
-- Kampagnen (sonst bekämen Kandidaten sie doppelt).
delete from public.automation_template_set_items i
using public.automation_templates t
where t.id = i.template_id and t.name = 'Eingangsbestätigung';

-- T-95: Ansprechpartner sind Portal-Zugänge. Wann die Einladung verschickt wurde
-- (still angelegte Zugänge haben noch keine).
alter table public.profiles add column if not exists portal_invited_at timestamptz;
update public.profiles set portal_invited_at = created_at where role = 'client' and portal_invited_at is null;

notify pgrst, 'reload schema';
