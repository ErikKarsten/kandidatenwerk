-- Paket 109 (18.11.2026): Leads eines neu hinterlegten Meta-Formulars einmal vollständig
-- holen. Anlass ETL Rubikon: Formular am 09.11. an der Kanzlei-Kampagne hinterlegt, die
-- Leads stammten vom 05./06.11. Der Webhook fand damals keine passende Kampagne und
-- verwarf sie, der Abgleich schaut nur 3 Tage zurück - es kam nie etwas an.
--
-- meta_form_nachgeholt: Formular-ID, deren Leads schon einmal vollständig geholt wurden.
-- Weicht sie von meta_form_id ab (neu hinterlegt oder gewechselt), holt der nächste Lauf
-- alle Leads des Formulars. Bestehende Kampagnen gelten als erledigt (ETL Rubikon wurde
-- beim Einspielen von Hand nachgeholt).

alter table public.campaigns add column if not exists meta_form_nachgeholt text;

update public.campaigns set meta_form_nachgeholt = meta_form_id
where meta_form_id is not null and meta_form_nachgeholt is distinct from meta_form_id;

NOTIFY pgrst, 'reload schema';
