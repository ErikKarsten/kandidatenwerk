-- Paket 20 (06.10.2026), T-90: Mail an die Kanzlei bei neuer Zuordnung.
-- Neuer Auslöser "client_assigned": geht bei jeder neuen Zuordnung an die Kanzlei,
-- unabhängig von Kampagnen. Die bisherige Vorlage "Neuer qualifizierter Lead" wird darauf
-- umgestellt und bekommt den #Bewerberlink (Kandidat im Kundenportal).
alter table public.automation_templates drop constraint if exists automation_templates_trigger_check;
alter table public.automation_templates add constraint automation_templates_trigger_check
  check (trigger in ('new_lead', 'status_change', 'client_assigned', 'manual'));

update public.automation_templates
set trigger = 'client_assigned',
    trigger_status = null,
    recipient = 'client',
    name = 'Neuer Kandidat für die Kanzlei',
    subject = 'Neuer Kandidat für Sie: #Kandidatenname',
    body_html = E'Guten Tag,\n\nwir haben einen neuen, vorqualifizierten Kandidaten für Sie: #Kandidatenname (#Kampagnenname).\n\nAlle Angaben, Unterlagen und unsere Einschätzung finden Sie im Kundenportal:\n#Bewerberlink\n\nBitte geben Sie uns dort kurz Bescheid, ob Sie ein Vorstellungsgespräch führen möchten.\n\nMit freundlichen Grüßen\nIhr Team von Endlich Mitarbeiter',
    updated_at = now()
where name = 'Neuer qualifizierter Lead';

-- Gehört nicht mehr in Kampagnen-Vorlagensets.
delete from public.automation_template_set_items i
using public.automation_templates t
where t.id = i.template_id and t.trigger = 'client_assigned';

notify pgrst, 'reload schema';
