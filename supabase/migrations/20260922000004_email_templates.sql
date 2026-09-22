-- Agenturweite E-Mail-Vorlagen (Einstellungen -> "E-Mail-Vorlagen"), zusaetzlich zu den 4
-- fest einprogrammierten Standard-Vorlagen im Automatisierungs-Editor nutzbar. Nicht
-- campaign-gebunden - eine Vorlage gehoert der Agentur, nicht einer einzelnen Kampagne.
--
-- Exakt das gleiche Agentur-Scoping-Muster wie bei clients (direkte agency_id-Spalte,
-- siehe 20260907000000_fix_open_rls_policies.sql). GRANT bewusst in derselben Migration
-- wie die RLS-Policy, nicht als Nachzuegler - das fehlende GRANT ist in diesem Projekt
-- schon mehrfach als eigener Bug aufgetreten (siehe 20260909000001_fix_medium_low_rls_findings.sql
-- Abschnitt 4 und 20260922000002_fix_automation_engine_permissions.sql).
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body_html text not null default '',
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

create policy "Team verwaltet Email-Vorlagen der eigenen Agentur"
on public.email_templates
for all
to authenticated
using (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
)
with check (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
);

grant select, insert, update, delete on public.email_templates to authenticated, service_role;

NOTIFY pgrst, 'reload schema';
