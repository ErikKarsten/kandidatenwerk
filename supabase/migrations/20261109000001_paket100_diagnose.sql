-- Paket 100 (09.11.2026): Diagnose, warum Speichern am Kandidaten mit
-- "canceling statement due to statement timeout" abbricht.
-- Legt nur eine Lese-Funktion an, ändert keine Daten. Aufrufbar nur mit dem Service-Schlüssel
-- (Server und Skripte), nicht von eingeloggten Nutzern und nicht anonym.
-- Liefert: Zeitlimits der Rollen, Trigger auf candidates, gerade laufende oder wartende
-- Abfragen samt Blockierern, teuerste und langsamste Abfragen, Tabellenzustand.

create or replace function public.diagnose_db()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  result jsonb := '{}'::jsonb;
  part jsonb;
begin
  select jsonb_agg(jsonb_build_object('rolle', rolname, 'einstellungen', rolconfig)) into part
  from pg_roles
  where rolname in ('authenticated', 'anon', 'service_role', 'authenticator');
  result := result || jsonb_build_object('rollen', part);

  -- Auch im Supabase-Dashboard angelegte Trigger (z. B. Database Webhooks).
  select jsonb_agg(pg_get_triggerdef(t.oid)) into part
  from pg_trigger t
  where t.tgrelid = 'public.candidates'::regclass and not t.tgisinternal;
  result := result || jsonb_build_object('trigger_candidates', part);

  select jsonb_agg(jsonb_build_object(
      'pid', a.pid,
      'nutzer', a.usename,
      'app', a.application_name,
      'status', a.state,
      'wartet_auf', a.wait_event_type || ':' || a.wait_event,
      'blockiert_von', pg_blocking_pids(a.pid),
      'transaktion_s', round(extract(epoch from now() - a.xact_start)::numeric, 1),
      'abfrage_s', round(extract(epoch from now() - a.query_start)::numeric, 1),
      'abfrage', left(regexp_replace(a.query, '\s+', ' ', 'g'), 200)
    ) order by a.xact_start nulls last) into part
  from pg_stat_activity a
  where a.datname = current_database() and a.pid <> pg_backend_pid() and a.state is distinct from 'idle';
  result := result || jsonb_build_object('aktivitaet', coalesce(part, '[]'::jsonb), 'verbindungen', (select count(*) from pg_stat_activity), 'max_verbindungen', current_setting('max_connections'));

  select jsonb_agg(x) into part from (
    select relname as tabelle, n_live_tup as zeilen, n_dead_tup as tote_zeilen, seq_scan, idx_scan, n_tup_upd as updates, last_autovacuum, last_autoanalyze
    from pg_stat_user_tables
    where schemaname = 'public'
    order by seq_tup_read desc
    limit 12
  ) x;
  result := result || jsonb_build_object('tabellen', part);

  begin
    select jsonb_agg(x) into part from (
      select calls, round(mean_exec_time::numeric) as mittel_ms, round(max_exec_time::numeric) as max_ms, round((total_exec_time / 1000)::numeric) as gesamt_s, left(regexp_replace(query, '\s+', ' ', 'g'), 200) as abfrage
      from extensions.pg_stat_statements
      order by total_exec_time desc
      limit 25
    ) x;
    result := result || jsonb_build_object('teuerste_abfragen', part);

    select jsonb_agg(x) into part from (
      select calls, round(mean_exec_time::numeric) as mittel_ms, round(max_exec_time::numeric) as max_ms, left(regexp_replace(query, '\s+', ' ', 'g'), 200) as abfrage
      from extensions.pg_stat_statements
      where max_exec_time > 3000
      order by max_exec_time desc
      limit 25
    ) x;
    result := result || jsonb_build_object('langsamste_einzelne', part, 'statistik_seit', (select stats_reset from extensions.pg_stat_statements_info));
  exception when others then
    result := result || jsonb_build_object('pg_stat_statements_fehler', sqlerrm);
  end;

  return result;
end;
$$;

revoke all on function public.diagnose_db() from public, anon, authenticated;
grant execute on function public.diagnose_db() to service_role;

NOTIFY pgrst, 'reload schema';
