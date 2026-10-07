// Zusammenfassung von Close-Gesprächen (Paket 17, T-54). Der Close-Notetaker liefert zu
// Besprechungen eine lange, rohe Mitschrift-Zusammenfassung (teils mit Erkennungsfehlern);
// Claude (über kie.ai bzw. Anthropic, src/lib/llm.ts) fasst sie knapp für den
// Projekt-Reiter des Kunden zusammen.
import { generateText } from "@/lib/llm"

export interface CallForSummary {
  clientName: string
  transcript: string
  closeNote?: string | null
  title?: string | null
  attendees?: string | null
  userName?: string | null
  direction?: string | null
  durationSeconds?: number | null
  date?: string | null
}

const SYSTEM = `Du fasst Gespräche zusammen, die das Team von Endlich Mitarbeiter (Recruiting für Steuerkanzleien) mit Kanzleien führt.
Du bekommst die automatische Mitschrift-Zusammenfassung eines Gesprächs (Close Notetaker). Sie ist lang, teils unsortiert und enthält Erkennungsfehler und einzelne englische Wörter - glätte das stillschweigend, ohne Inhalte zu erfinden.
Deine Zusammenfassung landet als Kommentar im Kundenprojekt und wird vom Key Account Manager und vom Recruiting-Team gelesen, die beim Gespräch nicht dabei waren.

Schreibe auf Deutsch, sachlich und knapp, ohne Einleitung und ohne Markdown-Überschriften mit #. Gliedere so:
Kurzfazit: ein bis zwei Sätze.
Besprochen: Aufzählung mit "- ", nur was für Zusammenarbeit, gesuchte Stellen, Kandidaten, Kampagnen oder Vertrag relevant ist.
Vereinbart / nächste Schritte: Aufzählung mit "- ", mit Verantwortlichem und Termin, wenn genannt.
Offene Fragen: nur wenn es welche gibt.

Übernimm Namen, Zahlen, Gehälter und Termine genau so, wie sie im Gespräch genannt werden. Erfinde nichts; was unklar bleibt, lässt du weg. Smalltalk und Begrüßungen fallen weg.`

// Liefert den Zusammenfassungstext. Wirft bei API-Fehlern oder Ablehnung - der Aufrufer
// markiert den Anruf dann als fehlgeschlagen und versucht es später erneut.
export async function summarizeCall(call: CallForSummary): Promise<string> {
  const meta = [
    `Kanzlei: ${call.clientName}`,
    call.date && `Datum: ${call.date}`,
    call.userName && `Gesprächsführung (unser Team): ${call.userName}`,
    call.title && `Termin: ${call.title}`,
    call.attendees && `Teilnehmende: ${call.attendees}`,
    call.direction && `Richtung: ${call.direction === "inbound" ? "eingehend" : "ausgehend"}`,
    call.durationSeconds ? `Dauer: ${Math.round(call.durationSeconds / 60)} Minuten` : null,
  ]
    .filter(Boolean)
    .join("\n")

  return generateText({
    tier: "smart",
    system: SYSTEM,
    maxTokens: 4000,
    timeoutMs: 120_000,
    prompt: `${meta}\n\n${call.closeNote?.trim() ? `<notiz_aus_close>\n${call.closeNote.trim()}\n</notiz_aus_close>\n\n` : ""}<gespraech>\n${call.transcript.trim()}\n</gespraech>`,
  })
}
