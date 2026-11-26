-- Paket 117: Einzelne Kanzleien (altes Produkt, z. B. STB Rendsburg) sehen im Portal alle
-- Leadeingänge ihrer eigenen Kampagnen, nicht nur vorqualifizierte. Schalter je Kunde.
alter table public.clients
  add column if not exists portal_alle_leads boolean not null default false;

comment on column public.clients.portal_alle_leads is
  'Kundenportal zeigt alle Leads der eigenen Kampagnen (auch nicht vorqualifizierte), ohne Mail je Lead (Paket 117).';

NOTIFY pgrst, 'reload schema';
