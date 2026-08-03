-- Erweitert candidates_status_check um 4 neue Pipeline-Stufen (vorqualifiziert,
-- nicht_erreicht, nicht_erreicht_mail, in_kontakt) und benennt den bisherigen Wert
-- "pruefung" konsistent zu "in_pruefung" um (0 Kandidaten hatten diesen Status zum
-- Zeitpunkt der Migration, siehe Bestandsaufnahme vom 2026-07-31 - daher risikolos).
--
-- Constraint-Name per Supabase SQL Editor bestätigt (conname = candidates_status_check,
-- 2026-08-03).
ALTER TABLE public.candidates DROP CONSTRAINT candidates_status_check;

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
    'abgelehnt'::text
  ])));
