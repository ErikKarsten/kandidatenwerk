-- Bereinigt Kandidaten mit verdoppeltem E-Mail-Feld ("erika@example.com
-- erika@example.com") - ein Datenqualitätsartefakt, das Leadtable bei manchen Leads so
-- zurückliefert (Root-Cause-Audit vom 24.09.2026, u.a. Fälle Erika Sadzanski/Julia May,
-- Kampagne "Brausnchweig - SFA"). leadtable-import.ts bereinigt das E-Mail-Feld ab jetzt
-- selbst (cleanLeadtableEmail) für neue/aktualisierte Datensätze - diese Migration räumt
-- einmalig den bereits bestehenden Bestand auf. Betrifft nur Kandidaten mit
-- source = 'leadtable' und einer E-Mail, die aus genau zwei identischen (case-
-- insensitiv), durch Leerzeichen getrennten Hälften besteht - kein Risiko für
-- eigenständig unterschiedliche E-Mail-Werte.
update public.candidates
set email = split_part(trim(email), ' ', 1)
where source = 'leadtable'
  and email is not null
  and array_length(regexp_split_to_array(trim(email), '\s+'), 1) = 2
  and lower(split_part(trim(email), ' ', 1)) = lower(split_part(trim(email), ' ', 2));
