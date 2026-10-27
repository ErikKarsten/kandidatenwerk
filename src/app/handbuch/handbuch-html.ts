// Benutzerhandbuch für das Team (Paket 90), ausgeliefert unter /handbuch (nur Team-Zugänge,
// siehe route.ts). Eigenständige Seite mit eigenem Stil, damit sie unabhängig vom
// Dashboard-Layout lesbar und druckbar bleibt. Inhalt bei neuen Funktionen hier pflegen.
export const HANDBUCH_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kandidatenwerk Handbuch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: Handbuch mit fester Inhaltsleiste links (ab Tablet), Kapitel als ruhige Abschnitte, Begriffe aus der App als Chips. */
:root {
  --bg: #f0f4f8;
  --paper: #ffffff;
  --ink: #16202e;
  --ink-soft: #4a5768;
  --ink-faint: #7b8797;
  --line: #dde3ea;
  --accent: #1e56a0;
  --accent-soft: #1e56a014;
  --why-bg: #eef4fb;
  --why-line: #c9dbf0;
  --warn-bg: #fff8e6;
  --warn-line: #f3d68a;
  --warn-ink: #7a5300;
  --font-display: "Manrope", "Segoe UI", system-ui, sans-serif;
  --font-body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  --st-neu: #1d4ed8; --st-vq: #15803d; --st-pruef: #b45309; --st-ne: #c2410c; --st-ne2: #b91c1c; --st-kontakt: #0f766e; --st-suche: #6d28d9; --st-ab: #6b7280;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1620; --paper: #161f2b; --ink: #e6ebf2; --ink-soft: #b3bfcd; --ink-faint: #8794a5; --line: #2a3646;
    --accent: #7fb0ec; --accent-soft: #7fb0ec1f; --why-bg: #17263a; --why-line: #27415f; --warn-bg: #2a2212; --warn-line: #5b4718; --warn-ink: #f0cf7e;
    --st-neu: #8fb3ff; --st-vq: #6fd39a; --st-pruef: #f2b766; --st-ne: #f59d6b; --st-ne2: #f58b8b; --st-kontakt: #5fd0c1; --st-suche: #b9a1ff; --st-ab: #a3acb8;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0f1620; --paper: #161f2b; --ink: #e6ebf2; --ink-soft: #b3bfcd; --ink-faint: #8794a5; --line: #2a3646;
  --accent: #7fb0ec; --accent-soft: #7fb0ec1f; --why-bg: #17263a; --why-line: #27415f; --warn-bg: #2a2212; --warn-line: #5b4718; --warn-ink: #f0cf7e;
  --st-neu: #8fb3ff; --st-vq: #6fd39a; --st-pruef: #f2b766; --st-ne: #f59d6b; --st-ne2: #f58b8b; --st-kontakt: #5fd0c1; --st-suche: #b9a1ff; --st-ab: #a3acb8;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
.back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; text-decoration: none; color: var(--accent); }
.back:hover { text-decoration: underline; }
body { background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 17px; line-height: 1.6; }
a { color: var(--accent); }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.wrap { max-width: 1180px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 32px 64px; display: grid; grid-template-columns: 1fr; gap: 28px; }
@media (min-width: 900px) { .wrap { grid-template-columns: 260px minmax(0, 1fr); gap: 40px; } }

/* Kopf */
.head { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
h1 { font-family: var(--font-display); font-weight: 800; font-size: clamp(30px, 4.4vw, 44px); line-height: 1.1; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
.lede { margin: 0; max-width: 68ch; color: var(--ink-soft); font-size: 18px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 14px; color: var(--ink-faint); }

/* Inhaltsverzeichnis */
nav.toc { align-self: start; }
@media (min-width: 900px) { nav.toc { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 20px); max-height: calc(100vh - 40px); overflow: auto; } }
.toc details { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.toc summary { font-family: var(--font-display); font-weight: 700; font-size: 14px; cursor: pointer; list-style: none; }
.toc summary::-webkit-details-marker { display: none; }
.toc ol { margin: 10px 0 0; padding: 0; list-style: none; counter-reset: k; display: flex; flex-direction: column; gap: 2px; }
.toc li { counter-increment: k; }
.toc a { display: flex; gap: 8px; text-decoration: none; color: var(--ink-soft); font-size: 14.5px; padding: 4px 6px; border-radius: 6px; }
.toc a::before { content: counter(k); font-family: var(--font-mono); font-size: 12px; color: var(--ink-faint); min-width: 18px; padding-top: 2px; }
.toc a:hover { background: var(--accent-soft); color: var(--accent); }

/* Kapitel */
main { min-width: 0; display: flex; flex-direction: column; gap: 22px; counter-reset: chap; }
section.chap { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 26px clamp(18px, 3vw, 34px); counter-increment: chap; scroll-margin-top: 16px; }
section.chap > h2 { font-family: var(--font-display); font-weight: 700; font-size: 25px; margin: 0 0 6px; line-height: 1.2; text-wrap: balance; display: flex; gap: 12px; align-items: baseline; }
section.chap > h2::before { content: counter(chap, decimal-leading-zero); font-family: var(--font-mono); font-size: 14px; font-weight: 500; color: var(--accent); }
.kicker { margin: 0 0 16px; color: var(--ink-soft); max-width: 68ch; }
h3 { font-family: var(--font-display); font-weight: 700; font-size: 18px; margin: 22px 0 6px; }
p, li { max-width: 70ch; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 3px 0; }
.path { font-family: var(--font-mono); font-size: 14px; background: var(--accent-soft); color: var(--accent); padding: 1px 6px; border-radius: 5px; white-space: nowrap; }
.ui { font-weight: 600; }

/* Hinweise */
.why, .warn { border-radius: 10px; padding: 12px 16px; margin: 14px 0; max-width: 72ch; }
.why { background: var(--why-bg); border: 1px solid var(--why-line); }
.warn { background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--warn-ink); }
.why b, .warn b { font-family: var(--font-display); font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; display: block; margin-bottom: 2px; }
.why p, .warn p { margin: 4px 0; }

/* Tabellen */
.table { overflow-x: auto; margin: 12px 0; border: 1px solid var(--line); border-radius: 10px; }
table { border-collapse: collapse; width: 100%; min-width: 520px; font-size: 15.5px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-family: var(--font-display); font-size: 13px; letter-spacing: 0.03em; color: var(--ink-faint); font-weight: 700; background: var(--bg); }
tr:last-child td { border-bottom: none; }

/* Status-Chips wie in der App */
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.chip { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid currentColor; }
.chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

/* Zeitleiste Beispielkandidaten */
.timeline { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 14px 0; max-width: 640px; }
.timeline div { border: 1px solid var(--line); border-radius: 8px; padding: 8px; text-align: center; font-variant-numeric: tabular-nums; }
.timeline strong { display: block; font-family: var(--font-display); font-size: 18px; color: var(--accent); }
.timeline span { font-size: 13px; color: var(--ink-faint); }

/* Ablauf */
.flow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; }
.flow span { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 15px; }
.flow i { font-style: normal; color: var(--ink-faint); }

dl.faq dt { font-family: var(--font-display); font-weight: 700; margin-top: 14px; }
dl.faq dd { margin: 4px 0 0; max-width: 70ch; color: var(--ink-soft); }
footer.end { color: var(--ink-faint); font-size: 14px; padding-top: 6px; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="head">
    <a class="back" href="/dashboard">← Zurück zu Kandidatenwerk</a>
    <span class="eyebrow">Kandidatenwerk · Benutzerhandbuch</span>
    <h1>Kandidatenwerk Handbuch</h1>
    <p class="lede">Wie Bewerber ins System kommen, wie ihr sie vorqualifiziert und Kanzleien zuordnet, und warum Kandidatenwerk an einigen Stellen genau so funktioniert. Für das Team von Endlich Mitarbeiter, mit einem eigenen Kapitel zum Kundenportal der Kanzleien.</p>
    <div class="meta"><span>Stand: 27.10.2026</span><span>Gilt für alle Rollen; was nur Admins oder bestimmte Teams sehen, ist jeweils vermerkt.</span></div>
  </header>

  <nav class="toc" aria-label="Inhalt">
    <details open>
      <summary>Inhalt</summary>
      <ol>
        <li><a href="#grundidee">Die Grundidee</a></li>
        <li><a href="#rollen">Rollen, Teams und Sichtbarkeit</a></li>
        <li><a href="#eingang">Wie Kandidaten hereinkommen</a></li>
        <li><a href="#kandidat">Mit einem Kandidaten arbeiten</a></li>
        <li><a href="#status">Status und was sie auslösen</a></li>
        <li><a href="#lebenslauf">Lebenslauf</a></li>
        <li><a href="#zuordnen">Kandidaten zuordnen</a></li>
        <li><a href="#kunden">Kunden und Projekt</a></li>
        <li><a href="#kampagnen">Kampagnen</a></li>
        <li><a href="#automatisierungen">Automatisierungen und Mails</a></li>
        <li><a href="#nachkampagnen">Kandidaten nach Kampagnen</a></li>
        <li><a href="#karte">Karte</a></li>
        <li><a href="#aufgaben">Aufgaben</a></li>
        <li><a href="#portal">Kundenportal der Kanzleien</a></li>
        <li><a href="#beispiele">Beispielkandidaten</a></li>
        <li><a href="#einstellungen">Einstellungen</a></li>
        <li><a href="#hintergrund">Was im Hintergrund läuft</a></li>
        <li><a href="#faq">Häufige Fragen</a></li>
      </ol>
    </details>
  </nav>

  <main>
    <section class="chap" id="grundidee">
      <h2>Die Grundidee</h2>
      <p class="kicker">Kandidatenwerk sammelt Bewerber für Steuerkanzleien an einem Ort, das Team spricht mit ihnen und bringt die passenden zur passenden Kanzlei.</p>
      <div class="flow" aria-label="Ablauf">
        <span>Bewerbung kommt herein</span><i>→</i><span>Team ruft an und qualifiziert</span><i>→</i><span>Status „Vorqualifiziert“</span><i>→</i><span>Zuordnung zu einer Live-Kanzlei</span><i>→</i><span>Kanzlei sieht den Kandidaten im Portal</span>
      </div>
      <p>Die Seitenleiste führt zu den Bereichen <span class="ui">Dashboard</span>, <span class="ui">Kunden</span>, <span class="ui">Alle Kandidaten</span>, <span class="ui">Kandidaten nach Kampagnen</span>, <span class="ui">Aufgaben</span>, <span class="ui">Karte</span> und <span class="ui">Einstellungen</span>. Unten in der Seitenleiste liegen der <span class="ui">Anonymisierte Modus</span>, der Knopf <span class="ui">Fehler melden</span> und dieses <span class="ui">Handbuch</span>.</p>
      <div class="why"><b>Warum</b><p>Kanzleien sollen nur Kandidaten sehen, mit denen wir schon gesprochen haben. Deshalb gilt überall dieselbe Regel: Eine Kanzlei bekommt einen Kandidaten erst, wenn er vorqualifiziert und ihr zugeordnet ist. Alles davor ist interne Arbeit des Teams.</p></div>
    </section>

    <section class="chap" id="rollen">
      <h2>Rollen, Teams und Sichtbarkeit</h2>
      <p class="kicker">Die Rolle regelt die Rechte, das Team regelt Zuständigkeiten und ein paar Sonderrechte.</p>
      <div class="table"><table>
        <thead><tr><th>Wer</th><th>Was er sieht und darf</th></tr></thead>
        <tbody>
          <tr><td><span class="ui">Admin</span></td><td>Alles. Verwaltet Team, Felder und Vorlagen. Sieht Musterdatensätze mit Kennzeichnung.</td></tr>
          <tr><td><span class="ui">Mitarbeiter</span></td><td>Alle Kandidaten und Kunden außer Active Sourcing. Musterdatensätze erscheinen weder in „Alle Kandidaten“ noch auf der Karte.</td></tr>
          <tr><td>Team <span class="ui">Sales Recruiting</span></td><td>Bekommt Team-Aufgaben für Sales Recruiting.</td></tr>
          <tr><td>Team <span class="ui">Sales Recruiting + Active Sourcing</span></td><td>Wie Sales Recruiting, zusätzlich: Active-Sourcing-Kandidaten sehen und anlegen.</td></tr>
          <tr><td>Team <span class="ui">Vertrieb</span></td><td>Sieht Musterdatensätze wie die Admins, in der Liste und auf der Karte, und darf sie anlegen.</td></tr>
          <tr><td>Kanzlei im <span class="ui">Kundenportal</span></td><td>Nur die eigenen, zugeordneten und vorqualifizierten Kandidaten. Mehr dazu im Kapitel <a href="#portal">Kundenportal</a>.</td></tr>
        </tbody>
      </table></div>
      <p>Team zuweisen: <span class="path">Einstellungen → Team</span>.</p>
      <h3>Anonymisierter Modus</h3>
      <p>Der Schalter unten in der Seitenleiste blendet Namen, Kontaktdaten und interne Angaben aus. Kandidaten erscheinen dann mit einer Kennung statt mit Namen, der Lebenslauf nur anonymisiert.</p>
      <div class="why"><b>Warum</b><p>So könnt ihr einer Kanzlei im Gespräch den Bildschirm zeigen, ohne fremde Bewerberdaten preiszugeben.</p></div>
      <h3>Active Sourcing</h3>
      <p>Kandidaten aus dem Active Sourcing sehen nur Admins und das Team „Sales Recruiting + Active Sourcing“. Für alle anderen sind sie nirgends zu finden: nicht in der Liste, nicht auf der Karte, nicht über einen direkten Link. Das ist in der Datenbank selbst gesperrt, nicht nur in der Oberfläche.</p>
    </section>

    <section class="chap" id="eingang">
      <h2>Wie Kandidaten hereinkommen</h2>
      <p class="kicker">Es gibt fünf Wege. Wichtig ist vor allem, ob eine Meta-Kampagne mit „KS24“ beginnt oder nicht.</p>
      <h3>1. KS24-Kampagnen bei Meta</h3>
      <p>Jede laufende Lead-Kampagne im Werbekonto, deren Name mit <span class="ui">KS24</span> beginnt, legt Kandidatenwerk stündlich als Lead-Kampagne an. Ihre Leads kommen sofort über den Webhook, spätestens nach 30 Minuten über den Abgleich, und landen in <span class="ui">Alle Kandidaten</span> mit Status <span class="ui">Neu</span>. Die Antworten aus dem Formular werden automatisch auf die Zusatzfelder verteilt. Fehlt der Wohnort, schätzt Kandidatenwerk die PLZ aus dem Werbegebiet.</p>
      <h3>2. Eigene Meta-Kampagne einer Kanzlei</h3>
      <p>Kampagnen ohne „KS24“ im Namen laufen für eine bestimmte Kanzlei. Ihr Formular verknüpft ihr in der Kanzlei-Kampagne unter <span class="path">Einrichtung → Lead-Formular aus eigener Meta-Kampagne</span>.</p>
      <ul>
        <li>Die Leads stehen nur in dieser Kampagne, direkt in der Liste im Reiter <span class="ui">Kandidaten</span>, mit Status, E-Mail, Ausbildung und Eingangsdatum. Darunter steht „Noch nicht bei der Kanzlei“. In „Alle Kandidaten“, auf der Karte und bei anderen Kanzleien tauchen sie nicht auf.</li>
        <li>Ihr ruft sie im Namen der Kanzlei an und setzt den Status direkt in der Liste. Mit <span class="ui">Vorqualifiziert</span> gehen sie automatisch an die Kanzlei, ein Klick auf „Zuordnen“ ist nicht nötig. Ist die Kanzlei noch nicht live, steht das am Lead. Sobald sie live ist, gebt ihr ihn mit <span class="ui">An die Kanzlei geben</span> weiter.</li>
        <li>Steht der Lead schon in Leadtable, übernimmt Kandidatenwerk beim Eingang den Stand von dort: Status (nur wenn er noch „Neu“ ist), Notizen und leere Zusatzfelder. Im Verlauf steht dann „Aus Leadtable übernommen …“. An die Kanzlei geht er dadurch nicht automatisch.</li>
        <li>Bewirbt sich über das Formular jemand, der schon ohne Kampagne in Kandidatenwerk steht, holt Kandidatenwerk ihn in diese Kampagne.</li>
        <li>Beim Verknüpfen ist <span class="ui">Keine Eingangsbestätigung an Leads dieser Kampagne</span> vorausgewählt.</li>
        <li>Mit <span class="ui">Testlead anfordern</span> prüft ihr die Verbindung. Kurz danach erscheint „Verbindung zuletzt per Webhook bestätigt“.</li>
      </ul>
      <div class="why"><b>Warum</b><p>Diese Bewerber haben sich auf eine Anzeige der Kanzlei beworben, nicht auf KS24. Sie gehören der Kanzlei und sollen keiner anderen angeboten werden. Eine Eingangsbestätigung von Kanzleistelle24 würde sie verwirren.</p></div>
      <div class="warn"><b>Voraussetzung</b><p>Die Facebook-Seite der Kanzlei muss im Business Manager unserem Meta-Systemnutzer freigegeben sein. Sonst kommen keine Leads an. Die Formularauswahl zeigt das mit „Seite nicht freigegeben“.</p></div>
      <h3>3. Kanzleistelle24</h3>
      <p>Bewerbungen über Kanzleistelle24.de kommen stündlich herein.</p>
      <h3>4. Von Hand anlegen</h3>
      <p><span class="path">Alle Kandidaten → Kandidat anlegen</span>. Wählt ihr eine Kanzlei-Kampagne, wird der Kandidat ihr gleich zugeordnet. Dafür muss der Status „Vorqualifiziert“ sein und die Kanzlei live. Wer im Active-Sourcing-Team oder Admin ist, sieht zusätzlich den Haken <span class="ui">Kandidat aus Active Sourcing</span>: Herkunft und Tag werden dann „Active Sourcing“.</p>
      <h3>5. Altbestand aus Leadtable</h3>
      <p>Frühere Leadtable-Leads wurden übernommen. Ihre Notizen stehen im Verlauf unter „Leadtable-Notizen (importiert)“.</p>
      <h3>Dubletten</h3>
      <p>Kommt ein Lead mit einer E-Mail-Adresse, die es schon gibt, legt Kandidatenwerk keinen zweiten Kandidaten an. Mögliche Dubletten mit ähnlichem Namen listet <span class="path">Fehlermeldungen</span> zum Zusammenführen auf.</p>
    </section>

    <section class="chap" id="kandidat">
      <h2>Mit einem Kandidaten arbeiten</h2>
      <p class="kicker">Die Kandidatenseite hat links die Reiter, rechts Beschreibung, offene Fragen und Verlauf.</p>
      <div class="table"><table>
        <thead><tr><th>Reiter</th><th>Wofür</th></tr></thead>
        <tbody>
          <tr><td><span class="ui">Profil</span></td><td>Stammdaten und Zusatzfelder, zum Beispiel Ausbildung, Gehaltsvorstellung, Kündigungsfrist, DATEV.</td></tr>
          <tr><td><span class="ui">Dateien</span></td><td>Hochgeladene Dokumente und Anhänge aus Mail-Antworten des Kandidaten. Öffnen oder <span class="ui">Herunterladen</span>. Zugeordnete Kanzleien sehen diese Dateien im Portal.</td></tr>
          <tr><td><span class="ui">Zuordnung</span></td><td>Herkunft, bestehende Zuordnungen und Live-Kanzleien im Umkreis mit „Zuordnen“.</td></tr>
          <tr><td><span class="ui">Kommunikation</span></td><td>Mails an den Kandidaten mit Vorlagen. Antworten landen hier, mit Anhängen direkt an der Nachricht.</td></tr>
          <tr><td><span class="ui">Aufgaben</span></td><td>Aufgaben zu diesem Kandidaten.</td></tr>
        </tbody>
      </table></div>
      <h3>Beschreibung</h3>
      <p>Das ist eure Einschätzung und das Gesprächsergebnis. Schreibt hier auch die Stationen der letzten zehn Jahre hinein, möglichst mit Zeitraum, Position und Arbeitgeber, zum Beispiel <span class="path">05/2022 – aktuell · Steuerfachangestellter · Steuerkanzlei Maus, Merzenich</span>. Daraus entsteht der Werdegang im Lebenslauf.</p>
      <h3>Verlauf und Notizen</h3>
      <p>Oben im Verlauf schreibt ihr eigene Notizen, mit Schnellbausteinen wie „Angerufen – nicht erreicht“. Mit <span class="path">@Name</span> erwähnt ihr Kollegen, mit <span class="path">#</span> verknüpft ihr eine offene Aufgabe des Kandidaten. Erwähnte und Zuständige der Aufgabe bekommen eine Mail mit Link.</p>
      <div class="why"><b>Warum</b><p>So stimmt ihr euch direkt am Kandidaten ab, und alles bleibt nachvollziehbar an einer Stelle.</p></div>
      <h3>Kommunikation und Antworten</h3>
      <p>Mails aus dem Reiter Kommunikation gehen in eurem Namen raus. Antwortet der Kandidat, landet die Antwort im Kandidatenwerk, und ihr bekommt eine Kopie. Anhänge, etwa ein Lebenslauf, liegen danach automatisch unter <span class="ui">Dateien</span>.</p>
      <h3>Tags</h3>
      <p>Tags helfen beim Sortieren und Filtern. „Musterdatensatz“ sehen nur Admins und das Team Vertrieb.</p>
    </section>

    <section class="chap" id="status">
      <h2>Status und was sie auslösen</h2>
      <p class="kicker">Der Status beschreibt, wo ihr mit dem Kandidaten steht. Manche Status lösen etwas aus.</p>
      <div class="chips">
        <span class="chip" style="color: var(--st-neu)">Neu</span>
        <span class="chip" style="color: var(--st-vq)">Vorqualifiziert</span>
        <span class="chip" style="color: var(--st-pruef)">In Prüfung</span>
        <span class="chip" style="color: var(--st-ne)">Nicht erreicht</span>
        <span class="chip" style="color: var(--st-ne2)">2x nicht erreicht + Mail</span>
        <span class="chip" style="color: var(--st-kontakt)">In Kontakt</span>
        <span class="chip" style="color: var(--st-suche)">Derzeit nicht auf Suche</span>
        <span class="chip" style="color: var(--st-ab)">Abgelehnt</span>
      </div>
      <ul>
        <li><span class="ui">Vorqualifiziert</span> ist die Voraussetzung für jede Zuordnung zu einer Kanzlei und für die Anzeige auf der Karte.</li>
        <li><span class="ui">Derzeit nicht auf Suche</span> legt automatisch die Aufgabe „Kandidat erneut anrufen“ an, fällig in 6 Monaten, für die Person, die den Status setzt. Ist die Aufgabe schon offen, rückt nur ihr Termin nach hinten.</li>
        <li>Jeder Status kann in einer Kampagne eine Automatisierung auslösen, etwa eine Mail bei „Nicht erreicht“. Siehe <a href="#automatisierungen">Automatisierungen</a>.</li>
        <li>Bekommt ein zugeordneter Kandidat einen anderen Status als „Vorqualifiziert“, verschwindet er aus dem Portal der Kanzlei.</li>
      </ul>
      <p>Bei der Kanzlei hat jede Zuordnung einen eigenen Status, den auch die Kanzlei setzt: <span class="ui">Neu</span>, <span class="ui">Vorstellungsgespräch</span>, <span class="ui">Eingestellt</span>, <span class="ui">Abgelehnt</span>.</p>
    </section>

    <section class="chap" id="lebenslauf">
      <h2>Lebenslauf</h2>
      <p class="kicker">Über den Knopf <span class="ui">Lebenslauf</span> öffnet sich eine druckfertige Seite, vollständig oder anonymisiert.</p>
      <ul>
        <li><span class="ui">Vollständig</span>: mit Namen, Kontaktdaten und den Arbeitgebern mit Namen und Ort.</li>
        <li><span class="ui">Anonymisiert</span>: mit Kennung statt Namen, ohne Kontaktdaten, Arbeitgeber neutral („Steuerkanzlei, ca. 15 Mitarbeitende“), private Auszeiten nur als „Familiäre Auszeit“.</li>
        <li><span class="ui">PDF herunterladen</span> erzeugt die PDF direkt. <span class="ui">Drucken</span> ist für Papier.</li>
      </ul>
      <h3>Der Werdegang</h3>
      <p>Den beruflichen Werdegang schreibt die KI aus der Beschreibung und den Zusatzfeldern. Sie übernimmt alle genannten Stationen und ergänzt je Station typische Aufgaben. Erfunden werden keine Stationen, Abschlüsse oder Arbeitgeber.</p>
      <p>Ändert ihr die Beschreibung, entsteht der Werdegang im Hintergrund neu, spätestens nach 5 Minuten. Öffnet jemand den Lebenslauf früher, wird er beim Öffnen neu erstellt. Das dauert etwa eine Minute. Mit <span class="ui">Werdegang neu erstellen</span> stoßt ihr das jederzeit selbst an.</p>
      <div class="why"><b>Warum</b><p>Kanzleien wollen sehen, wo jemand gearbeitet hat. Die KI macht aus euren Gesprächsnotizen einen ordentlichen Werdegang, ohne dass ihr ihn abtippen müsst. Beim Speichern über den Druckdialog des Browsers kamen teils leere Seiten heraus, deshalb erzeugt Kandidatenwerk die PDF selbst.</p></div>
    </section>

    <section class="chap" id="zuordnen">
      <h2>Kandidaten zuordnen</h2>
      <p class="kicker">Zuordnen heißt: Die Kanzlei sieht den Kandidaten in ihrem Portal und wird benachrichtigt.</p>
      <h3>Regeln</h3>
      <ul>
        <li>Der Kandidat ist <span class="ui">vorqualifiziert</span>.</li>
        <li>Die Kanzlei steht in der Projektphase <span class="ui">Live</span>. Kanzleien im Onboarding oder in der Kampagnen-Vorbereitung bekommen noch keine Kandidaten.</li>
        <li>Je Kanzlei gibt es höchstens eine aktive Zuordnung pro Kandidat.</li>
        <li>Beispielkandidaten ordnet Kandidatenwerk selbst zu, von Hand geht das nicht.</li>
      </ul>
      <h3>Wo ihr zuordnet</h3>
      <ul>
        <li>Am Kandidaten im Reiter <span class="ui">Zuordnung</span>: Live-Kanzleien im Umkreis, passende Berufsbilder zuerst.</li>
        <li>In einer Kanzlei-Kampagne im Reiter <span class="ui">Passende Kandidaten</span>.</li>
        <li>Eigene Meta-Leads einer Kanzlei-Kampagne gehen von selbst an die Kanzlei, sobald ihr sie auf „Vorqualifiziert“ setzt.</li>
      </ul>
      <p>Nach dem Zuordnen schickt die Automatisierung „Neuer Kandidat für die Kanzlei“ eine Mail an die Portal-Zugänge der Kanzlei, sofern sie in der Kampagne eingeschaltet ist.</p>
    </section>

    <section class="chap" id="kunden">
      <h2>Kunden und Projekt</h2>
      <p class="kicker">Unter <span class="ui">Kunden</span> steht jede Kanzlei als Karte. Oben rechts zeigt sie „Live“, wenn die Kanzlei live ist.</p>
      <h3>Projektphasen</h3>
      <div class="table"><table>
        <thead><tr><th>Phase</th><th>Bedeutung</th></tr></thead>
        <tbody>
          <tr><td>Onboarding</td><td>Profil und Stellen werden erfasst. Noch keine Kandidaten.</td></tr>
          <tr><td>Kampagne in Vorbereitung</td><td>Anzeigen werden aufgesetzt. Beim Wechsel entsteht die Aufgabe „Kampagnenstatus prüfen“ für Elea Günther.</td></tr>
          <tr><td>Live</td><td>Kampagne läuft, Kandidaten werden zugeordnet, die Kanzlei erscheint auf der Karte.</td></tr>
          <tr><td>Pausiert / Gekündigt</td><td>Keine neuen Kandidaten.</td></tr>
        </tbody>
      </table></div>
      <h3>Reiter Projekt</h3>
      <ul>
        <li>Phase, Key Account Manager, Vertragsstart und Laufzeit. Das Vertragsende rechnet Kandidatenwerk aus.</li>
        <li>Haken <span class="ui">Kampagne über Kundenmarke</span>, wenn die Anzeigen unter Namen und Seite der Kanzlei laufen. Im Kopf des Kunden steht dann „Kampagne läuft über die Kundenmarke“.</li>
        <li>Close-Verknüpfung: Mit der Close-Lead-ID kommen Status und Gesprächszusammenfassungen aus Close herein.</li>
        <li>Das <span class="ui">Kanzleiprofil</span> mit allen Angaben für die Stellenanzeigen. Pflichtfelder, die noch fehlen, sind gelb. Hier lässt sich auch der Kundenname ändern. Ist alles da, schließt ihr das Profil vor dem Willkommensmeeting ab.</li>
        <li>Standorte, gesuchte Stellen, die Veröffentlichung auf Kanzleistelle24 und die Dateien des Kunden.</li>
      </ul>
      <h3>Kommentare</h3>
      <p>Rechts neben den Reitern stehen die Kommentare zum Kunden, mit Arten wie Notiz oder Gespräch, mit Antworten, Reaktionen, Anhängen und <span class="path">@Erwähnung</span> per Mail. Aus Punkten einer Gesprächszusammenfassung legt ihr direkt eine Aufgabe an.</p>
      <h3>Portal-Zugänge</h3>
      <p>In den Stammdaten legt ihr die Portal-Zugänge der Kanzlei an. Dort steht auch, wann sich jemand zuletzt angemeldet hat.</p>
      <h3>Termin-Modus</h3>
      <p>Beim Kunden und in Kanzlei-Kampagnen blendet der Termin-Modus alles Interne aus, damit ihr der Kanzlei im Gespräch die Seite zeigen könnt.</p>
    </section>

    <section class="chap" id="kampagnen">
      <h2>Kampagnen</h2>
      <p class="kicker">Es gibt zwei Arten: Lead-Kampagnen sind die Herkunft von Bewerbern, Kanzlei-Kampagnen sind die Stellen, denen ihr Kandidaten zuordnet.</p>
      <div class="table"><table>
        <thead><tr><th></th><th>Lead-Kampagne</th><th>Kanzlei-Kampagne</th></tr></thead>
        <tbody>
          <tr><td>Entsteht</td><td>automatisch aus KS24-Kampagnen bei Meta</td><td>beim Kunden, von Hand</td></tr>
          <tr><td>Reiter Kandidaten</td><td>alle, die sich darüber beworben haben</td><td>alle, die ihr zugeordnet sind, dazu die eigenen Meta-Leads vor der Zuordnung</td></tr>
          <tr><td>Passende Kandidaten</td><td>–</td><td>vorqualifizierte Kandidaten mit gleichem Berufsbild im Umkreis</td></tr>
        </tbody>
      </table></div>
      <h3>Einrichtung einer Kanzlei-Kampagne</h3>
      <ul>
        <li>Berufsbild, PLZ und Umkreis für das Matching, dazu weitere Standorte für zusammengeführte Stellen.</li>
        <li>Die <span class="ui">Feld-Vorlage</span> bestimmt, welche Zusatzfelder die Kanzlei im Portal und im Lebenslauf sieht.</li>
        <li>Lead-Formular aus der eigenen Meta-Kampagne der Kanzlei und der Haken zur Eingangsbestätigung, siehe <a href="#eingang">Eingang</a>.</li>
      </ul>
      <h3>Passende Kandidaten</h3>
      <p>Die Liste zeigt Name, Status, PLZ, Entfernung und Eingang. Ein Klick auf <span class="ui">Entfernung</span> oder <span class="ui">Eingang</span> sortiert, ein zweiter Klick dreht die Richtung um. Den Umkreis stellt ihr frei ein, bis deutschlandweit.</p>
    </section>

    <section class="chap" id="automatisierungen">
      <h2>Automatisierungen und Mails</h2>
      <p class="kicker">Jede Kampagne hat einen Reiter <span class="ui">Automatisierungen</span>: Mails, die bei einem Ereignis von selbst rausgehen.</p>
      <div class="table"><table>
        <thead><tr><th>Einstellung</th><th>Möglichkeiten</th></tr></thead>
        <tbody>
          <tr><td>Auslöser</td><td>Neuer Lead · Statusänderung · Kandidat der Kampagne zugeordnet · Nur manuell (Kommunikation)</td></tr>
          <tr><td>Verzögerung</td><td>Sofort · 10 Sekunden · 30 Sekunden · 1 Minute · 5 Minuten · 1 Stunde · 1 Tag</td></tr>
          <tr><td>Empfänger</td><td>Kandidat · Kanzlei: alle Portal-Zugänge (ohne Zugang: Kontakt-E-Mail) · Kanzlei: alle Ansprechpartner</td></tr>
        </tbody>
      </table></div>
      <p>Platzhalter wie <span class="path">#Kandidatenname</span>, <span class="path">#Kampagnenname</span> oder <span class="path">#Bewerberlink</span> füllt Kandidatenwerk beim Versand aus. Eine Automatisierung gilt nur für Kandidaten, die nach dem Einschalten hinzukommen.</p>
      <div class="why"><b>Warum</b><p>Sonst würde eine frisch eingeschaltete Automatisierung allen Bestandskandidaten auf einmal schreiben.</p></div>
      <h3>Verschickt und erneut senden</h3>
      <p>Die Spalte <span class="ui">Verschickt</span> zeigt, wie viele Mails eine Automatisierung verschickt hat. Ein Klick öffnet <span class="ui">Gesendete E-Mails</span> mit Empfänger und Zeitpunkt. Dort gibt es eine Vorschau und <span class="ui">Erneut senden</span>, etwa wenn eine Kanzlei eine Mail nicht bekommen hat.</p>
      <h3>Eingangsbestätigung</h3>
      <p>Die allgemeine Eingangsbestätigung an neue Bewerber pflegt ihr unter <span class="path">Einstellungen → E-Mail-Vorlagen</span>. Sie geht an alle importierten Leads, außer in Kampagnen mit dem Haken „Keine Eingangsbestätigung“.</p>
    </section>

    <section class="chap" id="nachkampagnen">
      <h2>Kandidaten nach Kampagnen</h2>
      <p class="kicker">Die Lead-Kampagnen als Kacheln, ähnlich wie früher in Leadtable.</p>
      <ul>
        <li><span class="ui">Überfällig</span>: Status Neu und älter als 48 Stunden. <span class="ui">Unbearbeitet</span>: Status Neu. <span class="ui">Neu</span>: in den letzten 48 Stunden eingegangen.</li>
        <li>Sortieren nach <span class="ui">Neueste zuerst</span>, <span class="ui">Name (A-Z)</span> oder <span class="ui">Name (Z-A)</span>. Mit „Nur laufende“ blendet ihr pausierte Kampagnen aus.</li>
        <li>Ein Klick auf die Kachel zeigt ihre Bewerber, das Zahnrad öffnet die Kampagne.</li>
      </ul>
    </section>

    <section class="chap" id="karte">
      <h2>Karte</h2>
      <p class="kicker">Kanzleien und Kandidaten auf einen Blick, mit Umkreis und Entfernungen.</p>
      <ul>
        <li>Rot sind Kanzleien, nur Live-Kanzleien. Blau sind Kandidaten, nur vorqualifizierte. Ein gestrichelter Rand heißt: ungefährer Standort, weil keine eigene PLZ hinterlegt ist.</li>
        <li>Filter: <span class="ui">Beide / Nur Kanzleien / Nur Kandidaten</span> und <span class="ui">Alle Berufsbilder</span> mit Mehrfachauswahl, zum Beispiel Steuerfachangestellte und Steuerfachwirte zusammen.</li>
        <li>Suche nach PLZ, Ort, Kanzlei oder Kandidat. Ein Treffer bekommt einen Umkreis, den ihr mit dem Regler einstellt.</li>
        <li><span class="ui">Pin festhalten</span>: Pin und Umkreis bleiben stehen, wenn ihr auf Kandidaten klickt, und jeder Punkt zeigt seine Entfernung zum Pin, zum Beispiel „23 km bis Berlin“.</li>
        <li><span class="ui">Werbegebiete laufender Meta-Kampagnen</span> einblenden. Der Name im Werbegebiet führt zu den Bewerbern dieser Kampagne.</li>
      </ul>
    </section>

    <section class="chap" id="aufgaben">
      <h2>Aufgaben</h2>
      <p class="kicker">Aufgaben gehen an eine Person oder an ein Team, mit Fälligkeit und optional an einem Kandidaten oder Kunden.</p>
      <ul>
        <li>Wer eine Aufgabe zugewiesen bekommt, erhält eine Mail. Bei Team-Aufgaben geht sie an alle im Team.</li>
        <li>Fällige Aufgaben erinnert Kandidatenwerk jeden Morgen per Mail.</li>
        <li>„Mir zugewiesen“ zeigt eigene Aufgaben und die des eigenen Teams.</li>
        <li>Automatisch entstehen „Kampagnenstatus prüfen“ beim Phasenwechsel und „Kandidat erneut anrufen“ bei „Derzeit nicht auf Suche“.</li>
      </ul>
    </section>

    <section class="chap" id="portal">
      <h2>Kundenportal der Kanzleien</h2>
      <p class="kicker">Jede Kanzlei hat eigene Zugänge und sieht dort nur ihre Kandidaten.</p>
      <ul>
        <li>Zu sehen sind die zugeordneten Kandidaten mit Status „Vorqualifiziert“, in Reitern für Profil, Dateien und Notizen.</li>
        <li>Die Kanzlei setzt den Status der Zuordnung selbst: Neu, Vorstellungsgespräch, Eingestellt, Abgelehnt.</li>
        <li>Notizen der Kanzlei seht ihr am Kandidaten unter „Notizen vom Kunden“.</li>
        <li><span class="ui">Lebenslauf</span>: die vollständige Fassung mit genau den Feldern, die die Kanzlei im Portal sieht, und dem Key Account Manager als Ansprechpartner.</li>
      </ul>
    </section>

    <section class="chap" id="beispiele">
      <h2>Beispielkandidaten</h2>
      <p class="kicker">Musterdatensätze zeigen Kanzleien, wie Kandidaten im Portal aussehen. Kanzleien werden im persönlichen Gespräch darüber informiert.</p>
      <p>Jede Live-Kanzlei bekommt insgesamt fünf, verteilt auf knapp drei Monate ab dem Start:</p>
      <div class="timeline" aria-label="Tage nach dem Start">
        <div><strong>Tag 3</strong><span>1.</span></div>
        <div><strong>Tag 21</strong><span>2.</span></div>
        <div><strong>Tag 39</strong><span>3.</span></div>
        <div><strong>Tag 57</strong><span>4.</span></div>
        <div><strong>Tag 75</strong><span>5.</span></div>
      </div>
      <ul>
        <li>Zuerst nimmt Kandidatenwerk einen freien Musterdatensatz mit passendem Berufsbild im Umkreis von 30 km, sonst erzeugt es einen neuen. Danach gehört er nur dieser Kanzlei.</li>
        <li>Jeder hat einen Werdegang über zehn Jahre. Steuerberater, Steuerfachwirte und Bilanzbuchhalter sind wirklich qualifiziert.</li>
        <li>Musterdatensätze sehen nur Admins und das Team Vertrieb, in „Alle Kandidaten“ und auf der Karte. Alle anderen sehen sie dort nicht.</li>
        <li>An die Mailadressen der Beispielkandidaten verschickt Kandidatenwerk nie etwas.</li>
      </ul>
      <div class="warn"><b>Aktuell pausiert</b><p>Die automatische Verteilung ist pausiert und startet erst, wenn ein Admin sie freigibt.</p></div>
    </section>

    <section class="chap" id="einstellungen">
      <h2>Einstellungen</h2>
      <div class="table"><table>
        <thead><tr><th>Reiter</th><th>Inhalt</th></tr></thead>
        <tbody>
          <tr><td>Mein Konto</td><td>Eigener Name, Telefon und Foto, dazu Agenturname und Logo für Mails und Lebensläufe.</td></tr>
          <tr><td>Team</td><td>Zugänge, Rolle und Team jeder Person.</td></tr>
          <tr><td>E-Mail-Vorlagen</td><td>Vorlagen für Automatisierungen und Kommunikation, Vorlagensets für neue Kampagnen, die Eingangsbestätigung und wer bei neuen Leads benachrichtigt wird.</td></tr>
          <tr><td>Felder</td><td>Zusatzfelder der Kandidaten, Feld-Vorlagen, Felder des Kanzleiprofils und der Stellen.</td></tr>
          <tr><td>Lead-Anbindung</td><td>Meta-Kampagnen, Lead-Formulare und ihre Zuordnung zu Feldern.</td></tr>
        </tbody>
      </table></div>
    </section>

    <section class="chap" id="hintergrund">
      <h2>Was im Hintergrund läuft</h2>
      <p class="kicker">Einiges erledigt Kandidatenwerk selbst, in festen Abständen.</p>
      <div class="table"><table>
        <thead><tr><th>Wie oft</th><th>Was</th></tr></thead>
        <tbody>
          <tr><td>sofort</td><td>Neue Meta-Leads über den Webhook, Eingangsbestätigung, Antworten von Kandidaten.</td></tr>
          <tr><td>alle 5 Minuten</td><td>Automatisierungen, Gespräche aus Close, Werdegänge für geänderte Beschreibungen.</td></tr>
          <tr><td>alle 30 Minuten</td><td>Abgleich der Meta-Leads als Sicherheitsnetz.</td></tr>
          <tr><td>stündlich</td><td>Kanzleistelle24, Meta-Kampagnen und Werbegebiete, Beispielkandidaten.</td></tr>
          <tr><td>morgens</td><td>Erinnerung an fällige Aufgaben.</td></tr>
        </tbody>
      </table></div>
      <p>Die KI läuft über kie.ai. Ist Claude dort überlastet, antwortet ein Ausweichmodell. Schlägt ein Hintergrundlauf fehl, bekommen die Admins höchstens alle 12 Stunden eine Warnmail, und der Fehler steht unter <span class="path">Fehlermeldungen</span>.</p>
      <p>Findet ihr etwas, das nicht stimmt: <span class="ui">Fehler melden</span> unten in der Seitenleiste.</p>
    </section>

    <section class="chap" id="faq">
      <h2>Häufige Fragen</h2>
      <dl class="faq">
        <dt>Ich kann einen Kandidaten keiner Kanzlei zuordnen.</dt>
        <dd>Prüft den Status (muss „Vorqualifiziert“ sein) und die Projektphase der Kanzlei (muss „Live“ sein). Beispielkandidaten lassen sich nie von Hand zuordnen.</dd>
        <dt>Ein Lead aus der eigenen Kampagne einer Kanzlei fehlt in „Alle Kandidaten“.</dt>
        <dd>Das ist so gewollt. Er steht nur in der Liste der Kanzlei-Kampagne.</dd>
        <dt>Der Lebenslauf zeigt alte Stationen.</dt>
        <dd>Nach einer Änderung der Beschreibung dauert es bis zu 5 Minuten. Sonst „Werdegang neu erstellen“ klicken.</dd>
        <dt>Leads einer eigenen Kanzlei-Kampagne kommen nicht an.</dt>
        <dd>Meist ist die Facebook-Seite unserem Meta-Systemnutzer nicht freigegeben. Mit „Testlead anfordern“ prüft ihr die Verbindung.</dd>
        <dt>Warum sehe ich manche Kandidaten nicht, die ein Kollege sieht?</dt>
        <dd>Active-Sourcing-Kandidaten sehen nur Admins und das Team „Sales Recruiting + Active Sourcing“.</dd>
        <dt>Die Kanzlei hat die Mail „Neuer Kandidat“ nicht bekommen.</dt>
        <dd>In der Kampagne unter Automatisierungen auf die Zahl in „Verschickt“ klicken, die Empfänger prüfen und „Erneut senden“.</dd>
      </dl>
    </section>

    <footer class="end">Kandidatenwerk · Endlich Mitarbeiter · Fragen zum Handbuch an die Admins.</footer>
  </main>
</div>
</body>
</html>
`
