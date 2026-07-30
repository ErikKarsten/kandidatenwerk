-- Grundlage für Standort-Daten auf Kundenebene (analog zu campaigns.plz/lat/lng).
-- Wird benötigt, um bei Leadtable-importierten Kunden einen Standort zu hinterlegen,
-- den nachgelagert alle ihre Kampagnen ohne eigene PLZ übernehmen können.

alter table public.clients
  add column plz text,
  add column lat numeric,
  add column lng numeric;
