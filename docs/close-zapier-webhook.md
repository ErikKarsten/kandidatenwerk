# Close → Zapier → Kandidatenwerk

Gewonnene Kunden aus Close werden über Zapier an Kandidatenwerk übergeben (Paket 10).

## Zapier-Schritt einrichten

- App: **Webhooks by Zapier**, Event **POST**
- URL: `https://kandidatenwerk.kanzleistelle24.de/api/webhooks/close-won`
- Payload Type: **json**
- Headers: `x-webhook-secret` = Wert von `CLOSE_WEBHOOK_SECRET` (Cloudflare-Secret)

## Felder (Data)

Pflicht sind nur `close_lead_id` und `firma`. Alles andere ist optional – was fehlt,
ergänzt der Key Account Manager im Kanzleiprofil.

| Feld | Inhalt |
|---|---|
| `close_lead_id` | Lead-ID aus Close (z.B. `lead_abc…`) – **Pflicht** |
| `close_status` | Status, der den Zap ausgelöst hat: `Folgebesprechung zum SC vereinbart` oder `Gewonnen` |
| `close_url` | Link zum Lead in Close (optional – sonst `https://app.close.com/lead/<ID>/`) |
| `firma` | Name der Kanzlei – **Pflicht** |
| `website`, `telefon`, `email` | Allgemeine Kontaktdaten |
| `strasse`, `plz`, `ort` | Adresse (PLZ = Standort für die Karte/das Matching) |
| `ansprechpartner_name`, `ansprechpartner_email`, `ansprechpartner_telefon`, `ansprechpartner_position` | Wird als Kontakt angelegt |
| `vertragsstart` | `2026-10-01` oder `01.10.2026` |
| `laufzeit_monate` | Zahl, z.B. `12` |
| `key_account_manager_email` | E-Mail des KAM (muss ein Team-Mitglied in Kandidatenwerk sein) |
| `vertriebsnotizen` | Notizen aus dem Vertrieb |
| `kurzbeschreibung`, `intro`, `mitarbeiterzahl`, `standorte`, `mandantenstruktur`, `software`, `arbeitszeiten`, `homeoffice`, `ansprechpartner_bewerbung` | Kanzleiprofil |
| `benefits` | Liste, getrennt durch Komma, Semikolon oder Zeilenumbruch |
| `painpoints` | Warum die Kanzlei mit uns arbeitet (nur intern) |
| `ziele_zusammenarbeit` | Ziele/Erwartungen an die Zusammenarbeit (nur intern) |
| `stellen_json` | Mehrere Stellen als JSON-Liste, z.B. `[{"titel":"Steuerfachangestellte (m/w/d)","berufsbild":"Steuerfachangestellte","plz":"50667","ort":"Köln","umkreis_km":25,"arbeitszeit":"Vollzeit","berufserfahrung":"ab 2 Jahre","software":"DATEV","gehalt":"45.000–52.000 €","start":"ab sofort","aufgaben":"…","anforderungen":"…"}]` |
| `stelle_titel` | Gesuchte Stelle, z.B. `Steuerfachangestellte (m/w/d)` |
| `stelle_berufsbild`, `stelle_plz`, `stelle_ort`, `stelle_umkreis_km`, `stelle_arbeitszeit`, `stelle_berufserfahrung`, `stelle_software`, `stelle_gehalt`, `stelle_start`, `stelle_aufgaben`, `stelle_anforderungen` | Details zur Stelle |

## Zwei Auslöser, ein Kunde

Der Zap läuft bei **beiden** Status: „Folgebesprechung zum SC vereinbart“ und „Gewonnen“.
Kandidatenwerk erkennt den Kunden an der `close_lead_id` – kommt erst die Folgebesprechung
und später „Gewonnen“, wird nur der Status aktualisiert, nie ein zweiter Kunde angelegt
(auch nicht, wenn beide Aufrufe fast gleichzeitig ankommen).

## Verhalten

1. Kunde wird über `close_lead_id` gefunden, sonst über einen eindeutig gleichen
   Firmennamen (Rechtsform/Schreibweise egal), sonst neu angelegt (Phase „Onboarding“).
2. Es werden nur **leere** Felder gefüllt – von Hand gepflegte Angaben bleiben.
3. Kontakt und Stelle werden nur ergänzt, wenn noch nicht vorhanden.
4. Im Projekt-Reiter erscheint ein Eintrag, was übernommen wurde.
5. Antwort an Zapier: `{ ok, clientId, outcome: angelegt | verknuepft | aktualisiert, filled }`;
   fehlende Pflichtfelder → HTTP 422.
