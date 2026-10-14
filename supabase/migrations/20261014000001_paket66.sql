-- Paket 66 (14.10.2026): Kandidaten nach "zuletzt geändert" sortieren.
-- candidates.updated_at wird bei jeder Änderung am Kandidaten gesetzt und zusätzlich bei
-- jedem neuen Verlaufseintrag (Notiz, Statuswechsel, E-Mail ...). Startwert: letzter
-- Verlaufseintrag, sonst das Anlegedatum.

alter table public.candidates add column if not exists updated_at timestamptz;

update public.candidates c
set updated_at = greatest(
  c.created_at,
  coalesce((select max(h.created_at) from public.candidate_history h where h.candidate_id = c.id), c.created_at)
)
where c.updated_at is null;

alter table public.candidates alter column updated_at set default now();
alter table public.candidates alter column updated_at set not null;
create index if not exists candidates_updated_at_idx on public.candidates (updated_at desc);

create or replace function public.candidates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists candidates_touch_updated_at on public.candidates;
create trigger candidates_touch_updated_at
before update on public.candidates
for each row execute function public.candidates_touch_updated_at();

-- Verlaufseintrag = Änderung am Kandidaten. security definer, weil der Eintrag auch aus
-- Abläufen ohne Schreibrecht auf candidates kommen kann; gesetzt wird nur updated_at.
create or replace function public.candidate_history_touch_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.candidates set updated_at = now() where id = new.candidate_id;
  return new;
end;
$$;

drop trigger if exists candidate_history_touch_candidate on public.candidate_history;
create trigger candidate_history_touch_candidate
after insert on public.candidate_history
for each row execute function public.candidate_history_touch_candidate();

-- Kandidatenliste: updated_at als neue letzte Spalte (Definition sonst wie Paket 34).
create or replace view public.candidate_list_rows
with (security_invoker = true)
as
select
  cand.id,
  cand.first_name,
  cand.last_name,
  (cand.first_name || ' ' || cand.last_name) as full_name,
  cand.email,
  cand.status,
  cand.berufsbild,
  cand.source,
  cand.created_at,
  cand.custom_fields,
  cand.campaign_id,
  camp.title as campaign_title,
  camp.client_id,
  cl.name as client_name,
  cand.tags,
  (
    select ca.status
    from public.client_assignments ca
    where ca.candidate_id = cand.id and ca.removed_at is null
    order by case ca.status when 'ja' then 1 when 'vg' then 2 when 'inbox' then 3 else 4 end
    limit 1
  ) as assignment_status,
  coalesce((
    select jsonb_agg(jsonb_build_object('client_id', ca.client_id, 'client_name', acl.name, 'status', ca.status) order by ca.created_at)
    from public.client_assignments ca
    join public.clients acl on acl.id = ca.client_id
    where ca.candidate_id = cand.id and ca.removed_at is null
  ), '[]'::jsonb) as assignments,
  cand.updated_at
from public.candidates cand
left join public.campaigns camp on camp.id = cand.campaign_id
left join public.clients cl on cl.id = camp.client_id
where not cand.is_demo;

NOTIFY pgrst, 'reload schema';
