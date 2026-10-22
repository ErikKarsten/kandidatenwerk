-- Paket 80: Eingangsbestätigung je Kampagne abschaltbar. Für Kanzlei-Kampagnen mit
-- Lead-Formular aus der eigenen Meta-Kampagne der Kanzlei - die Bewerber haben sich auf
-- die Anzeige der Kanzlei beworben, nicht auf KS24.
alter table public.campaigns
  add column if not exists skip_lead_confirmation boolean not null default false;

NOTIFY pgrst, 'reload schema';
