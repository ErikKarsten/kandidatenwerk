-- Paket 35 (07.10.2026): "Offene Fragen aus Bewerberrunde" - Fragen des Kandidaten an den
-- neuen Arbeitgeber, unter der Beschreibung im Kandidatenprofil und im Kundenportal.
alter table public.candidates add column if not exists offene_fragen text;

-- Musterkandidaten: je ein bis zwei typische Fragen.
update public.candidates c
set offene_fragen = v.fragen
from (values
  ('laura.schneider@example.com', E'- Wie viele Tage Homeoffice sind nach der Einarbeitung möglich?\n- Wird die Fortbildung zur Steuerfachwirtin finanziell und mit Lernzeit unterstützt?'),
  ('jonas.becker@example.com', E'- Wie läuft die Einarbeitung ab und gibt es eine feste Ansprechperson?\n- Ab wann kann ich erste Jahresabschlüsse selbst erstellen?'),
  ('sabine.hoffmann@example.com', E'- Sind feste Arbeitstage in Teilzeit (30 Std. an 4 Tagen) möglich?'),
  ('katharina.wagner@example.com', E'- Gibt es eine konkrete Perspektive auf eine Teamleitung?\n- Welche Mandatsgrößen würde ich eigenständig betreuen?'),
  ('daniel.fischer@example.com', E'- Unterstützt die Kanzlei die Vorbereitung auf das Steuerberaterexamen (Freistellung, Kosten)?'),
  ('melanie.krueger@example.com', E'- Wie groß ist das Team, das ich führen würde?\n- Wie ist die Homeoffice-Regelung für Führungskräfte?'),
  ('thomas.richter@example.com', E'- Wie sieht die Einarbeitung in die Kanzleiarbeit nach dem Wechsel aus der Industrie aus?\n- Gibt es Mandate mit Konzern- oder IFRS-Bezug?'),
  ('nadine.wolf@example.com', E'- Ist eine 4-Tage-Woche bei vollem Stundenumfang möglich?'),
  ('michael.schulz@example.com', E'- Ist die Stelle unbefristet?\n- Wie schnell wäre ein Start möglich?'),
  ('anna.lehmann@example.com', E'- Wie ist der Weg zur Partnerschaft konkret geregelt (Zeitrahmen, Voraussetzungen)?'),
  ('christian.braun@example.com', E'- Ab wann übernehme ich eigene Mandate als Berufsträger?\n- Wie viele Tage Homeoffice sind möglich?'),
  ('petra.zimmermann@example.com', E'- Ist eine Teilzeit von 80 % möglich?\n- Wie groß ist der Anteil an Erbschaft- und Schenkungsteuer-Mandaten?')
) as v(email, fragen)
where c.email = v.email and c.offene_fragen is null;
