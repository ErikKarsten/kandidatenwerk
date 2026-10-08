// Neuimport (Atlas T-20, abgestimmt 07./08.10.2026). Läuft nach scripts/live-bereinigen.ts.
//
// 1. Kunden: aktive (nicht archivierte) Leadtable-Kunden, außer dem Sammelpool
//    "Kanzleistelle24.de". Dazu Close-Kunden auf "Gewonnen" ohne Leadtable-Kunden, wenn sie
//    in der ClickUp-Liste "Account Management - Übersicht" stehen.
//    Close-Verknüpfung nur mit einem Lead im Status "Gewonnen" (Namensabgleich über markante
//    Namensteile). Stammdaten/Kontakt kommen dann aus Close (processCloseWebhook, ohne
//    Beispielkampagne). Phase "Live".
// 2. ClickUp: je Kunde nur die Kommentare, per KI zum aktuellen Stand zusammengefasst, als
//    Kommentar im Projekt. Zuordnung über Close-Lead-ID, sonst E-Mail, sonst Name.
// 3. Kandidaten: Leads aller Leadtable-Kunden (auch archivierter) außer Absagen; ohne E-Mail
//    nur mit Telefon. Dubletten über E-Mail, sonst Telefon. Status per LEADTABLE_STATUS_MAP,
//    Zusatzfelder aus den Formularantworten, Bewerbungsdatum aus Leadtable.
// 4. Zuordnung: Leads eines importierten Kunden (nicht Sammelpool) mit Status
//    Vorqualifiziert/Vorstellungsgespräch/Eingestellt -> Zuordnung zu diesem Kunden mit
//    Status Neu/Vorstellungsgespräch/Eingestellt. Alles andere ordnet das Team von Hand zu.
//
// Ohne --ausfuehren nur Probelauf: Bericht in neuimport/ (per .gitignore ausgeschlossen).
//   npx tsx scripts/neuimport.ts                 Probelauf (lädt Leadtable einmal, Cache)
//   npx tsx scripts/neuimport.ts --neu-laden     Probelauf mit frischen Leadtable-Daten
//   npx tsx scripts/neuimport.ts --ausfuehren    schreibt in die Datenbank
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { fetchAllCampaigns, fetchAllCustomers } from "../src/lib/leadtable-import-customers"
import { cleanLeadtableEmail, extractCleanName, isTestLead, type LeadtableLead } from "../src/lib/leadtable-import"
import { LEADTABLE_STATUS_MAP } from "../src/lib/leadtable-sync-shared"
import { mapLeadFormAnswers } from "../src/lib/leadtable-form-answers"
import { WEITERE_ANTWORTEN_KEY } from "../src/lib/candidate-custom-fields"
import { mapKanzleistelleBerufsbild } from "../src/lib/sync-kanzleistelle"
import { geocodePlz } from "../src/lib/geocode-plz"
import { closeGet, closeList, customActivityLabels, leadFieldLabels, type CloseActivity, type CloseLead } from "../src/lib/close-api"
import { activityTypeOf, customActivityText } from "../src/lib/close-sync"
import { fetchWebsiteText } from "../src/lib/website-text"
import { processCloseWebhook } from "../src/lib/close-webhook"
import { closeLeadSources, extractProfileFromSources, payloadFromLead, type ProfileSource } from "../src/lib/close-onboarding"
import { generateText } from "../src/lib/llm"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
// Testlauf mit einem einzelnen Kunden: --nur=<Close-Lead-ID>
const ONLY = process.argv.find((a) => a.startsWith("--nur="))?.slice("--nur=".length) ?? null
const RELOAD = process.argv.includes("--neu-laden")
const OUT = path.resolve(__dirname, "../neuimport")
const CACHE = path.join(OUT, "leadtable-cache.json")
const POOL = /kanzleistelle24/i
// Die Agentur selbst ist kein Kunde.
const OWN_AGENCY = /endlich\s*mitarbeiter/i
const SKIP_STATUS = new Set(["Absage", "Absage mit Mitteilung"])
const STATUS_MAP: Record<string, string> = { ...LEADTABLE_STATUS_MAP, "On Hold": "in_pruefung" }
const ASSIGN_STATUS: Record<string, string> = { Vorqualifiziert: "inbox", "Vorstellungsgespräch": "vg", Eingestellt: "ja" }
// ClickUp: Space "Account Management", Liste "Übersicht" (277 Einträge, 08.10.2026).
const CLICKUP_SPACE = "account management"
const CLICKUP_LIST = "übersicht"
const CLICKUP_ACTIVE = new Set(["aktive kunden", "anstehende kunden"])

const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
fs.mkdirSync(OUT, { recursive: true })

// ── Namensabgleich ───────────────────────────────────────────────────────────────────
const STOP = new Set(
  "und steuerberatung steuerberater steuerberaterin steuerberatungsgesellschaft steuerberatungsges partner partnerschaft partnerschaftsgesellschaft kanzlei steuerkanzlei stb gmbh mbb mbh partg wirtschaftspruefer wirtschaftspruefung rechtsanwalt rechtsanwaelte rechtsanwaeltin treuhand beratung gesellschaft steuern recht prof the kg ug ohg gbr www steuerberatungsbuero steuerbuero buero team".split(" ")
)
const norm = (s: string) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\.(de|com|net)\b/g, "").replace(/[^a-z0-9]+/g, " ")
const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length >= 3 && !STOP.has(t)))

type MatchResult<T> = { kind: "sicher" | "wahrscheinlich" | "mehrdeutig" | "kein Treffer"; best: T | null; options: T[]; score: number }
function matchByName<T>(name: string, pool: T[], nameOf: (x: T) => string): MatchResult<T> {
  const a = tokens(name)
  const scored = pool
    .map((x) => {
      const b = tokens(nameOf(x))
      const inter = [...a].filter((t) => b.has(t)).length
      return { x, inter, score: inter / Math.max(1, Math.min(a.size, b.size)) }
    })
    .filter((s) => s.inter > 0)
    .sort((p, q) => q.score - p.score)
  const best = scored[0]
  if (!best || best.score < 0.5) return { kind: "kein Treffer", best: null, options: [], score: best?.score ?? 0 }
  const ties = scored.filter((s) => s.score === best.score)
  if (ties.length > 1) return { kind: "mehrdeutig", best: null, options: ties.map((t) => t.x), score: best.score }
  return { kind: best.score >= 0.99 ? "sicher" : "wahrscheinlich", best: best.x, options: [best.x], score: best.score }
}

// ── Leadtable laden (mit Cache) ──────────────────────────────────────────────────────
interface LtLead extends LeadtableLead {
  createdAt?: string
  deleted?: { state?: boolean } | boolean
  funnelData?: { profile?: Record<string, { title?: string; value?: unknown }> }
}
interface LtCustomer {
  id: string
  name: string
  archived: boolean
  campaigns: { id: string; occupation: string; leads: LtLead[] }[]
}

async function loadLeadtable(): Promise<LtCustomer[]> {
  if (!RELOAD && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, "utf8"))
  const out: LtCustomer[] = []
  for (const c of await fetchAllCustomers()) {
    const campaigns = []
    for (const camp of await fetchAllCampaigns(c._id)) {
      const first = await leadtableFetch<{ pages: { totalPages: number }; leads: LtLead[] }>(`/lead/campaign/${camp._id}`, { page: 1, limit: 100 })
      const leads = [...first.leads]
      for (let page = 2; page <= first.pages.totalPages; page++) {
        leads.push(...(await leadtableFetch<{ leads: LtLead[] }>(`/lead/campaign/${camp._id}`, { page, limit: 100 })).leads)
      }
      campaigns.push({ id: camp._id, occupation: String(camp.occupation ?? ""), leads })
    }
    out.push({ id: c._id, name: c.name.trim(), archived: String(c.archived) === "true", campaigns })
    process.stdout.write(".")
  }
  fs.writeFileSync(CACHE, JSON.stringify(out))
  console.log("")
  return out
}

// ── ClickUp ──────────────────────────────────────────────────────────────────────────
interface ClickupTask {
  id: string
  name: string
  description?: string
  status?: { status?: string }
  custom_fields?: { name: string; value?: unknown }[]
}

const clickupField = (t: ClickupTask, name: string) => {
  const v = t.custom_fields?.find((f) => f.name === name)?.value
  return typeof v === "string" ? v : ""
}
const clickupStatus = (t: ClickupTask) => (t.status?.status ?? "").toLowerCase()
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

async function clickup<T>(p: string): Promise<T> {
  const res = await fetch(`https://api.clickup.com/api/v2${p}`, { headers: { Authorization: process.env.CLICKUP_API_TOKEN! } })
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000))
    return clickup<T>(p)
  }
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

async function loadClickup(): Promise<ClickupTask[] | null> {
  if (!process.env.CLICKUP_API_TOKEN) return null
  const { teams } = await clickup<{ teams: { id: string }[] }>("/team")
  for (const team of teams) {
    const { spaces } = await clickup<{ spaces: { id: string; name: string }[] }>(`/team/${team.id}/space?archived=false`)
    for (const space of spaces.filter((sp) => sp.name.trim().toLowerCase() === CLICKUP_SPACE)) {
      const { folders } = await clickup<{ folders: { lists: { id: string; name: string }[] }[] }>(`/space/${space.id}/folder?archived=false`)
      const { lists } = await clickup<{ lists: { id: string; name: string }[] }>(`/space/${space.id}/list?archived=false`)
      const all = [...lists, ...folders.flatMap((f) => f.lists)]
      const list = all.find((l) => l.name.trim().toLowerCase() === CLICKUP_LIST)
      if (!list) continue
      const tasks: ClickupTask[] = []
      for (let page = 0; page < 50; page++) {
        const r = await clickup<{ tasks: ClickupTask[]; last_page?: boolean }>(`/list/${list.id}/task?page=${page}&include_closed=true&subtasks=false`)
        tasks.push(...r.tasks)
        if (r.last_page || r.tasks.length === 0) break
      }
      return tasks
    }
  }
  throw new Error(`ClickUp-Liste „${CLICKUP_SPACE} / ${CLICKUP_LIST}“ nicht gefunden.`)
}

function clickupText(t: ClickupTask): string {
  return [t.description ?? "", ...(t.custom_fields ?? []).map((f) => (typeof f.value === "string" ? f.value : ""))].join(" ")
}

async function clickupComments(taskId: string): Promise<{ date: string; user: string; text: string }[]> {
  const r = await clickup<{ comments: { comment_text: string; date: string; user?: { username?: string } }[] }>(`/task/${taskId}/comment`)
  return r.comments
    .map((c) => ({ date: new Date(Number(c.date)).toISOString().slice(0, 10), user: c.user?.username ?? "", text: c.comment_text.trim() }))
    .filter((c) => c.text)
    .reverse()
}

async function summarizeClickup(clientName: string, comments: { date: string; user: string; text: string }[]): Promise<string> {
  const source = comments.map((c) => `[${c.date}${c.user ? `, ${c.user}` : ""}] ${c.text}`).join("\n\n").slice(-60_000)
  return generateText({
    tier: "smart",
    maxTokens: 1500,
    timeoutMs: 120_000,
    system:
      "Du fasst die Kommentare aus dem bisherigen Projektmanagement (ClickUp) zu einer Steuerkanzlei für den Key Account Manager von Endlich Mitarbeiter (Recruiting für Steuerkanzleien) zusammen. Schreibe den aktuellen Stand der Zusammenarbeit: Kurzfazit in ein bis zwei Sätzen, dann Stichpunkte mit \"- \" zu laufenden Themen, gesuchten Profilen, Vereinbarungen und offenen Aufgaben. Regeln: Neuere Kommentare haben Vorrang. Nur wiedergeben, was in den Kommentaren steht - keine eigenen Schlussfolgerungen oder Vermutungen und keine Aufzählung dessen, was nicht dokumentiert ist. Fachbegriffe im Kontext einer Steuerkanzlei lesen: \"Lohn\" meint die Lohnbuchhaltung, \"JA\" Jahresabschlüsse, \"FiBu\" Finanzbuchhaltung - nicht Gehalt. Gehalt nur nennen, wenn ausdrücklich von Gehalt oder Bezahlung die Rede ist. Keine Markdown-Überschriften mit #.",
    prompt: `Kanzlei: ${clientName}\n\nKommentare (älteste zuerst):\n${source}`,
  })
}

// ── Hilfen ───────────────────────────────────────────────────────────────────────────
const normPhone = (p: string | null | undefined) => {
  const digits = (p ?? "").replace(/\D/g, "").replace(/^0049/, "49").replace(/^0/, "49")
  return digits.length >= 8 ? digits : ""
}
const csvEsc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`

interface PlannedCandidate {
  key: string
  lead: LtLead
  email: string | null
  phone: string | null
  status: string
  ltStatus: string
  customer: LtCustomer
  occupation: string
  others: { customer: string; occupation: string; status: string }[]
  assignTo: Map<string, string> // Leadtable-Kunden-ID -> Zuordnungsstatus
}

// Mehrere Einträge gleichzeitig verarbeiten (KI-Aufrufe sind der Engpass, kie.ai erlaubt
// 20 Anfragen je 10 Sekunden).
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++])
    })
  )
}

// Close: Notizen, Formulare und Besprechungs-Zusammenfassungen eines Leads (ohne Telefonate,
// deren Transkription wäre für den Massenimport zu langsam).
async function closeActivitySources(leadId: string, labels: { types: Map<string, string>; fields: Map<string, string> }): Promise<ProfileSource[]> {
  const activities = await closeList<CloseActivity>(`/activity/?lead_id=${encodeURIComponent(leadId)}`, 1000).catch(() => [] as CloseActivity[])
  const out: ProfileSource[] = []
  for (const a of activities) {
    const type = activityTypeOf(a)
    const at = a.activity_at ?? a.date_created ?? null
    if (type === "meeting" && a.summary?.text) out.push({ label: `Close: Besprechung – ${a.title ?? ""}`, at, text: a.summary.text })
    else if (type === "note" && a.note?.trim()) out.push({ label: "Close: Notiz", at, text: a.note })
    else if (type === "custom") {
      const text = customActivityText(a, labels.fields)
      if (text) out.push({ label: `Close: Formular ${labels.types.get(a.custom_activity_type_id ?? "") ?? ""}`, at, text })
    }
  }
  return out
}

async function main() {
  console.log(EXECUTE ? "MODUS: AUSFÜHREN" : "MODUS: Probelauf (schreibt nichts)")

  // Sicherheitsnetz: nur auf geleerter Datenbank ausführen.
  const { count: clientCount } = await db.from("clients").select("id", { count: "exact", head: true })
  // Nur Leadtable-Kandidaten zählen - neue Bewerbungen über Meta/Kanzleistelle24 seit dem
  // Leeren sind echte Daten und bleiben (Dubletten werden beim Import erkannt).
  const { count: candidateCount } = await db.from("candidates").select("id", { count: "exact", head: true }).eq("source", "leadtable")
  // Kunden aus einem vorherigen (abgebrochenen) Lauf werden wiederverwendet; gesperrt wird
  // nur, wenn schon Leadtable-Kandidaten importiert sind.
  if (EXECUTE && !ONLY && (candidateCount ?? 0) > 0) {
    throw new Error(`Datenbank ist nicht leer (${clientCount} Kunden, ${candidateCount} Kandidaten) - erst scripts/live-bereinigen.ts.`)
  }

  const customers = await loadLeadtable()
  const won = await closeList<{ id: string; display_name: string }>(`/lead/?query=${encodeURIComponent('lead_status:"Gewonnen"')}&_fields=id,display_name`, 2000)
  const clickupTasks = await loadClickup()

  // 1. Kunden planen
  interface PlannedClient {
    name: string
    leadtableId: string | null
    close: { id: string; display_name: string } | null
    closeMatch: string
    clickup: ClickupTask | null
    source: "leadtable" | "close+clickup"
  }
  const planned: PlannedClient[] = []
  const usedClose = new Set<string>()
  // Close-Kontakt-E-Mails je Lead (für den Abgleich über "Ansprechpartner Sales").
  const closeEmailCache = new Map<string, string[]>()
  const closeEmails = async (leadId: string) => {
    if (!closeEmailCache.has(leadId)) {
      const lead = await closeGet<CloseLead>(`/lead/${encodeURIComponent(leadId)}/?_fields=id,contacts`).catch(() => null)
      closeEmailCache.set(leadId, (lead?.contacts ?? []).flatMap((c) => (c.emails ?? []).map((e) => e.email.toLowerCase())))
    }
    return closeEmailCache.get(leadId)!
  }
  const findClickup = async (name: string, closeId: string | null): Promise<ClickupTask | null> => {
    if (!clickupTasks) return null
    if (closeId) {
      const byId = clickupTasks.find((t) => clickupField(t, "Close Lead-ID").includes(closeId) || clickupText(t).includes(closeId))
      if (byId) return byId
      const emails = await closeEmails(closeId)
      const byEmail = clickupTasks.find((t) => (clickupField(t, "Ansprechpartner Sales").match(EMAIL_RE) ?? []).some((e) => emails.includes(e.toLowerCase())))
      if (byEmail) return byEmail
    }
    const m = matchByName(name, clickupTasks, (t) => t.name)
    return m.kind === "sicher" || m.kind === "wahrscheinlich" ? m.best : null
  }

  for (const c of customers.filter((x) => !x.archived && !POOL.test(x.name) && !OWN_AGENCY.test(x.name))) {
    // Ein Close-Lead gehört zu genau einem Kunden: ähnliche Namen in Leadtable
    // (z. B. „ZRK …“ und „ZRK … Stahlecker“) sind eigene Kanzleien.
    const m = matchByName(c.name, won.filter((l) => !usedClose.has(l.id)), (l) => l.display_name)
    const close = m.kind === "sicher" || m.kind === "wahrscheinlich" ? m.best : null
    if (close) usedClose.add(close.id)
    planned.push({
      name: close?.display_name ?? c.name,
      leadtableId: c.id,
      close,
      closeMatch: m.kind === "mehrdeutig" ? `mehrdeutig: ${m.options.map((o) => o.display_name).join(" | ")}` : m.kind,
      clickup: await findClickup(c.name, close?.id ?? null),
      source: "leadtable",
    })
  }
  // Close-Kunden ohne Leadtable: nur wenn sie in ClickUp aktiv oder anstehend sind.
  const closeOnly = won.filter((l) => !usedClose.has(l.id) && !OWN_AGENCY.test(l.display_name))
  const closeOnlyInClickup: typeof closeOnly = []
  const closeOnlyOld: string[] = []
  for (const l of closeOnly) {
    const task = await findClickup(l.display_name, l.id)
    if (!task) continue
    if (!CLICKUP_ACTIVE.has(clickupStatus(task))) {
      closeOnlyOld.push(`${l.display_name} (${clickupStatus(task)})`)
      continue
    }
    closeOnlyInClickup.push(l)
    planned.push({ name: l.display_name, leadtableId: null, close: l, closeMatch: "nur Close", clickup: task, source: "close+clickup" })
  }
  // Testlauf: nur ein Kunde.
  if (ONLY) {
    const keep = planned.filter((p) => p.close?.id === ONLY)
    if (keep.length === 0) throw new Error(`--nur=${ONLY}: Kunde nicht in der Planung (kein aktiver Leadtable-Kunde und nicht aktiv in ClickUp?).`)
    planned.splice(0, planned.length, ...keep)
  }

  // 2. Kandidaten planen
  const byKey = new Map<string, PlannedCandidate>()
  const skipped = { absage: 0, test: 0, ohneKontakt: 0, geloescht: 0 }
  const onlyLeadtableIds = ONLY ? new Set(planned.map((p) => p.leadtableId).filter(Boolean)) : null
  for (const customer of customers) {
    if (onlyLeadtableIds && !onlyLeadtableIds.has(customer.id)) continue
    for (const camp of customer.campaigns) {
      for (const lead of camp.leads) {
        const ltStatus = lead.status ?? ""
        const deleted = typeof lead.deleted === "object" ? !!lead.deleted?.state : !!lead.deleted
        if (deleted) { skipped.geloescht++; continue }
        if (SKIP_STATUS.has(ltStatus)) { skipped.absage++; continue }
        if (isTestLead(lead) || mapLeadFormAnswers(lead.funnelData?.profile).isTestLead) { skipped.test++; continue }
        const email = lead.email ? cleanLeadtableEmail(lead.email).toLowerCase() : null
        const phone = lead.phone?.trim() || null
        const key = email ? `e:${email}` : normPhone(phone) ? `t:${normPhone(phone)}` : null
        if (!key) { skipped.ohneKontakt++; continue }
        const status = STATUS_MAP[ltStatus] ?? "neu"
        const existing = byKey.get(key)
        const entry: PlannedCandidate = existing ?? { key, lead, email, phone, status, ltStatus, customer, occupation: camp.occupation, others: [], assignTo: new Map() }
        if (existing) {
          existing.others.push({ customer: customer.name, occupation: camp.occupation, status: ltStatus })
          // Neuester Lead bestimmt den Stand.
          if ((lead.createdAt ?? "") > (existing.lead.createdAt ?? "")) Object.assign(existing, { lead, status, ltStatus, customer, occupation: camp.occupation })
        }
        if (ASSIGN_STATUS[ltStatus] && !POOL.test(customer.name) && !customer.archived) entry.assignTo.set(customer.id, ASSIGN_STATUS[ltStatus])
        byKey.set(key, entry)
      }
    }
  }
  const candidates = [...byKey.values()]
  const statusCount = candidates.reduce<Record<string, number>>((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {})
  const assignmentCount = candidates.reduce((n, c) => n + c.assignTo.size, 0)

  // Bericht
  const report = [
    `# Neuimport ${EXECUTE ? "(ausgeführt)" : "(Probelauf)"}${ONLY ? ` – nur ${ONLY}` : ""} – ${new Date().toISOString().slice(0, 16)}`,
    "",
    `Kunden: ${planned.length} (aus Leadtable ${planned.filter((p) => p.source === "leadtable").length}, nur Close + ClickUp ${closeOnlyInClickup.length})`,
    `- mit Close verknüpft: ${planned.filter((p) => p.close).length}`,
    `- mit ClickUp-Kommentaren: ${planned.filter((p) => p.clickup).length}${clickupTasks ? ` (ClickUp-Liste: ${clickupTasks.length} Einträge)` : " – ClickUp nicht verbunden (CLICKUP_API_TOKEN fehlt)"}`,
    `- Close-Kunden ohne Leadtable, in ClickUp nur „alte Kunden“ (nicht angelegt): ${closeOnlyOld.length}`,
    `Kandidaten: ${candidates.length} (Status: ${Object.entries(statusCount).map(([k, v]) => `${k} ${v}`).join(", ")})`,
    `- Zuordnungen zu Kunden: ${assignmentCount}`,
    `- übersprungen: Absagen ${skipped.absage}, ohne E-Mail und Telefon ${skipped.ohneKontakt}, Testleads ${skipped.test}, in Leadtable gelöscht ${skipped.geloescht}`,
    `- zusammengeführte Mehrfach-Bewerbungen: ${candidates.filter((c) => c.others.length > 0).length}`,
  ].join("\n")
  fs.writeFileSync(path.join(OUT, "bericht.md"), report + "\n")
  fs.writeFileSync(
    path.join(OUT, "kunden.csv"),
    "﻿" +
      ["kunde;quelle;leadtable_name;close_abgleich;close_lead;close_id;clickup_eintrag"]
        .concat(planned.map((p) => [csvEsc(p.name), p.source, csvEsc(customers.find((c) => c.id === p.leadtableId)?.name ?? ""), csvEsc(p.closeMatch), csvEsc(p.close?.display_name ?? ""), p.close?.id ?? "", csvEsc(p.clickup?.name ?? "")].join(";")))
        .join("\n")
  )
  if (clickupTasks) {
    const usedTasks = new Set(planned.map((p) => p.clickup?.id).filter(Boolean))
    fs.writeFileSync(path.join(OUT, "clickup-ohne-zuordnung.csv"), "﻿clickup_eintrag;clickup_id\n" + clickupTasks.filter((t) => !usedTasks.has(t.id)).map((t) => `${csvEsc(t.name)};${t.id}`).join("\n"))
  }
  console.log(report)
  if (!EXECUTE) return

  // ── Ausführen ──────────────────────────────────────────────────────────────────────
  const { data: agency } = await db.from("agencies").select("id").limit(1).single()
  const clientIdByLeadtable = new Map<string, string>()
  const [leadLabels, activityLabels] = await Promise.all([leadFieldLabels(), customActivityLabels()])
  const profileStats = { befuellt: 0, fehler: 0 }
  let done = 0
  await pool(planned, 5, async (p) => {
    try {
      // 1. Kunde anlegen bzw. aus Close verknüpfen.
      let clientId: string
      let lead: CloseLead | null = null
      if (p.close) {
        lead = await closeGet<CloseLead>(`/lead/${encodeURIComponent(p.close.id)}/`)
        const payload = { ...payloadFromLead(lead!, "Gewonnen"), firma: p.name }
        clientId = (await processCloseWebhook(db, payload, { bulkImport: true })).clientId
      } else {
        const { data: existing } = await db.from("clients").select("id").eq("name", p.name).is("close_lead_id", null).limit(1).maybeSingle()
        if (existing) clientId = existing.id
        else {
          const { data, error } = await db.from("clients").insert({ name: p.name, agency_id: agency!.id, status: "active" }).select("id").single()
          if (error) throw new Error(error.message)
          clientId = data.id
        }
      }
      // ClickUp "anstehende Kunden" starten im Onboarding, alle anderen sind live.
      await db.from("clients").update({ project_phase: p.clickup && clickupStatus(p.clickup) === "anstehende kunden" ? "onboarding" : "live" }).eq("id", clientId)
      if (p.leadtableId) clientIdByLeadtable.set(p.leadtableId, clientId)

      // 2. Quellen fürs Kanzleiprofil: ClickUp (Beschreibung, Kommentare), Close, Website.
      const sources: ProfileSource[] = []
      let comments: { date: string; user: string; text: string }[] = []
      if (p.clickup) {
        comments = await clickupComments(p.clickup.id).catch(() => [])
        if (p.clickup.description?.trim()) sources.push({ label: "ClickUp: Beschreibung", text: p.clickup.description })
        const fields = (p.clickup.custom_fields ?? []).filter((f) => typeof f.value === "string" && f.value.trim()).map((f) => `${f.name}: ${f.value}`)
        if (fields.length) sources.push({ label: "ClickUp: Felder", text: fields.join("\n") })
        if (comments.length) sources.push({ label: "ClickUp: Kommentare", text: comments.map((c) => `[${c.date}] ${c.text}`).join("\n") })
      }
      if (lead) {
        sources.push(...closeLeadSources(lead, leadLabels), ...(await closeActivitySources(lead.id, activityLabels)))
        const website = await fetchWebsiteText(lead.url as string | null)
        if (website) sources.push({ label: "Website der Kanzlei", text: website })
      }

      // Erneuter Lauf: schon befüllte Kunden nicht noch einmal per KI bearbeiten.
      const [{ data: hasProfile }, { data: hasSummary }] = await Promise.all([
        db.from("client_profiles").select("client_id").eq("client_id", clientId).not("intro", "is", null).maybeSingle(),
        db.from("client_comments").select("id").eq("client_id", clientId).like("content", "Stand aus ClickUp%").maybeSingle(),
      ])

      // 3. ClickUp-Kommentare als Stand im Projekt.
      if (comments.length > 0 && !hasSummary) {
        const summary = await summarizeClickup(p.name, comments)
        const content = `Stand aus ClickUp (zusammengefasst, ${comments.length} Kommentare)\n\n${summary}`
        const { data: existing } = await db.from("client_comments").select("id").eq("client_id", clientId).like("content", "Stand aus ClickUp%").maybeSingle()
        if (existing) await db.from("client_comments").update({ content }).eq("id", existing.id)
        else await db.from("client_comments").insert({ client_id: clientId, author_id: null, kind: "notiz", content })
      }

      // 4. Kanzleiprofil, Benefits und Stellen per KI (füllt nur leere Felder).
      if (sources.length > 0 && !hasProfile) {
        const profile = await extractProfileFromSources(p.name, sources)
        await processCloseWebhook(db, { ...profile, firma: p.name, close_lead_id: p.close?.id }, { bulkImport: true, clientId })
        profileStats.befuellt++
      }
    } catch (err) {
      profileStats.fehler++
      console.error(`Kunde ${p.name}:`, err instanceof Error ? err.message : err)
    }
    if (++done % 10 === 0) console.log(`Kunden: ${done}/${planned.length}`)
  })
  console.log(`Kanzleiprofile befüllt: ${profileStats.befuellt}, Fehler: ${profileStats.fehler}`)

  done = 0
  await pool(candidates, 10, async (c) => {
    const { firstName, lastName } = extractCleanName(c.lead.name ?? "")
    // Formularantworten über die Fragetitel (Zusatzfelder, PLZ); Rest ins Zusatzfeld
    // "Weitere Antworten" - die Beschreibung bleibt leer (Entscheidung Paket 18).
    const answers = mapLeadFormAnswers(c.lead.funnelData?.profile)
    const customFields: Record<string, string> = { ...answers.fields }
    if (answers.extras.length) customFields[WEITERE_ANTWORTEN_KEY] = answers.extras.map((x) => `${x.question}: ${x.answer}`).join("\n")
    const plz = answers.plz
    const coords = plz ? geocodePlz(plz) : null
    // Gibt es die Person schon (z.B. neue Bewerbung seit dem Leeren)? Dann nicht doppelt anlegen.
    const { data: existingByEmail } = c.email ? await db.from("candidates").select("id").eq("email", c.email).limit(1).maybeSingle() : { data: null }
    if (existingByEmail) {
      await db.from("candidates").update({ leadtable_lead_id: c.lead._id }).eq("id", existingByEmail.id)
      await db.from("candidate_history").insert({ candidate_id: existingByEmail.id, type: "note", content: `Auch in Leadtable vorhanden: Kunde „${c.customer.name}“, Status „${c.ltStatus}“.` })
      if (++done % 100 === 0) console.log(`Kandidaten: ${done}/${candidates.length}`)
      return
    }
    const { data: inserted, error } = await db
      .from("candidates")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: c.email,
        phone: c.phone,
        status: c.status,
        source: "leadtable",
        berufsbild: mapKanzleistelleBerufsbild(c.occupation),
        plz,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        leadtable_lead_id: c.lead._id,
        custom_fields: customFields,
        ...(c.lead.createdAt ? { created_at: c.lead.createdAt } : {}),
      })
      .select("id")
      .single()
    if (error) {
      console.error(`Kandidat ${c.key}: ${error.message}`)
      return
    }
    const origin = [`Kunde „${c.customer.name}“`, c.occupation && `Kampagne „${c.occupation}“`, `Status „${c.ltStatus}“`].filter(Boolean).join(", ")
    const others = c.others.length ? ` Weitere Bewerbungen: ${c.others.map((o) => `${o.customer} (${o.status})`).join("; ")}.` : ""
    await db.from("candidate_history").insert({ candidate_id: inserted.id, type: "note", content: `Import aus Leadtable: ${origin}.${others}` })
    for (const [ltCustomerId, status] of c.assignTo) {
      const clientId = clientIdByLeadtable.get(ltCustomerId)
      if (!clientId) continue
      const { error: assignError } = await db.from("client_assignments").insert({ candidate_id: inserted.id, client_id: clientId, status })
      if (assignError) console.error(`Zuordnung ${c.key}: ${assignError.message}`)
    }
    if (++done % 100 === 0) console.log(`Kandidaten: ${done}/${candidates.length}`)
  })
  console.log("Fertig.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
