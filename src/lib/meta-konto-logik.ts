// Regeln der Konto-Prüfung (Paket 108) - übernommen aus dem Meta-Analyse-Tool
// (supabase/functions/_shared/konto-logik.js), damit der Alarm genauso urteilt wie dort.
// Ohne Server-Code, damit auch die rote Leiste die Texte nutzen kann.

export const KONTOSTATUS: Record<number, string> = {
  1: "aktiv",
  2: "deaktiviert",
  3: "offene Zahlung",
  7: "in Prüfung durch Meta",
  8: "Zahlung wird abgewickelt",
  9: "Kulanzfrist",
  100: "wird geschlossen",
  101: "geschlossen",
}

const VERGLEICH_MIN = 40 // so lange darf keine Einblendung dazukommen, dann "steht" die Auslieferung
const VERLAUF_STUNDEN = 3 // so weit zurück merkt sich die Prüfung die Einblendungen
const VERLAUF_ABSTAND_MIN = 5 // höchstens alle 5 Minuten ein Eintrag

export interface KontoStand {
  konto_id: string
  name: string | null
  waehrung: string | null
  kontostatus: number | null
  sperrgrund: number | null
  ausgabenlimit: number | null
  ausgegeben: number | null
  ausgaben_heute: number
  impressionen_heute: number
  aktive_anzeigen: number | null
  zeitzone: string | null
  geprueft_am: string
  verlauf?: { t: string; i: number }[]
  basis?: { impressionen: number; geprueft_am: string } | null
  auslieferung_steht?: boolean
  alarm?: string | null
  alarm_titel?: string | null
  alarm_text?: string | null
  // Für welchen Alarm zuletzt eine Benachrichtigung rausging und wann.
  alarm_gemeldet?: string | null
  alarm_gemeldet_am?: string | null
}

export interface Alarm {
  schluessel: string
  titel: string
  text: string
}

// Geldbeträge des Kontos liefert Meta in Cent (bei Euro), als Text.
export const ausCent = (v: string | number | null | undefined): number | null =>
  v == null || v === "" ? null : Math.round(Number(v)) / 100

export function euro(v: number): string {
  const digits = Math.abs(v) < 1000 ? 2 : 0
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
}

function stundeIn(iso: string, zone: string | null): number {
  const teile = new Intl.DateTimeFormat("de-DE", { timeZone: zone || "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso))
  return Number(teile.find((t) => t.type === "hour")?.value ?? 0)
}

export const tagIn = (iso: string, zone: string | null) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: zone || "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))

export const uhrIn = (iso: string, zone: string | null) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: zone || "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

// Roter Alarm nur, wenn wirklich nicht ausgeliefert wird oder das Konto nicht aktiv ist.
export function alarmAus(z: KontoStand): Alarm | null {
  const limit = z.ausgabenlimit || 0
  const ausgegeben = z.ausgegeben || 0
  const status = z.kontostatus == null ? 1 : Number(z.kontostatus)
  if (![1, 8, 9].includes(status)) {
    return { schluessel: `konto-${status}`, titel: "Kampagnen offline", text: `Das Werbekonto ist nicht aktiv (${KONTOSTATUS[status] || `Meta-Status ${status}`}).` }
  }
  if (!z.auslieferung_steht) return null
  const seit = z.basis ? `Seit ${uhrIn(z.basis.geprueft_am, z.zeitzone)} Uhr wurde keine Anzeige mehr ausgespielt.` : "Heute wurde noch keine Anzeige ausgespielt."
  const rest = limit > 0 ? limit - ausgegeben : null
  const grund =
    rest != null && rest <= 0
      ? ` Wahrscheinlicher Grund: Das Ausgabenlimit ist erreicht (${euro(ausgegeben)} von ${euro(limit)}).`
      : rest != null && rest <= Math.max(25, limit * 0.02)
        ? ` Wahrscheinlicher Grund: Das Ausgabenlimit ist fast erreicht (noch ${euro(rest)}).`
        : status === 9
          ? " Wahrscheinlicher Grund: Eine Zahlung ist offen (Kulanzfrist)."
          : ""
  return { schluessel: "offline", titel: "Kampagnen offline", text: `${seit}${grund}` }
}

// Vergleicht mit den früheren Prüfungen von heute, ergänzt den Verlauf und bestimmt
// Auslieferung und Alarm. Verändert und ergänzt `zeile`.
export function bewerte(zeile: KontoStand, vorher: KontoStand | null): { alarm: Alarm | null } {
  const jetzt = Date.parse(zeile.geprueft_am)
  const tz = zeile.zeitzone
  const heute = tagIn(zeile.geprueft_am, tz)
  const minuten = (p: { t: string }) => (jetzt - Date.parse(p.t)) / 60_000

  let verlauf = Array.isArray(vorher?.verlauf) ? [...vorher.verlauf] : []
  if (vorher?.geprueft_am) verlauf.push({ t: vorher.geprueft_am, i: vorher.impressionen_heute })
  const gesehen = new Set<string>()
  verlauf = verlauf
    .filter((p) => p && p.t && Number.isFinite(Number(p.i)) && tagIn(p.t, tz) === heute && minuten(p) >= 0 && minuten(p) <= VERLAUF_STUNDEN * 60)
    .filter((p) => (gesehen.has(p.t) ? false : (gesehen.add(p.t), true)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))

  // Vergleichswert: der jüngste Stand, der mindestens 40 Minuten alt ist. Bei einer
  // Prüfung alle 30 Minuten ist das der Stand von vor einer Stunde.
  const alt = verlauf.filter((p) => minuten(p) >= VERGLEICH_MIN)
  const basis = alt.length ? { impressionen: Number(alt[alt.length - 1].i), geprueft_am: alt[alt.length - 1].t } : null
  const stunde = stundeIn(zeile.geprueft_am, tz)
  const aktiv = (zeile.aktive_anzeigen ?? 0) > 0
  const steht = aktiv && ((basis && stunde >= 8 && zeile.impressionen_heute <= basis.impressionen) || (zeile.impressionen_heute === 0 && stunde >= 10))

  const letzter = verlauf[verlauf.length - 1]
  if (!letzter || minuten(letzter) >= VERLAUF_ABSTAND_MIN) verlauf.push({ t: zeile.geprueft_am, i: zeile.impressionen_heute })

  zeile.verlauf = verlauf
  zeile.basis = basis
  zeile.auslieferung_steht = Boolean(steht)
  const alarm = alarmAus(zeile)
  zeile.alarm = alarm?.schluessel ?? null
  zeile.alarm_titel = alarm?.titel ?? null
  zeile.alarm_text = alarm?.text ?? null
  zeile.alarm_gemeldet = vorher?.alarm_gemeldet ?? null
  zeile.alarm_gemeldet_am = zeile.alarm_gemeldet ? (vorher?.alarm_gemeldet_am ?? null) : null
  return { alarm }
}
