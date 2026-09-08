-- Fix: candidates_status_check kennt "Archiviert" nicht, obwohl
-- candidates/[id]/actions.ts es genau dafuer setzt (Kandidat archivieren) - der
-- "Kandidat archivieren"-Button im Dashboard schlaegt dadurch fuer jeden Kandidaten
-- mit derselben Constraint-Verletzung fehl wie beim campaigns-Pendant, siehe
-- 20260908000001_fix_campaigns_status_check.sql (dortige Begruendung gilt
-- sinngemaess: "Archiviert" ist die App-weite Konvention, funktioniert bei
-- clients.status bereits klaglos, live per Testabfrage am 2026-09-08 verifiziert,
-- dass candidates_status_check es aktuell ablehnt).
--
-- Alle 10 bisherigen Werte aus 20260803000000_extend_candidate_status_options.sql
-- unveraendert uebernommen, nur "Archiviert" ergaenzt. Gleiches
-- Drop-und-neu-Anlegen-Muster wie dort.

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_status_check;

ALTER TABLE public.candidates ADD CONSTRAINT candidates_status_check
  CHECK ((status = ANY (ARRAY[
    'neu'::text,
    'in_pruefung'::text,
    'interview'::text,
    'vorqualifiziert'::text,
    'nicht_erreicht'::text,
    'nicht_erreicht_mail'::text,
    'in_kontakt'::text,
    'vorgestellt'::text,
    'platziert'::text,
    'abgelehnt'::text,
    'Archiviert'::text
  ])));
