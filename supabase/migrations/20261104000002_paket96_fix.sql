-- Paket 96 Fix: Kandidaten ließen sich nicht mehr öffnen.
-- matching_suggestions hatte den Schlüssel (candidate_id, campaign_id). Damit hält PostgREST die
-- Tabelle für eine Verbindungstabelle zwischen candidates und campaigns, und jede Abfrage wie
-- candidates?select=campaigns(title) ist doppeldeutig (Fehler PGRST201).
-- Lösung wie bei client_assignments: eigener Schlüssel id, das Paar bleibt eindeutig.

begin;

alter table public.matching_suggestions add column id uuid not null default gen_random_uuid();
alter table public.matching_suggestions drop constraint matching_suggestions_pkey;
alter table public.matching_suggestions add constraint matching_suggestions_pkey primary key (id);
alter table public.matching_suggestions
  add constraint matching_suggestions_candidate_campaign_key unique (candidate_id, campaign_id);

commit;

NOTIFY pgrst, 'reload schema';
