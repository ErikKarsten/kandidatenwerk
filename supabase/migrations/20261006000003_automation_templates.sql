-- Paket 15 (06.10.2026), T-74: Automatisierungs-Vorlagen und Vorlagensets.
--
-- Vorlagen (automation_templates) enthalten eine komplette Automatisierung (Auslöser,
-- Status, Verzögerung, Empfänger, Betreff, Text). Vorlagensets bündeln mehrere Vorlagen;
-- genau ein Set kann Standard sein. In einer Kampagne wird eine Vorlage oder ein Set als
-- Kopie übernommen (campaign_automations.template_id merkt sich die Herkunft). Neue
-- Kampagnen bekommen das Standard-Set automatisch, aber ausgeschaltet.
-- Absender bleibt info@kanzleistelle24.de (Entscheidung 06.10.2026).

create table if not exists public.automation_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  trigger text not null default 'new_lead' check (trigger in ('new_lead', 'status_change')),
  trigger_status text,
  delay_seconds integer not null default 30,
  recipient text not null default 'candidate' check (recipient in ('candidate', 'client', 'all_contacts')),
  subject text not null default '',
  body_html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_template_sets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists automation_template_sets_one_default
  on public.automation_template_sets (agency_id) where is_default;

create table if not exists public.automation_template_set_items (
  set_id uuid not null references public.automation_template_sets(id) on delete cascade,
  template_id uuid not null references public.automation_templates(id) on delete cascade,
  primary key (set_id, template_id)
);

alter table public.automation_templates enable row level security;
alter table public.automation_template_sets enable row level security;
alter table public.automation_template_set_items enable row level security;

create policy "Team verwaltet Automatisierungs-Vorlagen"
on public.automation_templates for all to authenticated
using (public.current_user_is_staff() and agency_id = public.current_user_agency_id())
with check (public.current_user_is_staff() and agency_id = public.current_user_agency_id());

create policy "Team verwaltet Vorlagensets"
on public.automation_template_sets for all to authenticated
using (public.current_user_is_staff() and agency_id = public.current_user_agency_id())
with check (public.current_user_is_staff() and agency_id = public.current_user_agency_id());

create policy "Team verwaltet Vorlagenset-Inhalte"
on public.automation_template_set_items for all to authenticated
using (public.current_user_is_staff() and exists (
  select 1 from public.automation_template_sets s where s.id = set_id and s.agency_id = public.current_user_agency_id()))
with check (public.current_user_is_staff() and exists (
  select 1 from public.automation_template_sets s where s.id = set_id and s.agency_id = public.current_user_agency_id()));

grant select, insert, update, delete on public.automation_templates, public.automation_template_sets, public.automation_template_set_items to authenticated, service_role;

-- Herkunft in der Kampagne + Schutz vor Rückwirkung: Eine Automatisierung löst nur für
-- Leads/Statuswechsel ab dem Einschalten aus (active_since), nicht für den Altbestand.
alter table public.campaign_automations
  add column if not exists template_id uuid references public.automation_templates(id) on delete set null,
  add column if not exists active_since timestamptz;
update public.campaign_automations set active_since = now() where active and active_since is null;

-- Startbestand je Agentur: bisherige E-Mail-Vorlagen und die vier Standard-Vorlagen,
-- zusammen im Set "Standard".
insert into public.automation_templates (agency_id, name, trigger, trigger_status, recipient, subject, body_html)
select agency_id, name, 'new_lead', null, 'candidate', subject, body_html from public.email_templates;

insert into public.automation_templates (agency_id, name, trigger, trigger_status, recipient, subject, body_html)
select a.id, t.name, t.trigger, t.trigger_status, t.recipient, t.subject, t.body
from public.agencies a
cross join (values
  ('Eingangsbestätigung', 'new_lead', null, 'candidate',
   'Deine Bewerbung als #Kampagnenname bei #Kundenname',
   E'Hallo #Kandidatenname,\n\nvielen Dank für deine Bewerbung auf die Stelle als #Kampagnenname bei #Kundenname.\n\nWir haben deine Bewerbung erhalten und melden uns in Kürze bei dir.\n\nMit freundlichen Grüßen'),
  ('Neuer qualifizierter Lead', 'status_change', 'vorqualifiziert', 'client',
   'Neuer qualifizierter Bewerber für #Kampagnenname',
   E'Guten Tag,\n\nfür Ihre Kampagne "#Kampagnenname" wurde ein neuer Bewerber qualifiziert.\n\nName: #Kandidatenname\nE-Mail: #Email\nTelefon: #Telefon\n\nWir setzen uns zeitnah mit Ihnen in Verbindung.\n\nMit freundlichen Grüßen'),
  ('Nicht erreicht', 'status_change', 'nicht_erreicht_mail', 'candidate',
   'Deine Bewerbung als #Kampagnenname – wir haben dich nicht erreicht',
   E'Hallo #Kandidatenname,\n\nwir haben versucht, dich telefonisch zu erreichen, leider ohne Erfolg.\n\nGerne würden wir einen Termin für ein kurzes Gespräch vereinbaren. Antworte einfach auf diese E-Mail mit deiner Telefonnummer und wann du gut erreichbar bist.\n\nMit freundlichen Grüßen'),
  ('Absage', 'status_change', 'abgelehnt', 'candidate',
   'Rückmeldung zu deiner Bewerbung bei #Kundenname',
   E'Hallo #Kandidatenname,\n\nvielen Dank für dein Interesse an der Stelle als #Kampagnenname bei #Kundenname und die Zeit, die du in deine Bewerbung investiert hast.\n\nNach sorgfältiger Prüfung müssen wir dir leider mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben.\n\nWir wünschen dir für deinen weiteren Weg alles Gute.\n\nMit freundlichen Grüßen')
) as t(name, trigger, trigger_status, recipient, subject, body)
where not exists (
  select 1 from public.automation_templates x where x.agency_id = a.id and x.name = t.name
);

insert into public.automation_template_sets (agency_id, name, is_default)
select id, 'Standard', true from public.agencies a
where not exists (select 1 from public.automation_template_sets s where s.agency_id = a.id);

insert into public.automation_template_set_items (set_id, template_id)
select s.id, t.id
from public.automation_template_sets s
join public.automation_templates t on t.agency_id = s.agency_id
where s.name = 'Standard'
  and t.name in ('Eingangsbestätigung', 'Neuer qualifizierter Lead', 'Nicht erreicht', 'Absage')
on conflict do nothing;

notify pgrst, 'reload schema';
