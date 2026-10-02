-- Meta-Kampagnen-Abgleich (Atlas T-38): Kampagnen des Werbekontos werden als
-- Lead-Kampagnen (campaigns.kind = 'lead', meta_campaign_id = Meta-ID) angelegt bzw.
-- aktualisiert, ihre Werbegebiete (Anzeigengruppen-Targeting) in campaign_ad_areas
-- gespeichert - für die Karte und den Abdeckungs-Hinweis im Kundenprofil.
-- Geschrieben wird nur per service_role (src/lib/meta-campaigns-sync.ts).

alter table public.campaigns
  add column meta_effective_status text,
  add column meta_synced_at timestamptz;

-- Je Meta-Kampagne höchstens eine Lead-Kampagne (Abgleich arbeitet per Upsert).
create unique index campaigns_lead_meta_campaign_id_uidx
  on public.campaigns (meta_campaign_id)
  where kind = 'lead' and meta_campaign_id is not null;

create table public.campaign_ad_areas (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  meta_adset_id text not null,
  adset_name text,
  adset_active boolean not null default false,
  -- city | place | custom_location | zip | region | country
  area_type text not null,
  -- Meta-Schlüssel des Gebiets (Stadt-/Ort-ID, PLZ ...), für das Wiederverwenden
  -- bereits nachgeschlagener Koordinaten
  area_key text,
  label text not null,
  lat double precision,
  lng double precision,
  radius_km numeric,
  synced_at timestamptz not null default now()
);

create index campaign_ad_areas_campaign_id_idx on public.campaign_ad_areas (campaign_id);
create index campaign_ad_areas_area_key_idx on public.campaign_ad_areas (area_type, area_key);

alter table public.campaign_ad_areas enable row level security;

-- Lesen für Staff, sofern die Kampagne für ihn sichtbar ist (Unterabfrage läuft mit
-- den Rechten des Aufrufers, übernimmt also die campaigns-Policies).
create policy "Team liest Werbegebiete sichtbarer Kampagnen"
on public.campaign_ad_areas
for select
to authenticated
using (
  campaign_id in (select id from public.campaigns)
  and public.current_user_is_staff()
);

grant select on public.campaign_ad_areas to authenticated;
grant select, insert, update, delete on public.campaign_ad_areas to service_role;

notify pgrst, 'reload schema';
