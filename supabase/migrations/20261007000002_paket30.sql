-- Paket 30 (07.10.2026)
-- 1. "Bearbeitet vom Kunden" (T-126): Zeitpunkt, zu dem ein Portalzugang die Zuordnung
--    zuletzt angefasst hat (Status geändert oder Zuordnung entfernt).
alter table public.client_assignments add column if not exists client_touched_at timestamptz;

-- Bisherige Statusänderungen aus dem Portal übernehmen (stehen nur im Verlauf des Kandidaten).
update public.client_assignments a
set client_touched_at = h.last_at
from (
  select candidate_id, max(created_at) as last_at
  from public.candidate_history
  where content like 'Status durch Kunden im Portal geändert%'
     or content like '%durch die Kanzlei im Portal entfernt%'
  group by candidate_id
) h
where h.candidate_id = a.candidate_id
  and a.client_touched_at is null
  and (a.status in ('vg', 'ja', 'nein') or a.removed_at is not null);

-- 2. Stellenanzeige für Kanzleistelle24 per KI (T-125): aufbereitete Aufgaben und
--    Anforderungen je Stelle, nur neu erzeugt, wenn sich die Angaben ändern (Hash).
alter table public.client_positions
  add column if not exists kanzleistelle_aufgaben text[],
  add column if not exists kanzleistelle_anforderungen text[],
  add column if not exists kanzleistelle_text_hash text;

create index if not exists client_assignments_client_touched_idx on public.client_assignments (client_id) where client_touched_at is not null;
