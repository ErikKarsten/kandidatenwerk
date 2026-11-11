-- Paket 101 (11.11.2026): Ursache der Zeitüberschreitungen beim Speichern ("canceling
-- statement due to statement timeout").
--
-- Befund aus diagnose_db(): Nicht ein Speichervorgang wartet auf einen anderen, sondern die
-- Datenbank ist zeitweise insgesamt überlastet. Selbst Mini-Abfragen (z. B. 219 Stellen
-- lesen) brauchen im Mittel ~90 ms und in Spitzen 5-7 s; die Tabelle profiles (265 Zeilen)
-- wurde 14 Mio. Mal komplett durchsucht.
--
-- Grund: Die Zugriffsregeln (RLS-Policies) rufen Hilfsfunktionen wie
-- current_user_is_staff() direkt auf. Postgres führt sie dann für JEDE Zeile neu aus, und
-- jede Ausführung liest profiles. Bei 2.000 Kandidaten sind das 2.000 Zusatzabfragen pro
-- Liste. Steht der Aufruf in "(select …)", rechnet Postgres ihn einmal pro Abfrage
-- (Supabase-Empfehlung, so schon in Paket 89 für Active Sourcing umgesetzt).
--
-- Diese Migration schreibt alle Policies in public und storage entsprechend um. Was die
-- Regeln erlauben, bleibt exakt gleich, nur die Auswertung wird billiger. Danach werden
-- die Abfrage-Statistiken zurückgesetzt, damit diagnose_db() die Wirkung zeigt (der
-- alte Stand ist gesichert).

do $$
declare
  p record;
  stmt text;
  new_qual text;
  new_check text;
  -- Nur Aufrufe ohne Argumente, die nicht schon in "(SELECT …)" stehen. Mit leerem
  -- search_path schreibt Postgres alle Namen voll aus ("public.…", "auth.…").
  muster constant text := '(?<!SELECT )(public\.(current_user_is_staff|current_user_agency_id|current_user_is_agency_admin|current_user_sees_active_sourcing)|auth\.uid)\(\)';
  alter_pfad text := current_setting('search_path');
  geaendert int := 0;
  fehler int := 0;
begin
  perform set_config('search_path', '', true);

  for p in
    select pol.polname, n.nspname, c.relname,
           pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) as wcheck
    from pg_catalog.pg_policy pol
    join pg_catalog.pg_class c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
    order by n.nspname, c.relname, pol.polname
  loop
    new_qual := pg_catalog.regexp_replace(p.qual, muster, '(SELECT \1())', 'g');
    new_check := pg_catalog.regexp_replace(p.wcheck, muster, '(SELECT \1())', 'g');
    continue when new_qual is not distinct from p.qual and new_check is not distinct from p.wcheck;

    stmt := pg_catalog.format('alter policy %I on %I.%I', p.polname, p.nspname, p.relname);
    if new_qual is distinct from p.qual then
      stmt := stmt || ' using (' || new_qual || ')';
    end if;
    if new_check is distinct from p.wcheck then
      stmt := stmt || ' with check (' || new_check || ')';
    end if;

    begin
      execute stmt;
      geaendert := geaendert + 1;
    exception when others then
      fehler := fehler + 1;
      raise warning 'Policy "%" auf %.% nicht umgestellt: %', p.polname, p.nspname, p.relname, sqlerrm;
    end;
  end loop;

  perform set_config('search_path', alter_pfad, true);
  raise notice 'Paket 101: % Policies umgestellt, % Fehler', geaendert, fehler;
end $$;

-- diagnose_db() zusätzlich: Policies, die noch pro Zeile rechnen, und Datenbank-Kennzahlen.
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

  select jsonb_build_object(
      'cache_trefferquote_prozent', round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2),
      'temp_dateien', temp_files,
      'deadlocks', deadlocks,
      'seit', stats_reset)
    into part
  from pg_stat_database where datname = current_database();
  result := result || jsonb_build_object('datenbank', part);

  -- Paket 101: Policies, die eine Hilfsfunktion noch pro Zeile aufrufen (sollte leer sein).
  select jsonb_agg(schemaname || '.' || tablename || ': ' || policyname) into part
  from pg_policies
  where schemaname in ('public', 'storage')
    and concat_ws(' ', qual, with_check) ~ '(?<!SELECT )\m(current_user_is_staff|current_user_agency_id|current_user_is_agency_admin|current_user_sees_active_sourcing|auth\.uid)\(\)';
  result := result || jsonb_build_object('policies_pro_zeile', coalesce(part, '[]'::jsonb));

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

-- Abfrage-Statistik neu starten, damit die Wirkung messbar ist.
do $$
begin
  perform extensions.pg_stat_statements_reset();
exception when others then
  raise notice 'Statistik nicht zurückgesetzt: %', sqlerrm;
end $$;

NOTIFY pgrst, 'reload schema';
