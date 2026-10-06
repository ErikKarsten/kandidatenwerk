-- Paket 21 (06.10.2026): Mails nur noch über die Automatisierungen der Kampagne.
-- Die zentrale Mail bei Zuordnung (Paket 20) entfällt; "Kandidat der Kampagne zugeordnet"
-- ist jetzt ein Kampagnen-Auslöser und gehört wieder ins Standard-Set.
insert into public.automation_template_set_items (set_id, template_id)
select s.id, t.id
from public.automation_template_sets s
join public.automation_templates t on t.agency_id = s.agency_id and t.trigger = 'client_assigned'
where s.is_default
on conflict do nothing;

-- Bestehende "Neuer qualifizierter Lead"-Automatisierungen in Kanzlei-Kampagnen (Status
-- vorqualifiziert an die Kanzlei) auf den neuen Auslöser umstellen: Mail an alle
-- Portal-Zugänge bei Zuordnung, mit #Bewerberlink. Aktive zählen ab jetzt (kein Nachversand).
update public.campaign_automations a
set trigger = 'client_assigned',
    trigger_status = null,
    recipient = 'client',
    template_id = t.id,
    name = t.name,
    subject = t.subject,
    body_html = t.body_html,
    active_since = case when a.active then now() else a.active_since end
from public.campaigns c, public.automation_templates t
where c.id = a.campaign_id
  and c.kind = 'kanzlei'
  and a.trigger = 'status_change'
  and a.trigger_status = 'vorqualifiziert'
  and a.recipient in ('client', 'all_contacts')
  and t.trigger = 'client_assigned'
  and t.agency_id = coalesce(c.agency_id, t.agency_id);

notify pgrst, 'reload schema';
