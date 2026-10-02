-- Verlauf (candidate_history) für alle Kandidaten, die das Team sehen darf
-- (Fund beim Test von Paket 4, 02.10.2026).
--
-- Die bestehende Policy "History der eigenen Kandidaten" (aus der Zeit vor der
-- Migrations-Historie, Definition nicht im Repo) erlaubt Einträge offenbar nur für
-- Kandidaten mit Kampagne/Kunde der eigenen Agentur. Kandidaten OHNE Kampagne und Kunde
-- (manuell angelegt, Altbestand) sind für das Team seit 20260907000004 zwar sichtbar,
-- ihr Verlauf ließ sich aber nicht beschreiben: "new row violates row-level security
-- policy for table candidate_history" - Notizen, Statuswechsel, Berufsbild- und
-- Zuordnungs-Einträge gingen still verloren. Mit Lead-Kampagnen ohne Kunde (T-36)
-- beträfe das künftig jeden neuen Lead.
--
-- Ergänzende Policy (ODER-verknüpft mit der bestehenden): Staff darf den Verlauf jedes
-- Kandidaten lesen und schreiben, den es über die Kandidaten-Policies sehen darf. Die
-- Unterabfrage auf candidates läuft mit den Rechten des Aufrufers, übernimmt also genau
-- dessen Sichtbarkeit. Portal-Kunden sind über current_user_is_staff() ausgeschlossen.

create policy "Team greift auf Verlauf sichtbarer Kandidaten zu"
on public.candidate_history
for all
to authenticated
using (
  candidate_id in (select id from public.candidates)
  and public.current_user_is_staff()
)
with check (
  candidate_id in (select id from public.candidates)
  and public.current_user_is_staff()
);

notify pgrst, 'reload schema';
