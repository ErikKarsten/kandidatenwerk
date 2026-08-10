-- Ortsname zur Kunden-PLZ, rein informativ fürs UI (z.B. "40210 (Düsseldorf)").
-- Wird einmalig beim Speichern per Nominatim-Reverse-Geocoding aus lat/lng ermittelt
-- (siehe updateClientAction in src/app/dashboard/clients/[id]/actions.ts) - nicht bei
-- jedem Seitenaufruf neu abgefragt, um Nominatims Nutzungsrichtlinien (max. 1 Request/s,
-- keine Bulk-Anfragen) einzuhalten. Bleibt NULL, wenn die Anfrage fehlschlägt oder
-- keinen Ort liefert - kein Pflichtfeld, kein Fehlerfall.

alter table public.clients
  add column ort text;
