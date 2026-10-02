-- Protokoll der Cron-Läufe (Cloudflare Cron Trigger -> /api/cron/*) für die
-- Überwachung (Atlas, Paket 2, 02.10.2026): jeder Lauf schreibt eine Zeile, bei
-- Fehlschlag geht eine Mail an die Agentur-Admins (höchstens alle 12 Std. je Job,
-- alert_sent_at), und scripts/check-cron-health.ts prüft täglich per GitHub Action, ob
-- jeder Job zuletzt rechtzeitig erfolgreich lief. Geschrieben wird nur per
-- service_role; Einträge älter als 30 Tage räumt der Logger selbst auf.

create table public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  summary jsonb,
  error text,
  alert_sent_at timestamptz
);

create index cron_job_runs_job_started_at_idx on public.cron_job_runs (job, started_at desc);

alter table public.cron_job_runs enable row level security;

create policy "Team liest Cron-Protokoll"
on public.cron_job_runs
for select
to authenticated
using (public.current_user_is_staff());

grant select on public.cron_job_runs to authenticated;
grant select, insert, update, delete on public.cron_job_runs to service_role;

notify pgrst, 'reload schema';
