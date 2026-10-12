// Eigener "Zurück"-Verlauf (Paket 53): router.back() führte nach dem Anlegen eines
// Kandidaten im Kreis (Kampagne -> Formular -> Kampagne -> …). Gemerkt werden nur echte
// Seiten - Formularseiten (…/new) nie -, "Zurück" springt zur zuletzt besuchten anderen
// Seite, sonst zu einer festen Übersicht.
const KEY = "kandidatenwerk_nav_stack"
const MAX = 30

export function isFormPage(url: string): boolean {
  return /\/new(\?|$)/.test(url)
}

// Neuer Stapel nach dem Besuch von `url`: Zurück-Navigation im Browser (url = vorletzter
// Eintrag) nimmt den letzten Eintrag weg, sonst wird angehängt.
export function nextStack(stack: string[], url: string): string[] {
  if (isFormPage(url) || stack[stack.length - 1] === url) return stack
  if (stack[stack.length - 2] === url) return stack.slice(0, -1)
  return [...stack, url].slice(-MAX)
}

// Ziel für "Zurück": letzte andere, echte Seite; der Rest bleibt als Verlauf.
export function backTarget(stack: string[], current: string, fallback: string): { target: string; rest: string[] } {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] !== current && !isFormPage(stack[i])) return { target: stack[i], rest: stack.slice(0, i) }
  }
  return { target: fallback, rest: [] }
}

export function readStack(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function writeStack(stack: string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stack))
  } catch {
    // ohne Speicher gibt es nur den festen Rückweg
  }
}
