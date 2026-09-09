-- HOTFIX fuer 20260909000001: die dort neu angelegte Policy "Staff sieht Profile der
-- eigenen Agentur" auf public.profiles fragt in ihrer USING-Klausel profiles selbst ab
-- (`select profiles.agency_id from public.profiles where profiles.id = auth.uid()`).
-- Postgres lehnt das kategorisch ab ("infinite recursion detected in policy for
-- relation \"profiles\"", 42P17) - eine Policy AUF profiles darf profiles nicht direkt
-- referenzieren, unabhaengig davon, ob "Eigenes Profil sehen" die eigene Zeile
-- eigentlich freigeben wuerde. Da praktisch jede andere Policy im Schema denselben
-- Subquery-Ausdruck nutzt, um agency_id/client_id des aufrufenden Nutzers zu ermitteln
-- (dort unproblematisch, weil die Policy jeweils auf einer ANDEREN Tabelle liegt und
-- profiles nur "von aussen" abfragt), scheiterte durch diesen einen Fehler jede
-- Abfrage, die intern profiles liest - praktisch die gesamte App.
--
-- Standard-Loesung: eine SECURITY DEFINER-Funktion, die profiles ohne RLS abfragt (laeuft
-- als Tabellenbesitzer, der RLS umgeht - siehe pg_class.relforcerowsecurity = false auf
-- allen Tabellen, Security-Review 08./09.09.2026). Die Policy ruft die Funktion statt
-- der rohen Subquery auf, damit die Rekursion gar nicht erst entsteht.

drop policy if exists "Staff sieht Profile der eigenen Agentur" on public.profiles;

create or replace function public.current_user_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_agency_id() to authenticated;

create policy "Staff sieht Profile der eigenen Agentur"
on public.profiles
for select
to authenticated
using (
  agency_id = public.current_user_agency_id()
);

NOTIFY pgrst, 'reload schema';
