-- Paket 46: Worauf sich ein Kandidat beworben hat (Stelle/Ausschreibung), angezeigt unter dem
-- Namen. Leadtable: Kampagne und Kanzlei, Kanzleistelle24: ausgeschriebene Position. Die
-- Kampagne selbst (Meta) steht weiter in campaign_id.
alter table public.candidates add column if not exists bewerbung text;
