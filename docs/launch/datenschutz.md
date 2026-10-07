# Datenschutz und Recht (T-103)

Stand: 07.10.2026, aus dem Code erhoben. Keine Rechtsberatung. Vor dem Launch mit der
Datenschutzbeauftragten bzw. Kanzlei abstimmen.

## 1. Rollen

- **Endlich Mitarbeiter (Agentur)** ist Verantwortlicher für Kandidatendaten aus den eigenen
  Kampagnen (Meta, Kanzleistelle24, Leadtable).
- **Kanzleien (Portal)** erhalten Kandidatendaten erst nach Zuordnung. Je nach Vertrag sind sie
  eigene Verantwortliche (Übermittlung mit Einwilligung) oder Auftragsverarbeiter. Das muss
  im Kundenvertrag festgelegt werden.
- **Kandidaten** willigen im Formular (Meta Lead Ads, Kanzleistelle24) in die Weitergabe an
  passende Kanzleien ein. Der Text der Einwilligung muss das abdecken: Prüfen und ablegen.

## 2. Dienstleister (Auftragsverarbeitung)

| Dienst | Wofür | Daten | Sitz / Server | AVV | Drittland |
|--------|-------|-------|---------------|-----|-----------|
| Supabase | Datenbank, Login, Dateien | alle | Region des Projekts prüfen (EU?) | ☐ DPA im Dashboard | USA-Firma, SCC/DPF |
| Cloudflare | Hosting (Workers), DNS | alle Anfragen, IP | weltweit | ☐ DPA (Self-Serve) | USA, DPF |
| Brevo | Mailversand, Antwort-Eingang | Name, E-Mail, Mailinhalt | Frankreich/EU | ☐ DPA in Brevo-Konto | – |
| Anthropic | Gesprächszusammenfassung, KI-Felderkennung | Gesprächsnotizen, Formularantworten | USA | ☐ DPA / Commercial Terms | USA, SCC |
| Close | CRM, Besprechungen | Kanzlei-Ansprechpartner, Gesprächsnotizen | USA | ☐ DPA | USA, DPF |
| Meta | Lead Ads | Kandidaten-Formulardaten | Irland/USA | ☐ Lead-Ads-Bedingungen | USA |
| Leadtable | Leadimport (Altbestand) | Kandidatendaten | DE? | ☐ AVV | prüfen |
| Kanzleistelle24 (eigenes Supabase) | Stellenbörse | Kanzlei- und Stellendaten (keine Kandidaten) | wie oben | intern | – |
| OpenStreetMap (Kacheln, Nominatim) | Karte, PLZ→Koordinaten | IP der Nutzer (Kacheln), PLZ (Geocoding) | UK | nicht nötig, in DSE nennen | UK (Angemessenheit) |
| Zapier | Close → gewonnene Kunden | Kanzleidaten | USA | ☐ DPA | USA, DPF |

Schriften (`next/font/google`) werden beim Build eingebunden und vom eigenen Server
ausgeliefert. Es gibt keine Verbindung zu Google. Es gibt kein Tracking und keine Analyse-Cookies.

## 3. Cookies und Speicher im Browser

- Supabase-Login-Cookies sind technisch notwendig und brauchen keine Einwilligung.
- `localStorage` speichert nur Ansichtseinstellungen (Spalten, Seitengröße, Seitenleiste) und
  keine personenbezogenen Daten.
- Ein Cookie-Banner ist damit nicht nötig. Die Datenschutzerklärung muss die Login-Cookies
  aber nennen.

## 4. Pflichtseiten

- [ ] Impressum unter Login und Portal verlinken
- [ ] Datenschutzerklärung (App-spezifisch: Portal-Nutzer, Kandidaten) unter Login und Portal verlinken
- [ ] Datenschutzhinweis in jeder Kandidaten-Mail (Fußzeile) mit Link
- [ ] Hinweis nach Art. 14 DSGVO an Kandidaten, deren Daten nicht direkt erhoben wurden
  (Leadtable-Altbestand). Die Eingangsbestätigung kann das übernehmen.

## 5. Betroffenenrechte

| Recht | Heute | Offen |
|-------|-------|-------|
| Auskunft | Kandidatenprofil + Lebenslauf-Export | Export aller Daten (Verlauf, Mails, Zuordnungen) |
| Löschung | Kandidat löschen im Dashboard (Dateien im Storage werden mit gelöscht) | Kopien bei Brevo, Close und Meta separat löschen |
| Berichtigung | Bearbeiten im Profil | – |
| Widerspruch / Abmeldung | – | Abmeldelink in Kandidaten-Mails |

## 6. Löschfristen

- [ ] Frist für abgelehnte/inaktive Kandidaten festlegen (üblich 6 Monate nach Abschluss).
  Danach automatisch löschen oder anonymisieren (Cronjob, eigene Aufgabe).
- [ ] `cron_job_runs` wird nach 30 Tagen gelöscht (umgesetzt).
- [ ] Close-Gesprächszusammenfassungen: Rohtext in `close_meeting_summaries` nach der Verarbeitung leeren?

## 7. Technische Maßnahmen (TOM), bereits umgesetzt

- Zeilenbasierte Zugriffsrechte (RLS) auf allen Tabellen. Ohne Login ist keine Tabelle lesbar
  oder beschreibbar (geprüft 07.10.2026, 37 Tabellen).
- Portal und Dashboard sind getrennt. Kanzleien sehen nur ihre zugeordneten, vorqualifizierten Kandidaten.
- Webhooks sind signiert (Meta, Close) bzw. per Geheimnis abgesichert (Brevo, Zapier, Cron).
- Rate-Limit für Login, „Passwort vergessen“ und Fehlermeldungen.
- HTTPS mit HSTS, X-Frame-Options DENY, nosniff.
- Kein Gehalt an Kanzleistelle24, anonymisierter Lebenslauf für Erstkontakt.

## 8. Vom Team zu erledigen

1. AVVs aus der Tabelle oben abschließen bzw. herunterladen und ablegen.
2. Verzeichnis von Verarbeitungstätigkeiten um „Kandidatenwerk“ ergänzen.
3. URLs für Impressum und Datenschutzerklärung liefern. Die Links im Login, im Portal und in den
   Mails baue ich danach ein.
4. Löschfrist festlegen.
