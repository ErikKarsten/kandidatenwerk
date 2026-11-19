// "Setting BDA" automatisch ausfüllen (Paket 113, Wunsch 19.11.2026).
//
// Wechselt ein Lead in Close von "Quali terminiert …" (alle Varianten, auch "Motion Mail
// Quality terminiert") auf "SC Terminiert" bzw. "SC Terminiert (Coldmail)", nimmt
// Kandidatenwerk das Quali-Gespräch - das längste Telefonat mit Aufnahme der letzten 14 Tage
// vor dem Wechsel, dazu Mitschriften des Close-Notetakers aus Besprechungen im selben
// Zeitraum -, transkribiert es (Whisper, src/lib/transcribe.ts), lässt Claude die Fragen der
// eigenen Aktivität "Setting BDA" beantworten und legt sie beim Lead in Close veröffentlicht an.
// Gibt es zu dem Gespräch schon eine von Hand ausgefüllte "Setting BDA", wird keine zweite
// angelegt.
import type { SupabaseClient } from "@supabase/supabase-js"
import { closeConfigured, closeGet, closeList, closePost, openCallRecording, type CloseActivity } from "@/lib/close-api"
import { transcribeAudio, type AiBinding } from "@/lib/transcribe"
import { generateText } from "@/lib/llm"

export const SETTING_BDA_TYPE = "actitype_2yFQbxBwtbcs7xfLiO1TZ5"
const FENSTER_TAGE = 14
const MIN_CALL_SECONDS = 60

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
- Wurde eine Frage nicht besprochen: "-".
- Die Fragen sind ein Leitfaden; ordne passende Aussagen der richtigen Frage zu, auch wenn sie anders formuliert gestellt wurden.
- Die Aufnahme ist maschinell transkribiert und kann Hörfehler enthalten (Namen, Orte, Software). Offensichtliche Fehler stillschweigend korrigieren (z. B. „Datef“ → DATEV), Unsicheres weglassen.
- "Vorabinformation": 3-8 kurze Zeilen mit den wichtigsten Fakten zur Kanzlei (Größe/Mitarbeiter, Standorte, Schwerpunkte/Mandanten, Software, Besonderheiten, Anlass der Suche).

Antworte NUR mit einem JSON-Objekt: Schlüssel = Feld-ID, Wert = Text. "Vorabinformation" als Liste von Zeilen (Array von Strings), alle anderen als String.`

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

  const fragen = felder
    .map((f) => `- ${f.id}: ${f.name}${f.description ? ` [Hinweis: ${f.description}]` : ""}${f.type === "richtextarea" ? " (Vorabinformation, Zeilenliste)" : ""}`)
    .join("\n")
  const prompt = `Kanzlei: ${kanzlei}\n\nFelder der „Setting BDA“:\n${fragen}\n\nGespräch:\n${quelleText}`
  const antwort = await generateText({ tier: "smart", system: SYSTEM, prompt, maxTokens: 4000, timeoutMs: 180_000 })
  const json = JSON.parse(antwort.slice(antwort.indexOf("{"), antwort.lastIndexOf("}") + 1)) as Record<string, unknown>

  const werte: Record<string, string> = {}
  for (const f of felder) {
    const v = json[f.id]
    if (f.type === "richtextarea") {
      const zeilen = (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((z) => String(z).trim()).filter(Boolean)
      const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      werte[f.id] = `<body>${zeilen.map((z) => `<p>${escape(z)}</p>`).join("")}<p><em>Automatisch aus der Gesprächsaufnahme erstellt (Kandidatenwerk, KI) – bitte bei Bedarf korrigieren.</em></p></body>`
    } else {
      const t = String(v ?? "").trim()
      werte[f.id] = (t || "-").slice(0, 2000)
    }
  }
  return { werte, quelleText, telefonatId: quelle.telefonat?.id ?? null }
}

export async function settingBdaVeroeffentlichen(leadId: string, werte: Record<string, string>): Promise<string> {
  const body: Record<string, unknown> = { custom_activity_type_id: SETTING_BDA_TYPE, lead_id: leadId, status: "published" }
  for (const [id, v] of Object.entries(werte)) body[`custom.${id}`] = v
  const created = await closePost<{ id: string }>("/activity/custom/", body)
  return created.id
}

// --- Warteschlange (Tabelle setting_bda_auftraege) ---


// Aufnahmen stehen in Close oft erst einige Minuten nach dem Auflegen bereit - der Wechsel
// auf "SC Terminiert" passiert meist direkt am Ende des Gesprächs.
const WARTEN_MS = 10 * 60_000
// So lange wird nach einer Aufnahme gesucht, danach "keine_quelle".
const SUCHEN_MS = 3 * 3600_000
const MAX_VERSUCHE = 4
const PRO_LAUF = 2

export async function settingBdaVormerken(
  db: SupabaseClient,
  ev: { statusChangeId: string; leadId: string; alt: string | null; neu: string | null; am: string | null }
): Promise<boolean> {
  if (!istSettingBdaWechsel(ev.alt, ev.neu)) return false
  const { error } = await db.from("setting_bda_auftraege").upsert(
    { status_change_id: ev.statusChangeId, lead_id: ev.leadId, alt_status: ev.alt, neu_status: ev.neu, wechsel_am: ev.am ?? new Date().toISOString() },
    { onConflict: "status_change_id", ignoreDuplicates: true }
  )
  if (error) throw new Error(`Setting BDA vormerken: ${error.message}`)
  return true
}

export interface SettingBdaLaufErgebnis {
  bearbeitet: number
  angelegt: number
  vorhanden: number
  ohneQuelle: number
  fehler: string[]
}

export async function settingBdaAbarbeiten(db: SupabaseClient): Promise<SettingBdaLaufErgebnis> {
  const out: SettingBdaLaufErgebnis = { bearbeitet: 0, angelegt: 0, vorhanden: 0, ohneQuelle: 0, fehler: [] }
  if (!closeConfigured()) return out
  const { data: auftraege, error } = await db
    .from("setting_bda_auftraege")
    .select("status_change_id, lead_id, wechsel_am, versuche")
    .eq("status", "offen")
    .lte("wechsel_am", new Date(Date.now() - WARTEN_MS).toISOString())
    .order("wechsel_am", { ascending: true })
    .limit(PRO_LAUF)
  if (error) throw new Error(error.message)
  if (!auftraege?.length) return out

  const felder = await settingBdaFelder()
  for (const a of auftraege as { status_change_id: string; lead_id: string; wechsel_am: string; versuche: number }[]) {
    out.bearbeitet++
    const setze = (werte: Record<string, unknown>) =>
      db.from("setting_bda_auftraege").update({ ...werte, updated_at: new Date().toISOString() }).eq("status_change_id", a.status_change_id)
    try {
      const wechsel = new Date(a.wechsel_am)
      const quelle = await settingBdaQuelle(a.lead_id, wechsel)
      if (quelle.vorhandeneBda) {
        await setze({ status: "vorhanden", close_activity_id: quelle.vorhandeneBda.id })
        out.vorhanden++
        continue
      }
      if (!quelle.telefonat && !quelle.besprechungen.length) {
        const aufgeben = Date.now() - wechsel.getTime() > SUCHEN_MS
        await setze(aufgeben ? { status: "keine_quelle" } : { versuche: a.versuche })
        if (aufgeben) out.ohneQuelle++
        continue
      }
      const lead = await closeGet<{ display_name?: string }>(`/lead/${a.lead_id}/?_fields=display_name`)
      const ergebnis = await settingBdaAusfuellen(quelle, felder, lead?.display_name ?? "")
      // Kurz vor dem Anlegen noch einmal: hat inzwischen jemand von Hand ausgefüllt?
      const nochmal = await settingBdaQuelle(a.lead_id, wechsel)
      if (nochmal.vorhandeneBda) {
        await setze({ status: "vorhanden", close_activity_id: nochmal.vorhandeneBda.id })
        out.vorhanden++
        continue
      }
      const id = await settingBdaVeroeffentlichen(a.lead_id, ergebnis.werte)
      await setze({ status: "erledigt", close_activity_id: id, telefonat_id: ergebnis.telefonatId, fehler: null })
      out.angelegt++
    } catch (err) {
      const meldung = err instanceof Error ? err.message : String(err)
      const versuche = a.versuche + 1
      await setze({ versuche, fehler: meldung.slice(0, 500), status: versuche >= MAX_VERSUCHE ? "fehler" : "offen" })
      out.fehler.push(`${a.lead_id}: ${meldung.slice(0, 200)}`)
    }
  }
  return out
}
