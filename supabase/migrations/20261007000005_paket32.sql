-- Paket 32 (07.10.2026): Kommentare aus Close nur noch für Telefonate und Besprechungen ab
-- dem Status "Gewonnen". Der Verlauf davor wird bei der Übernahme weiter gelesen (Telefonate
-- transkribiert), dient aber nur als Grundlage für das KI-Kanzleiprofil.
alter table public.close_meeting_summaries add column if not exists create_comment boolean not null default true;
alter table public.close_onboarding add column if not exists triggered_at timestamptz;
update public.close_onboarding set triggered_at = created_at where triggered_at is null;

-- Bereinigung der bisherigen Übernahmen (Aupperle & Partner): Kommentare aus dem Verlauf vor
-- "Gewonnen" sowie zu Notizen, eigenen Aktivitäten und Statuswechseln entfernen. Die Einträge
-- in close_meeting_summaries (Texte, Transkripte) bleiben für das Profil erhalten.
with old as (
  select s.close_activity_id, s.comment_id
  from public.close_meeting_summaries s
  join public.close_onboarding o on o.lead_id = s.lead_id
  where s.activity_type not in ('call', 'meeting')
     or o.trigger_status !~* 'gewonnen'
     or s.activity_at < o.triggered_at
)
, cleared as (
  update public.close_meeting_summaries s
  set create_comment = false, comment_id = null
  from old
  where s.close_activity_id = old.close_activity_id
  returning old.comment_id
)
delete from public.client_comments c
using cleared
where c.id = cleared.comment_id;
