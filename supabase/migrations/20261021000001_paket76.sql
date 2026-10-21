-- Paket 76 (21.10.2026): Beispielkandidaten für Live-Kunden. Startpunkt der 3 Monate ist
-- der Zeitpunkt, an dem der Kunde auf "Live" geschoben wurde (clients.live_since).
-- Bestehende Live-Kunden starten heute (Wunsch: alle bestehenden einbeziehen).

alter table public.clients add column if not exists live_since timestamptz;

update public.clients
set live_since = now()
where project_phase = 'live' and live_since is null;

-- Erstes Mal "Live": Zeitpunkt merken (ein späteres Zurück und wieder Live startet nicht neu).
create or replace function public.clients_set_live_since()
returns trigger
language plpgsql
as $$
begin
  if new.project_phase = 'live' and new.live_since is null then
    new.live_since := now();
  end if;
  return new;
end;
$$;

drop trigger if exists clients_set_live_since on public.clients;
create trigger clients_set_live_since
before insert or update of project_phase on public.clients
for each row execute function public.clients_set_live_since();

NOTIFY pgrst, 'reload schema';
