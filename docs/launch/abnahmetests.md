# Abnahmetests nach Rolle (T-100)

Vor jedem größeren Release einmal komplett durchgehen, **auf Staging** (siehe `staging.md`).
Jede Zeile abhaken; Fehler direkt über „Fehler melden“ oder als Atlas-Aufgabe erfassen.
Testkonten aus `scripts/staging-seed.ts`: Admin, Portal-Zugang „Staging Musterkanzlei“,
Kandidaten Anna (neu), Ben (vorqualifiziert), Clara (in Kontakt).

Ergebnis je Zeile: ✅ ok · ⚠️ geht, aber unschön · ❌ Fehler

## 1. Agentur-Admin

| # | Ablauf | Erwartung | Ergebnis |
|---|--------|-----------|----------|
| A1 | Anmelden, abmelden, „Passwort vergessen“ | Mail kommt, Link setzt neues Passwort, Login klappt | |
| A2 | Team-Mitglied einladen (ohne Telefon/Foto) | Einladung kommt an, Mitglied kann sich anmelden | |
| A3 | Einstellungen > Mein Konto: Logo hochladen | Logo erscheint in der nächsten Mail | |
| A4 | Einstellungen > Felder: Feld umbenennen, Pflicht setzen, eigenes Feld anlegen | Änderung wirkt sofort im Kanzlei- bzw. Stellenprofil | |
| A5 | Einstellungen > E-Mail-Vorlagen: Vorlage ändern, Set anwenden | Kampagne übernimmt Vorlagen ausgeschaltet | |
| A6 | Eingangsbestätigung einschalten, Kandidat aus Kanzleistelle24/Meta simulieren | genau eine Bestätigung pro Kandidat | |
| A7 | Fehlermeldungen: Meldung ansehen, Status ändern | nur eigene Agentur sichtbar | |

## 2. Agentur-Mitarbeiter

| # | Ablauf | Erwartung | Ergebnis |
|---|--------|-----------|----------|
| M1 | Kandidat manuell anlegen | erscheint in Liste, Karte und Kampagne | |
| M2 | Status Anna: neu → vorqualifiziert | Verlaufseintrag, Status-Automatisierung feuert (wenn aktiv) | |
| M3 | Anna (neu) einer Kanzlei zuordnen | wird verhindert: nur vorqualifizierte | |
| M4 | Ben der Staging Musterkanzlei zuordnen | Mail „Neuer Kandidat“ an alle Portal-Zugänge, Link öffnet Profil | |
| M5 | Kommunikation: Mail an Clara schicken, darauf antworten | Antwort erscheint im Reiter Kommunikation | |
| M6 | Lebenslauf: vollständig und anonymisiert exportieren | anonym ohne Name, Kontakt, genaue PLZ; druckt sauber auf A4 | |
| M7 | Kunde: Kanzleiprofil ausfüllen, zweiten Standort anlegen | Pflichtprüfung zeigt fehlende Angaben, Karte zeigt beide Standorte | |
| M8 | Stelle mit Textbausteinen füllen (≥ 4 Aufgaben, ≥ 3 Anforderungen) | Profil lässt sich abschließen | |
| M9 | Kunde > Kanzleistelle24 veröffentlichen | Firma und Stellen auf Kanzleistelle24, **kein Gehalt** | |
| M10 | Kunde > Ansprechpartner mit E-Mail anlegen | Portal-Zugang „angelegt“, Einladung per Knopf | |
| M11 | Passwort-Link „kopieren“ und „senden“ | beide Links funktionieren genau einmal | |
| M12 | Aufgabe anlegen, Fälligkeit morgen | Erinnerung am Folgetag morgens (6 Uhr UTC) | |
| M13 | Dublettenprüfung: Kandidat mit gleicher E-Mail anlegen | Hinweis auf Dublette | |

## 3. Kanzlei (Portal)

| # | Ablauf | Erwartung | Ergebnis |
|---|--------|-----------|----------|
| K1 | Einladung annehmen, Passwort setzen | Login landet im Portal, nie im Dashboard | |
| K2 | `/dashboard` direkt aufrufen | Umleitung ins Portal | |
| K3 | Dashboard: Ansprechpartner (KAM) mit Foto, Mail, Telefon | korrekt | |
| K4 | Kandidatenliste | nur vorqualifizierte zugeordnete Kandidaten, keine fremden | |
| K5 | Kandidat öffnen: Beschreibung, Felder, Lebenslauf | keine internen Notizen sichtbar | |
| K6 | Status setzen: Vorstellungsgespräch → Eingestellt | Agentur sieht Änderung im Verlauf | |
| K7 | Notiz schreiben | Agentur sieht Notiz | |
| K8 | URL eines fremden Kandidaten aufrufen (ID austauschen) | 404 | |
| K9 | Handy (iPhone/Android): Login, Liste, Kandidat, Status | bedienbar ohne Zoomen | |

## 4. Automatische Abläufe (nach 24 h Staging-Betrieb prüfen)

| # | Ablauf | Erwartung | Ergebnis |
|---|--------|-----------|----------|
| S1 | `/api/health` | `{"ok":true}` | |
| S2 | Cronjobs (Tabelle `cron_job_runs`) | alle Jobs mit ok = true, keine Lücken | |
| S3 | Close-Besprechung mit Notetaker beim verknüpften Kunden | Kommentar „Gespräch“ mit Zusammenfassung | |
| S4 | Meta-Testlead (Lead Ads Testing Tool) | Kandidat angelegt, Eingangsbestätigung | |

## Freigabe

| Rolle | Getestet von | Datum | Freigabe |
|-------|--------------|-------|----------|
| Admin | | | |
| Mitarbeiter | | | |
| Kanzlei (Pilotkunde) | | | |
