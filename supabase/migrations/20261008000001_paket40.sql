-- Paket 40: Weitere Standorte (PLZ) je Kampagne fürs Matching. Werden mehrere gesuchte
-- Stellen, die sich nur im Standort unterscheiden, zu einer Kampagne zusammengeführt,
-- zählt jede ihrer PLZ als Standort - ein Kandidat passt, wenn er im Umkreis
-- irgendeines Standorts wohnt.
alter table public.campaigns add column if not exists extra_plz text[] not null default '{}';

-- Bestehende zusammengeführte Kampagnen: PLZ der verknüpften Stellen übernehmen.
update public.campaigns c
set extra_plz = sub.plz_list
from (
  select p.campaign_id, array_agg(distinct p.plz order by p.plz) as plz_list
  from public.client_positions p
  join public.campaigns k on k.id = p.campaign_id
  where p.plz ~ '^\d{5}$' and p.plz is distinct from k.plz
  group by p.campaign_id
) sub
where c.id = sub.campaign_id;
