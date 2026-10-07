// Aufbereitung von Kommentartexten (Paket 30, T-119/T-120): Links erkennen und Punkte aus
// Gesprächszusammenfassungen (src/lib/call-summary.ts) finden, aus denen man eine Aufgabe
// anlegen kann. Client-tauglich.

export type TextPart = { type: "text"; value: string } | { type: "link"; value: string }

const URL_RE = /https?:\/\/[^\s<>"')]+/g

export function splitLinks(line: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of line.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:]+$/, "")
    if (m.index! > last) parts.push({ type: "text", value: line.slice(last, m.index) })
    parts.push({ type: "link", value: url })
    last = m.index! + url.length
  }
  if (last < line.length) parts.push({ type: "text", value: line.slice(last) })
  return parts
}

export type CommentLineKind = "title" | "heading" | "bullet" | "text" | "link" | "blank"

export interface CommentLine {
  kind: CommentLineKind
  text: string
  // Bei Überschriften mit Inhalt in derselben Zeile ("Kurzfazit: ...") der Inhalt.
  rest?: string
  // Aufzählungspunkt unter "Vereinbart / nächste Schritte" oder "Offene Fragen".
  actionable: boolean
}

const ACTION_HEADINGS = /^(vereinbart|nächste schritte|offene fragen|to-?dos?)/i
const KNOWN_HEADINGS = /^(kurzfazit|besprochen|vereinbart(\s*\/\s*nächste schritte)?|nächste schritte|offene fragen|ergebnis|zusammenfassung|to-?dos?)\s*:\s*(.*)$/i
const CLOSE_LINK = /^in close ansehen:\s*(https?:\/\/\S+)\s*$/i

// Gliedert einen Kommentar für die Anzeige (Paket 35): bei strukturierten Kommentaren
// (Gespräche, Telefonate aus Close) Titelzeile, Zwischenüberschriften und Aufzählungen.
export function parseCommentLines(content: string, structured: boolean): CommentLine[] {
  let inActionSection = false
  let seenText = false
  return content.split("\n").map((raw): CommentLine => {
    const text = raw.trimEnd()
    if (!text.trim()) return { kind: "blank", text: "", actionable: false }
    const link = text.trim().match(CLOSE_LINK)
    if (link) return { kind: "link", text: link[1], actionable: false }
    const bullet = /^\s*[-•*]\s+/.test(text)
    if (bullet) {
      seenText = true
      return { kind: "bullet", text: text.replace(/^\s*[-•*]\s+/, ""), actionable: structured && inActionSection }
    }
    if (structured) {
      const heading = text.trim().match(KNOWN_HEADINGS)
      const generic = !heading && /^[A-ZÄÖÜ][^:]{1,40}:$/.test(text.trim())
      if (heading || generic) {
        const label = heading ? text.trim().slice(0, text.trim().indexOf(":")) : text.trim().slice(0, -1)
        inActionSection = ACTION_HEADINGS.test(label)
        seenText = true
        return { kind: "heading", text: label, rest: heading?.[3]?.trim() || undefined, actionable: false }
      }
      if (!seenText) {
        seenText = true
        return { kind: "title", text, actionable: false }
      }
    }
    seenText = true
    return { kind: "text", text, actionable: false }
  })
}

// Aufgabentitel aus einem Punkt: ohne Aufzählungszeichen, höchstens 120 Zeichen.
export function taskTitleFromLine(line: string): string {
  const clean = line.replace(/^\s*[-•*]\s+/, "").trim()
  return clean.length > 120 ? `${clean.slice(0, 117).trimEnd()}…` : clean
}
