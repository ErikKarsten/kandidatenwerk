// "Setting BDA" automatisch ausfüllen (Paket 113, Wunsch 19.11.2026).
//
// Wechselt ein Lead in Close von "Quali terminiert …" (alle Varianten, auch "Motion Mail
// Quality terminiert") auf "SC Terminiert" bzw. "SC Terminiert (Coldmail)", nimmt
// Kandidatenwerk das Quali-Gespräch - das längste Telefonat mit Aufnahme (ab 7 Minuten) der letzten 14 Tage
// vor dem Wechsel, dazu Mitschriften des Close-Notetakers aus Besprechungen im selben
// Zeitraum -, transkribiert es (Whisper, src/lib/transcribe.ts), lässt Claude die Fragen der
// eigenen Aktivität "Setting BDA" beantworten und legt sie beim Lead in Close veröffentlicht an.
// Gibt es zu dem Gespräch schon eine von Hand ausgefüllte "Setting BDA", wird keine zweite
// angelegt.
import { closeConfigured, closeGet, closeList, closePost, openCallRecording, type CloseActivity } from "@/lib/close-api"
import { transcribeAudio, type AiBinding } from "@/lib/transcribe"
import { generateText } from "@/lib/llm"

export const SETTING_BDA_TYPE = "actitype_2yFQbxBwtbcs7xfLiO1TZ5"
const FENSTER_TAGE = 14
// Kürzere Telefonate sind kein Quali-Gespräch (Wunsch 19.11.: mindestens 7 Minuten).
const MIN_CALL_SECONDS = 7 * 60

export function istQualiStatus(label: string | null | undefined): boolean {
  return /quali(ty)?\s*terminiert/i.test(label ?? "")
}

export function istScStatus(label: string | null | undefined): boolean {
  return /^\s*sc\s*terminiert/i.test(label ?? "")
}

export function istSettingBdaWechsel(alt: string | null | undefined, neu: string | null | undefined): boolean {
  return istQualiStatus(alt) && istScStatus(neu)
}

export interface BdaFeld {
  id: string
  name: string
  description: string | null
  type: string
}

export async function settingBdaFelder(): Promise<BdaFeld[]> {
  const typ = await closeGet<{ fields?: { id: string; name: string; description?: string | null; type: string }[] }>(`/custom_activity/${SETTING_BDA_TYPE}/`)
  const felder = (typ?.fields ?? []).map((f) => ({ id: f.id, name: f.name, description: f.description ?? null, type: f.type }))
  if (!felder.length) throw new Error("Felder der Aktivität „Setting BDA“ nicht lesbar.")
  return felder
}

export interface BdaQuelle {
  telefonat: CloseActivity | null
  besprechungen: CloseActivity[]
  vorhandeneBda: CloseActivity | null
}

const zeit = (a: CloseActivity) => Date.parse((a.activity_at ?? a.date_created ?? "") as string) || 0

// Quali-Gespräch zum Statuswechsel finden: längstes Telefonat mit Aufnahme im Fenster vor
// dem Wechsel, Notetaker-Mitschriften aus Besprechungen, die im Fenster stattgefunden haben.
export async function settingBdaQuelle(leadId: string, wechselAm: Date): Promise<BdaQuelle> {
  const bis = wechselAm.getTime() + 5 * 60_000 // Aufnahme endet oft erst kurz nach dem Klick
  const von = wechselAm.getTime() - FENSTER_TAGE * 86_400_000
  const imFenster = (a: CloseActivity) => zeit(a) >= von && zeit(a) <= bis
  const [calls, meetings, custom] = await Promise.all([
    closeList<CloseActivity>(`/activity/call/?lead_id=${leadId}`, 300),
    closeList<CloseActivity>(`/activity/meeting/?lead_id=${leadId}`, 100),
    closeList<CloseActivity>(`/activity/custom/?lead_id=${leadId}&custom_activity_type_id=${SETTING_BDA_TYPE}`, 50),
  ])
  const telefonat =
    calls
      .filter((c) => imFenster(c) && !!c.has_recording && !!c.recording_url && (c.duration ?? 0) >= MIN_CALL_SECONDS)
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0] ?? null
  const besprechungen = meetings.filter((m) => {
    const start = Date.parse((m.starts_at ?? "") as string)
    return !!m.summary?.text?.trim() && Number.isFinite(start) && start >= von && start <= bis
  })
  // Schon von Hand ausgefüllt, seit das Gespräch begann (bzw. im Fenster)?
  const ab = telefonat ? zeit(telefonat) - 10 * 60_000 : von
  const vorhandeneBda = custom.find((c) => zeit(c) >= ab) ?? null
  return { telefonat, besprechungen, vorhandeneBda }
}

const SYSTEM = `Du füllst für das Vertriebsteam von Endlich Mitarbeiter / Kanzleistelle24 die Gesprächsnotiz „Setting BDA“ in Close aus. Endlich Mitarbeiter findet für Steuerkanzleien Mitarbeiter (Steuerfachangestellte = SFA/Stfa, Steuerfachwirte, Bilanzbuchhalter, Lohnbuchhalter). Im Quali-Gespräch hat ein Mitarbeiter die Kanzlei zu ihrer Stellensituation befragt.

Regeln:
- Nur was im Gespräch wirklich gesagt wurde. Nichts erfinden, nichts schönen.
- Stil wie das Team: kurze Stichpunkte, keine ganzen Sätze nötig, Zahlen genau übernehmen (z. B. „1-2“, „2 Bewerbungsgespräche“, „seit 6 Monaten“).
- Wurde eine Frage nicht besprochen: leere Liste (wird in Close als "-" eingetragen).
- Die Fragen sind ein Leitfaden; ordne passende Aussagen der richtigen Frage zu, auch wenn sie anders formuliert gestellt wurden oder nur nebenbei fielen.
- Zuordnung: Was die Kanzlei Bewerbern bietet (Homeoffice, Weiterbildung, Arbeitszeiten, Digitalisierung, Lage, Team, Gehaltsextras) → Differenzierungsmerkmale. Fachliche Anforderungen (Ausbildung, Erfahrung, Schwerpunkte, Software) → „Was muss mitbringen“ bzw. „Qualifiziert“. Wie Stellen derzeit überbrückt werden (Überstunden, Umverteilen, Mandate ablehnen) → „Wie gleichen Sie aus“. Bisherige Suchwege (Anzeigen, Agenturen, Empfehlungen) → „Strategie“.
- Gibt der Mitarbeiter im Gespräch Kandidaten wieder, die Endlich Mitarbeiter vorstellt, gehört das nicht in die Felder - es geht um die Kanzlei.
- Die Aufnahme ist maschinell transkribiert und kann Hörfehler enthalten (Namen, Orte, Software). Offensichtliche Fehler stillschweigend korrigieren (z. B. „Datef“ → DATEV), Unsicheres weglassen.
- "Vorabinformation": 3-8 kurze Zeilen mit den wichtigsten Fakten zur Kanzlei (Größe/Mitarbeiter, Standorte, Schwerpunkte/Mandanten, Software, Besonderheiten, Anlass der Suche).

Antworte NUR mit einem JSON-Objekt: Schlüssel = Feld-ID, Wert = Liste von Stichpunkten (Array von Strings, je ein Punkt, ohne Aufzählungszeichen). Nicht besprochen: leere Liste [].`

export interface BdaErgebnis {
  werte: Record<string, string>
  quelleText: string
  telefonatId: string | null
}

// Transkribieren und ausfüllen. ai: nur für Skripte außerhalb des Workers.
export async function settingBdaAusfuellen(quelle: BdaQuelle, felder: BdaFeld[], kanzlei: string, ai?: AiBinding): Promise<BdaErgebnis> {
  const teile: string[] = []
  if (quelle.telefonat?.recording_url) {
    const text = await transcribeAudio(
      await openCallRecording(quelle.telefonat.recording_url),
      `Telefonat zwischen Endlich Mitarbeiter und der Steuerkanzlei ${kanzlei} über offene Stellen (Steuerfachangestellte, SFA, Steuerfachwirt, Bilanzbuchhalter, DATEV, Homeoffice).`,
      ai
    )
    teile.push(`TELEFONAT (${Math.round((quelle.telefonat.duration ?? 0) / 60)} Min., ${quelle.telefonat.user_name ?? "Team"}):\n${text}`)
  }
  for (const m of quelle.besprechungen) teile.push(`BESPRECHUNG „${m.title ?? ""}“ (Mitschrift Close-Notetaker):\n${m.summary?.text?.trim()}`)
  if (!teile.length) throw new Error("Keine Aufnahme und keine Mitschrift gefunden.")
  const quelleText = teile.join("\n\n").slice(0, 120_000)
  return { werte: await settingBdaAusText(quelleText, felder, kanzlei), quelleText, telefonatId: quelle.telefonat?.id ?? null }
}

// Felder aus fertigem Gesprächstext füllen (auch für Probeläufe mit gespeichertem Transkript).
export async function settingBdaAusText(quelleText: string, felder: BdaFeld[], kanzlei: string): Promise<Record<string, string>> {

  const fragen = felder
    .map((f) => `- ${f.id}: ${f.name}${f.description ? ` [Hinweis: ${f.description}]` : ""}${f.type === "richtextarea" ? " (Vorabinformation, Zeilenliste)" : ""}`)
    .join("\n")
  const prompt = `Kanzlei: ${kanzlei}\n\nFelder der „Setting BDA“:\n${fragen}\n\nGespräch:\n${quelleText}`
  const antwort = await generateText({ tier: "smart", system: SYSTEM, prompt, maxTokens: 4000, timeoutMs: 180_000 })
  const json = JSON.parse(antwort.slice(antwort.indexOf("{"), antwort.lastIndexOf("}") + 1)) as Record<string, unknown>

  return settingBdaFormatieren(json, felder)
}

// Stichpunkte statt Fließtext (Wunsch 19.11.): Vorabinformation als Aufzählung, Fragefelder
// mit einem "•"-Punkt pro Zeile, wenn es mehrere Punkte sind.
export function stichpunkte(wert: unknown): string[] {
  const roh = Array.isArray(wert) ? wert.map(String) : String(wert ?? "").split(/\n+|;\s+/)
  return roh.map((z) => z.replace(/^\s*[-•*]\s+/, "").trim()).filter((z) => z && z !== "-")
}

export function settingBdaFormatieren(json: Record<string, unknown>, felder: BdaFeld[]): Record<string, string> {
  const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const werte: Record<string, string> = {}
  for (const f of felder) {
    const punkte = stichpunkte(json[f.id])
    if (f.type === "richtextarea") {
      werte[f.id] = `<body><ul>${punkte.map((z) => `<li>${escape(z)}</li>`).join("")}</ul><p><em>Automatisch aus der Gesprächsaufnahme erstellt (Kandidatenwerk, KI) – bitte bei Bedarf korrigieren.</em></p></body>`
    } else {
      werte[f.id] = (punkte.length === 0 ? "-" : punkte.length === 1 ? punkte[0] : punkte.map((z) => `• ${z}`).join("\n")).slice(0, 2000)
    }
  }
  return werte
}

export async function settingBdaVeroeffentlichen(leadId: string, werte: Record<string, string>): Promise<string> {
  const body: Record<string, unknown> = { custom_activity_type_id: SETTING_BDA_TYPE, lead_id: leadId, status: "published" }
  for (const [id, v] of Object.entries(werte)) body[`custom.${id}`] = v
  const created = await closePost<{ id: string }>("/activity/custom/", body)
  return created.id
}

// --- Abarbeiten (Cronjob setting-bda, alle 5 Minuten) ---
// Ohne eigene Tabelle: Der Job fragt Close nach den Statuswechseln der letzten Stunden. Ob
// schon eine "Setting BDA" zum Gespräch existiert (von Hand oder von hier), steht in Close -
// das verhindert doppelte Einträge. Ohne Aufnahme oder bei einem Fehler versucht es der
// nächste Lauf erneut, bis der Wechsel älter als SUCHEN_MS ist.

// Aufnahmen stehen in Close oft erst einige Minuten nach dem Auflegen bereit - der Wechsel
// auf "SC Terminiert" passiert meist direkt am Ende des Gesprächs.
const WARTEN_MS = 10 * 60_000
const SUCHEN_MS = 3 * 3600_000
const PRO_LAUF = 2

export interface SettingBdaLaufErgebnis {
  wechsel: number
  angelegt: string[]
  vorhanden: number
  ohneQuelle: number
  fehler: string[]
}

export async function settingBdaAbarbeiten(): Promise<SettingBdaLaufErgebnis> {
  const out: SettingBdaLaufErgebnis = { wechsel: 0, angelegt: [], vorhanden: 0, ohneQuelle: 0, fehler: [] }
  if (!closeConfigured()) return out
  const seit = new Date(Date.now() - SUCHEN_MS).toISOString()
  const aenderungen = await closeList<CloseActivity>(`/activity/status_change/lead/?date_created__gte=${encodeURIComponent(seit)}`, 1000)
  const offen = aenderungen
    .filter((a) => istSettingBdaWechsel(a.old_status_label, a.new_status_label) && !!a.lead_id && zeit(a) <= Date.now() - WARTEN_MS)
    .sort((a, b) => zeit(a) - zeit(b))
  out.wechsel = offen.length
  if (!offen.length) return out

  let felder: BdaFeld[] | null = null
  let bearbeitet = 0
  const gesehen = new Set<string>()
  for (const a of offen) {
    if (bearbeitet >= PRO_LAUF) break
    const leadId = a.lead_id!
    if (gesehen.has(leadId)) continue
    gesehen.add(leadId)
    try {
      const wechsel = new Date(zeit(a))
      const quelle = await settingBdaQuelle(leadId, wechsel)
      if (quelle.vorhandeneBda) {
        out.vorhanden++
        continue
      }
      if (!quelle.telefonat && !quelle.besprechungen.length) {
        out.ohneQuelle++
        continue
      }
      bearbeitet++
      felder ??= await settingBdaFelder()
      const lead = await closeGet<{ display_name?: string }>(`/lead/${leadId}/?_fields=display_name`)
      const ergebnis = await settingBdaAusfuellen(quelle, felder, lead?.display_name ?? "")
      // Kurz vor dem Anlegen noch einmal: hat inzwischen jemand von Hand ausgefüllt?
      if ((await settingBdaQuelle(leadId, wechsel)).vorhandeneBda) {
        out.vorhanden++
        continue
      }
      out.angelegt.push(`${leadId}: ${await settingBdaVeroeffentlichen(leadId, ergebnis.werte)}`)
    } catch (err) {
      out.fehler.push(`${leadId}: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`)
    }
  }
  return out
}
