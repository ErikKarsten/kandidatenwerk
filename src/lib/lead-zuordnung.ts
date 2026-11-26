// Welche Kandidatenwerk-Kampagne gehört zu einem Meta-Lead? (Paket 116)
//
// Bisher nur über das verknüpfte Formular (campaigns.meta_form_id). Leads aus Formularen,
// die an keiner Kampagne hängen, gingen verloren - z. B. ein zweites Formular in derselben
// Meta-Kampagne (KS24 Frankfurt „Video Neele“) oder ein nie verknüpftes Formular einer
// Kanzlei (Roggel „SB“). Reihenfolge:
//   1. verknüpftes Formular,
//   2. Meta-Kampagne des Leads (lead.campaign_id = campaigns.meta_campaign_id),
//   3. Kanzlei der Facebook-Seite + Berufsbild (und ggf. Stadt) aus dem Formularnamen.
// Findet sich nichts Eindeutiges, bleibt der Lead offen und das Formular erscheint in der
// roten Leiste (formulareOhneKampagneMelden).
import type { SupabaseClient as GenericSupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import type { MetaSyncCampaign } from "@/lib/meta-leads-sync-shared"
import { isKs24Campaign } from "@/lib/meta-campaigns-parse"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"

type Db = GenericSupabaseClient<Database>

const ARCHIVED_STATUS = "Archiviert"

export interface LeadKampagne extends MetaSyncCampaign {
  status: string
  meta_form_id: string | null
}

export type Zuordnungsweg = "formular" | "meta-kampagne" | "kanzlei"

interface KampagnenZeile {
  id: string
  title: string
  status: string
  kind: string
  client_id: string | null
  agency_id: string | null
  meta_form_id: string | null
  berufsbild: string | null
}

const SPALTEN = "id, title, status, kind, client_id, agency_id, meta_form_id, berufsbild"

// Lead-Kampagnen nur, solange sie KS24-Kampagnen sind (T-64); archivierte nie.
function verwendbar(k: KampagnenZeile): boolean {
  if (k.status === ARCHIVED_STATUS) return false
  if (k.kind === "lead") return isKs24Campaign(k.title)
  return true
}

function alsLeadKampagne(k: KampagnenZeile, formId: string): LeadKampagne {
  return { id: k.id, title: k.title, status: k.status, kind: k.kind, client_id: k.client_id, agency_id: k.agency_id, meta_form_id: formId }
}

// Kürzel in Formularnamen („Roggel Steuerberatung - SB“, „Schmitt & Bruckbauer - SSFW“).
export function berufsbildAusFormular(name: string): string | null {
  const n = name.toLowerCase()
  return (
    mapKanzleistelleBerufsbild(name) ??
    (/\bssfw\b/.test(n) ? "steuerfachwirt" : null) ??
    (/\bsb\b/.test(n) ? "steuerberater" : null) ??
    (/\b(lbh|lb|lohn)\b/.test(n) ? "lohnbuchhalter" : null) ??
    (/\bbibu\b/.test(n) ? "bilanzbuchhalter" : null)
  )
}

// Wörter, die in Seiten- und Kanzleinamen ständig vorkommen und nichts unterscheiden.
const ALLGEMEIN = new Set([
  "steuerberatung", "steuerberater", "steuerberatungsgesellschaft", "steuerkanzlei", "kanzlei", "partner", "partnerschaft",
  "partg", "mbb", "gmbh", "und", "von", "der", "die", "das", "steuern", "recht", "wirtschaftsprüfer", "wirtschaftsprufer",
  "steuerberatern", "rechtsanwälte", "rechtsanwalte", "team",
])

function kennwoerter(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !ALLGEMEIN.has(w))
}

// Kanzlei zu einer Facebook-Seite: über andere, schon verknüpfte Formulare derselben Seite,
// sonst über den Seitennamen (genau eine Kanzlei mit demselben Kennwort).
async function kanzleiDerSeite(db: Db, seite: { name: string; formIds: string[] }): Promise<string | null> {
  if (seite.formIds.length) {
    const { data } = await db.from("campaigns").select("client_id").eq("kind", "kanzlei").in("meta_form_id", seite.formIds).not("client_id", "is", null)
    const ids = [...new Set((data ?? []).map((r) => r.client_id as string))]
    if (ids.length === 1) return ids[0]
    if (ids.length > 1) return null
  }
  const woerter = kennwoerter(seite.name)
  if (!woerter.length) return null
  const { data: kunden } = await db.from("clients").select("id, name").neq("status", ARCHIVED_STATUS).ilike("name", `%${woerter[0]}%`)
  const passend = (kunden ?? []).filter((k) => kennwoerter(k.name).includes(woerter[0]))
  return passend.length === 1 ? passend[0].id : null
}

export interface LeadHerkunft {
  formId: string
  formName: string | null
  metaCampaignId: string | null
  // Facebook-Seite des Formulars: Name und alle ihre Formular-IDs (für Schritt 3).
  seite: { name: string; formIds: string[] } | null
}

// null = keine Kampagne gefunden (Formular gehört in die rote Leiste); "ignoriert" = das
// Formular hängt bewusst an einer archivierten oder Nicht-KS24-Kampagne, nicht importieren.
export async function kampagneFuerLead(db: Db, herkunft: LeadHerkunft): Promise<{ kampagne: LeadKampagne; weg: Zuordnungsweg } | "ignoriert" | null> {
  // 1. Verknüpftes Formular - Lead-Kampagne vor Kanzlei-Kampagne (wie bisher, T-38).
  const { data: perFormular } = await db.from("campaigns").select(SPALTEN).eq("meta_form_id", herkunft.formId).order("kind", { ascending: true })
  const formularTreffer = (perFormular ?? []) as KampagnenZeile[]
  if (formularTreffer.length) {
    const k = formularTreffer.find(verwendbar)
    // Formular bewusst an einer archivierten / fremden Kampagne: nicht anderswo einsortieren.
    return k ? { kampagne: alsLeadKampagne(k, herkunft.formId), weg: "formular" } : "ignoriert"
  }

  const berufsbild = herkunft.formName ? berufsbildAusFormular(herkunft.formName) : null
  const kampagnenBerufsbild = (k: KampagnenZeile) => k.berufsbild ?? mapKanzleistelleBerufsbild(k.title)

  // 2. Meta-Kampagne des Leads. Eine Kanzlei-Meta-Kampagne wirbt oft für mehrere Stellen
  // (Schmitt & Bruckbauer: SFA und SSFW) - dann muss das Berufsbild passen.
  if (herkunft.metaCampaignId) {
    const { data } = await db.from("campaigns").select(SPALTEN).eq("meta_campaign_id", herkunft.metaCampaignId).order("kind", { ascending: true })
    const k = ((data ?? []) as KampagnenZeile[]).find(
      (c) => verwendbar(c) && (c.kind === "lead" || !berufsbild || !kampagnenBerufsbild(c) || kampagnenBerufsbild(c) === berufsbild)
    )
    if (k) return { kampagne: alsLeadKampagne(k, herkunft.formId), weg: "meta-kampagne" }
  }

  // 3. Kanzlei der Seite + Berufsbild aus dem Formularnamen.
  if (!herkunft.seite || !herkunft.formName || !berufsbild) return null
  const kundeId = await kanzleiDerSeite(db, herkunft.seite)
  if (!kundeId) return null
  const { data } = await db.from("campaigns").select(SPALTEN).eq("client_id", kundeId).eq("kind", "kanzlei").eq("status", "active")
  const passend = ((data ?? []) as KampagnenZeile[]).filter((k) => kampagnenBerufsbild(k) === berufsbild)
  let k: KampagnenZeile | undefined = passend.length === 1 ? passend[0] : undefined
  // Mehrere Standorte (Friebe Olpe/Lüdenscheid/…): die Kampagne, deren Ort im Formularnamen steht.
  if (!k && passend.length > 1) {
    const formWoerter = new Set(kennwoerter(herkunft.formName))
    const mitOrt = passend.filter((p) => kennwoerter(p.title).some((w) => formWoerter.has(w)))
    if (mitOrt.length === 1) k = mitOrt[0]
  }
  if (!k) return null
  // Formular gleich verknüpfen, falls die Kampagne noch keins hat - künftige Leads gehen
  // dann direkt über Schritt 1, und der Abgleich holt ältere Leads still nach.
  if (!k.meta_form_id) {
    await db.from("campaigns").update({ meta_form_id: herkunft.formId, meta_form_name: herkunft.formName }).eq("id", k.id).is("meta_form_id", null)
  }
  return { kampagne: alsLeadKampagne(k, herkunft.formId), weg: "kanzlei" }
}

// --- Formulare ohne Kampagne: Stand für die rote Leiste -----------------------------------
// Liegt ohne eigene Tabelle (auf dem Entwicklungsrechner fehlt psql für Migrationen) als
// eigene Zeile in meta_konto_status; die Meta-Konto-Abfragen lesen nur Zeilen „act_…“.
export const OFFENE_FORMULARE_SCHLUESSEL = "formulare-ohne-kampagne"
const BEHALTEN_TAGE = 14

export interface OffenesFormular {
  formId: string
  formName: string
  pageName: string
  leads: number
  letzterLead: string
}

export interface OffeneFormulareStand {
  formulare: OffenesFormular[]
  aktualisiert: string
}

// Aktualisiert die Liste: `neu` ersetzt bzw. ergänzt Einträge, `geprueft` (Formulare,
// die gerade ohne offenen Lead geprüft wurden) fliegen raus, ebenso inzwischen verknüpfte
// Formulare und Einträge, deren letzter Lead länger als 14 Tage her ist.
export async function offeneFormulareMelden(db: Db, neu: OffenesFormular[], geprueft: string[] = []): Promise<void> {
  const anyDb = db as unknown as GenericSupabaseClient
  const { data } = await anyDb.from("meta_konto_status").select("stand").eq("konto_id", OFFENE_FORMULARE_SCHLUESSEL).maybeSingle()
  const vorher = ((data?.stand as OffeneFormulareStand | undefined)?.formulare ?? []) as OffenesFormular[]
  const weg = new Set([...geprueft, ...neu.map((f) => f.formId)])
  let liste = [...vorher.filter((f) => !weg.has(f.formId)), ...neu]
  const grenze = Date.now() - BEHALTEN_TAGE * 86_400_000
  liste = liste.filter((f) => Date.parse(f.letzterLead) >= grenze)
  if (liste.length) {
    const { data: verknuepft } = await db.from("campaigns").select("meta_form_id").in("meta_form_id", liste.map((f) => f.formId))
    const ids = new Set((verknuepft ?? []).map((r) => r.meta_form_id))
    liste = liste.filter((f) => !ids.has(f.formId))
  }
  if (!liste.length && !vorher.length) return
  const stand: OffeneFormulareStand = { formulare: liste.sort((a, b) => b.letzterLead.localeCompare(a.letzterLead)), aktualisiert: new Date().toISOString() }
  const { error } = await anyDb.from("meta_konto_status").upsert({ konto_id: OFFENE_FORMULARE_SCHLUESSEL, stand, geprueft_am: stand.aktualisiert }, { onConflict: "konto_id" })
  if (error) console.error("[lead-zuordnung] Offene Formulare speichern fehlgeschlagen:", error.message)
}
