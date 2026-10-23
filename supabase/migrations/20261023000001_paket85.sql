-- Paket 85: neuer Kandidatenstatus "Derzeit nicht auf Suche" (beim Setzen legt
-- Kandidatenwerk eine Aufgabe an, den Kandidaten in 6 Monaten erneut anzurufen).
alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates add constraint candidates_status_check
  check (status = any (array['neu', 'vorqualifiziert', 'in_pruefung', 'nicht_erreicht', 'nicht_erreicht_mail', 'in_kontakt', 'nicht_auf_suche', 'abgelehnt', 'Archiviert']));

NOTIFY pgrst, 'reload schema';
