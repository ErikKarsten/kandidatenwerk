-- Lead- und Kanzlei-Kampagnen trennen, Zuordnung je Kanzlei-Kampagne (Atlas T-36,
-- Zielbild T-31, Erik 02.10.2026):
--   - Lead-Kampagne: unsere regionale Meta-Kampagne, gehört KEINER Kanzlei. Hier
--     laufen Bewerbungen ein (candidates.campaign_id = Herkunft).
--   - Kanzlei-Kampagne: Bedarf einer Kanzlei (Berufsbild, Standort, Umkreis), gehört
--     genau einem Kunden. Kandidaten werden einer oder mehreren davon zugeordnet (1:n).
--
-- Bewusst nur ERGÄNZEND: bestehende Kampagnen werden kind = 'kanzlei' (Verhalten
-- unverändert), bestehende Policies bleiben, für Lead-Kampagnen kommen zusätzliche
-- Policies dazu (Policies werden ODER-verknüpft). Die Bestandsdaten (Sammelkunden
-- Kanzleistelle24.de u. a.) werden beim Neuaufsetzen (T-20) umgestellt.

-- ============================================================
-- 1) campaigns: Art, Agentur für Lead-Kampagnen, client_id optional
-- ============================================================
alter table public.campaigns
  add column kind text not null default 'kanzlei' check (kind in ('lead', 'kanzlei')),
  add column agency_id uuid references public.agencies(id) on delete cascade;

alter table public.campaigns alter column client_id drop not null;

-- Kanzlei-Kampagnen brauchen einen Kunden, Lead-Kampagnen eine Agentur.
alter table public.campaigns
  add constraint campaigns_kind_owner_check check (
    (kind = 'kanzlei' and client_id is not null)
    or (kind = 'lead' and agency_id is not null)
  );

create index campaigns_kind_idx on public.campaigns (kind);

-- ============================================================
-- 2) client_assignments: Zuordnung zu einer Kanzlei-Kampagne
-- ============================================================
alter table public.client_assignments
  add column campaign_id uuid references public.campaigns(id) on delete set null;

create index client_assignments_campaign_id_idx on public.client_assignments (campaign_id);

-- Je Kandidat und Kanzlei-Kampagne höchstens eine aktive Zuordnung. Mehrere Kampagnen
-- je Kandidat (auch bei verschiedenen Kanzleien) bleiben möglich. Alte Zuordnungen
-- ohne Kampagne (campaign_id NULL = "Kanzlei allgemein") sind davon nicht betroffen.
create unique index client_assignments_active_candidate_campaign_uidx
  on public.client_assignments (candidate_id, campaign_id)
  where removed_at is null and campaign_id is not null;

-- client_id folgt immer dem Kunden der Kampagne, und es dürfen nur Kanzlei-Kampagnen
-- zugeordnet werden. client_id bleibt die Grundlage für RLS und das Kunden-Portal.
create or replace function public.client_assignments_sync_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if new.campaign_id is null then
    return new;
  end if;

  select kind, client_id into c from public.campaigns where id = new.campaign_id;
  if not found then
    raise exception 'Kampagne % nicht gefunden.', new.campaign_id;
  end if;
  if c.kind <> 'kanzlei' then
    raise exception 'Kandidaten können nur Kanzlei-Kampagnen zugeordnet werden.';
  end if;

  new.client_id := c.client_id;
  return new;
end;
$$;

drop trigger if exists client_assignments_sync_campaign on public.client_assignments;
create trigger client_assignments_sync_campaign
before insert or update of campaign_id, client_id on public.client_assignments
for each row
execute function public.client_assignments_sync_campaign();

-- Kunden-Portal darf bei Zuordnungen nur "status" ändern (20260928000000). Die neue
-- Spalte campaign_id muss in diese Sperre mit aufgenommen werden - sonst könnte ein
-- Portal-Kunde eine Zuordnung auf eine andere Kampagne umhängen (der Sync-Trigger oben
-- würde dabei sogar client_id mitziehen). Funktion unverändert bis auf campaign_id.
create or replace function public.enforce_client_status_only_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_is_staff() then
    return new;
  end if;

  if new.candidate_id is distinct from old.candidate_id
     or new.client_id is distinct from old.client_id
     or new.campaign_id is distinct from old.campaign_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.removed_at is distinct from old.removed_at
  then
    raise exception 'Portal-Kunden dürfen nur den Status der eigenen Zuordnung ändern.';
  end if;

  return new;
end;
$$;

-- ============================================================
-- 3) Zusätzliche Policies für Lead-Kampagnen (bestehende bleiben unverändert)
-- ============================================================
create policy "Team verwaltet Lead-Kampagnen der eigenen Agentur"
on public.campaigns
for all
to authenticated
using (
  kind = 'lead'
  and agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
)
with check (
  kind = 'lead'
  and agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
);

create policy "Team verwaltet Automatisierungen von Lead-Kampagnen der eigenen Agentur"
on public.campaign_automations
for all
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where kind = 'lead'
      and agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
)
with check (
  campaign_id in (
    select id from public.campaigns
    where kind = 'lead'
      and agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

create policy "Kandidaten aus Lead-Kampagnen der eigenen Agentur"
on public.candidates
for all
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where kind = 'lead'
      and agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

notify pgrst, 'reload schema';
