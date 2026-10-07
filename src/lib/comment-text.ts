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

export interface CommentLine {
  text: string
  // Aufzählungspunkt unter "Vereinbart / nächste Schritte" oder "Offene Fragen".
  actionable: boolean
}

const ACTION_HEADINGS = /^(vereinbart|nächste schritte|offene fragen|to-?dos?)/i

export function parseCommentLines(content: string, withActions: boolean): CommentLine[] {
  let inActionSection = false
  return content.split("\n").map((raw) => {
    const text = raw.trimEnd()
    const bullet = /^\s*[-•*]\s+/.test(text)
    if (!bullet && text.trim()) inActionSection = ACTION_HEADINGS.test(text.trim())
    return { text, actionable: withActions && bullet && inActionSection }
  })
}

// Aufgabentitel aus einem Punkt: ohne Aufzählungszeichen, höchstens 120 Zeichen.
export function taskTitleFromLine(line: string): string {
  const clean = line.replace(/^\s*[-•*]\s+/, "").trim()
  return clean.length > 120 ? `${clean.slice(0, 117).trimEnd()}…` : clean
}
