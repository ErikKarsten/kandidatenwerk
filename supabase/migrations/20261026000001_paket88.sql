-- Paket 88: Haken im Reiter "Projekt" - die Kampagne läuft über die Marke des Kunden
-- (eigene Anzeigen/Seite der Kanzlei statt KS24). Wird im Kopf des Kunden angezeigt.
alter table public.clients
  add column if not exists campaign_via_client_brand boolean not null default false;

NOTIFY pgrst, 'reload schema';
