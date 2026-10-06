-- Paket 16 (06.10.2026), T-75: Mehrere Standorte je Kunde.
--
-- Bisher hatte ein Kunde genau eine PLZ (clients.plz, Hauptstandort aus Close). Jetzt
-- beliebig viele Standorte; genau einer ist Hauptstandort und bleibt mit
-- clients.plz/ort/lat/lng abgeglichen (alles, was nur eine PLZ braucht, funktioniert
-- unverändert). Die Karte zeigt alle Standorte.
create table if not exists public.client_locations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  strasse text,
  plz text not null,
  ort text,
  lat double precision,
  lng double precision,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists client_locations_one_primary on public.client_locations (client_id) where is_primary;
create index if not exists client_locations_client_idx on public.client_locations (client_id);

alter table public.client_locations enable row level security;
create policy "Team verwaltet Kundenstandorte"
on public.client_locations for all to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());
grant select, insert, update, delete on public.client_locations to authenticated, service_role;

-- Hauptstandort aus den Stammdaten.
insert into public.client_locations (client_id, plz, ort, lat, lng, is_primary)
select id, plz, ort, lat, lng, true from public.clients
where plz is not null and plz <> ''
  and not exists (select 1 from public.client_locations l where l.client_id = clients.id);

-- Weitere Standorte aus den gesuchten Stellen (andere PLZ als der Hauptstandort).
insert into public.client_locations (client_id, plz, ort, lat, lng, is_primary)
select client_id, plz, ort, lat, lng,
  -- Kunde ohne Stammdaten-PLZ: erste Stelle wird Hauptstandort.
  rn = 1 and not exists (select 1 from public.client_locations l where l.client_id = x.client_id)
from (
  select distinct on (p.client_id, p.plz) p.client_id, p.plz, p.ort, p.lat, p.lng, p.created_at,
    dense_rank() over (partition by p.client_id order by p.plz) as rn
  from public.client_positions p
  where p.plz is not null and p.plz <> ''
    and not exists (select 1 from public.client_locations l where l.client_id = p.client_id and l.plz = p.plz)
  order by p.client_id, p.plz, p.created_at
) x;

notify pgrst, 'reload schema';
