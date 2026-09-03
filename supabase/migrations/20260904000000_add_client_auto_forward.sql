-- Schalter pro Kunde: soll ein Kandidat bei Wechsel auf "vorqualifiziert" automatisch
-- per Mail an diesen Kunden weitergeleitet werden? Default false - bestehende Kunden
-- bekommen die Automatisierung nicht ungefragt aktiviert, muss bewusst im
-- Kunden-Bearbeiten-Formular angehakt werden (siehe client-form.tsx/client-detail.tsx).
alter table public.clients
  add column auto_forward_enabled boolean not null default false;

NOTIFY pgrst, 'reload schema';
