-- Paket 19 (06.10.2026)
--
-- T-86: Beispiel-Leads sind vorqualifiziert (Kundenportal zeigt nur vorqualifizierte).
update public.candidates set status = 'vorqualifiziert' where is_demo and status <> 'vorqualifiziert';

-- T-88: Auslöser "Nur manuell (Kommunikation)" für E-Mail-Vorlagen.
alter table public.automation_templates drop constraint if exists automation_templates_trigger_check;
alter table public.automation_templates add constraint automation_templates_trigger_check
  check (trigger in ('new_lead', 'status_change', 'manual'));

-- T-89: Antworten von Kandidaten. Eingehende Mails (Brevo Inbound über
-- antwort.kanzleistelle24.de) stehen neben den verschickten in candidate_messages.
alter table public.candidate_messages
  add column if not exists direction text not null default 'ausgehend' check (direction in ('ausgehend', 'eingehend')),
  add column if not exists from_address text,
  add column if not exists external_id text;
create unique index if not exists candidate_messages_external_id on public.candidate_messages (external_id) where external_id is not null;

notify pgrst, 'reload schema';
