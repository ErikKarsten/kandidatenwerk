# Pilotphase (T-107)

Zwei bis drei Kanzleien nutzen das Portal vier Wochen lang begleitet, bevor alle Kunden
eingeladen werden.

## Auswahl

- Kanzleien mit aktiver Kampagne und regelmäßig neuen Kandidaten
- mindestens eine Kanzlei mit wenig Technik-Erfahrung
- Ansprechpartner, die Rückmeldung geben wollen

## Ablauf

| Woche | Was | Wer |
|-------|-----|-----|
| 0 | Abnahmetests auf Staging bestanden, Überwachung aktiv, Datenschutzseiten verlinkt | Team |
| 0 | Pilotkanzleien per „Einladung senden“ einladen, 15-Minuten-Einführung per Video | KAM |
| 1 | Kurz nachfragen: Login geklappt? Mails angekommen? | KAM |
| 2 | Feedback-Gespräch (Fragen unten) | KAM |
| 3 | Gesammelte Punkte umsetzen | Entwicklung |
| 4 | Abschlussgespräch, Freigabe für alle Kunden | Team |

## Feedback-Fragen

1. Wie oft haben Sie das Portal genutzt? Wofür?
2. Haben Sie Kandidaten schnell gefunden und verstanden?
3. Hat die Mail „Neuer Kandidat“ Sie rechtzeitig erreicht? Landete sie im Spam?
4. Was hat gefehlt, was war überflüssig?
5. Hatten Sie Probleme beim Anmelden?
6. Würden Sie Kollegen in der Kanzlei einen Zugang geben?

## Kennzahlen während des Piloten

- Anteil der Kanzleien, die sich angemeldet haben (Ziel: alle)
- Zeit zwischen Zuordnung und erstem Status durch die Kanzlei
- Fehlermeldungen und Uptime-Alarme (Ziel: keine kritischen)
- Bounces bei Brevo (Ziel: < 2 %)

## Abbruchkriterien

Rollout stoppen, wenn eine Kanzlei Kandidaten sieht, die nicht ihr zugeordnet sind, wenn
Mails an falsche Empfänger gehen oder wenn Daten verloren gehen. Dann gilt `notfallplan.md`.
