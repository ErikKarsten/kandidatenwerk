// Zusammenfassung von Close-Gesprächen (Paket 17, T-54). Der Close-Notetaker liefert zu
// Besprechungen eine lange, rohe Mitschrift-Zusammenfassung (teils mit Erkennungsfehlern);
// Claude fasst sie knapp für den Projekt-Reiter des Kunden zusammen.
import Anthropic from "@anthropic-ai/sdk"

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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt.")
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })

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

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    // Bei einer Ablehnung durch Sicherheitsfilter übernimmt serverseitig ein anderes Modell.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${meta}\n\n${call.closeNote?.trim() ? `<notiz_aus_close>\n${call.closeNote.trim()}\n</notiz_aus_close>\n\n` : ""}<gespraech>\n${call.transcript.trim()}\n</gespraech>`,
      },
    ],
  })

  if (response.stop_reason === "refusal") throw new Error("Zusammenfassung wurde abgelehnt.")
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
  if (!text) throw new Error("Leere Zusammenfassung.")
  return text
}
