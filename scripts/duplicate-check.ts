// Tägliche Duplettenprüfung für Kunden und Kandidaten. Findet Verdachtsfälle rein
// heuristisch (keine automatische Zusammenführung!) und schickt bei Funden eine
// Zusammenfassung per Mail an alle Agentur-Admins. Werden keine Verdachtsfälle
// gefunden, wird bewusst KEINE Mail verschickt - keine tägliche "alles gut"-Mail.
//
// Kunden-Duplikate: gleiche PLZ + hohe Namens-Ähnlichkeit (Token-Überlappung, nach
// Entfernen von Rechtsform-Zusätzen wie GmbH/mbB/KG).
// Kandidaten-Duplikate: identische E-Mail-Adresse (eindeutigstes Signal) UND separat
// identischer Name + PLZ (für Fälle ohne/mit abweichender E-Mail).
//
// Usage:
//   npx tsx scripts/duplicate-check.ts             (voller Lauf, verschickt bei Funden eine Mail)
//   npx tsx scripts/duplicate-check.ts --dry-run    (zeigt die generierte Mail nur an, verschickt nichts)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { sendEmail } from "../src/lib/brevo-mail"
import { getAdminEmails } from "../src/lib/get-admin-emails"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"
const ARCHIVED_STATUS = "Archiviert"

// Ab diesem Overlap-Koeffizienten (Schnittmenge / kleinere Token-Menge) gelten zwei
// Kundennamen an derselben PLZ als verdächtig ähnlich. 0.6 heißt: mindestens 60% der
// Begriffe des kürzeren Namens stecken auch im anderen - bewusst konservativ gewählt,
// damit z.B. zwei unterschiedliche "X Steuerberatung"/"Y Steuerberatung"-Kanzleien
// (nur 1 von 2 Begriffen gemeinsam = 0.5) nicht anschlagen.
const SIMILARITY_THRESHOLD = 0.6

// Deutsche Rechtsform-Kürzel, die vor dem Namensvergleich entfernt werden (nach
// Kleinschreibung/Sonderzeichen-Bereinigung, siehe normalizeClientName) - tragen nichts
// zur eigentlichen Firmenidentität bei und würden sonst z.B. "X GmbH" und "X mbB" als
// unähnlicher erscheinen lassen, als sie sind.
const LEGAL_FORM_TOKENS = new Set([
  "gmbh", "mbh", "mbb", "kg", "ohg", "gbr", "ug", "ag", "se", "partg", "ek", "eg", "co",
])

type SupabaseClient = ReturnType<typeof createClient<Database>>

interface ClientRow {
  id: string
  name: string
  plz: string | null
}

interface CandidateRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  plz: string | null
}

interface ClientDuplicateGroup {
  plz: string
  commonTerms: string[]
  clients: ClientRow[]
}

// ── Normalisierung & Ähnlichkeit (Kunden) ───────────────────────────────────

function normalizeClientName(raw: string): string {
  let s = raw.toLowerCase()
  // Klammerzusätze (interne Notizen wie "(altes Produkt)") raus - keine Firmenidentität.
  s = s.replace(/\([^)]*\)/g, " ")
  // Satzzeichen/Sonderzeichen durch Leerzeichen ersetzen, deutsche Umlaute/ß bleiben,
  // da echter Namensbestandteil.
  s = s.replace(/[^a-zäöüß0-9\s]/g, " ")
  return s.replace(/\s+/g, " ").trim()
}

function tokenizeClientName(raw: string): string[] {
  return normalizeClientName(raw)
    .split(" ")
    .filter((t) => t.length > 0 && !LEGAL_FORM_TOKENS.has(t))
}

function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  return intersection / Math.min(a.size, b.size)
}

// Einfaches Union-Find (Array-frei, per Map) für die Cluster-Bildung innerhalb einer
// PLZ - so werden nicht nur einzelne Paare erkannt, sondern auch Gruppen von 3+
// Kunden, die transitiv über gemeinsame Begriffe verbunden sind.
function findClientDuplicateGroups(clients: ClientRow[]): ClientDuplicateGroup[] {
  const byPlz = new Map<string, ClientRow[]>()
  for (const c of clients) {
    const plz = c.plz?.trim()
    if (!plz) continue
    const list = byPlz.get(plz) ?? []
    list.push(c)
    byPlz.set(plz, list)
  }

  const groups: ClientDuplicateGroup[] = []

  for (const [plz, list] of byPlz) {
    if (list.length < 2) continue

    const tokenSets = new Map(list.map((c) => [c.id, new Set(tokenizeClientName(c.name))]))

    const parent = new Map(list.map((c) => [c.id, c.id]))
    function find(x: string): string {
      while (parent.get(x) !== x) x = parent.get(x)!
      return x
    }
    function union(a: string, b: string) {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const score = overlapCoefficient(tokenSets.get(list[i].id)!, tokenSets.get(list[j].id)!)
        if (score >= SIMILARITY_THRESHOLD) union(list[i].id, list[j].id)
      }
    }

    const clusters = new Map<string, ClientRow[]>()
    for (const c of list) {
      const root = find(c.id)
      const arr = clusters.get(root) ?? []
      arr.push(c)
      clusters.set(root, arr)
    }

    for (const cluster of clusters.values()) {
      if (cluster.length < 2) continue
      const sets = cluster.map((c) => tokenSets.get(c.id)!)
      const commonTerms = [...sets[0]].filter((token) => sets.every((s) => s.has(token)))
      groups.push({ plz, commonTerms, clients: cluster })
    }
  }

  return groups
}

// ── Kandidaten-Duplikate ─────────────────────────────────────────────────

function findCandidateEmailDuplicates(candidates: CandidateRow[]): CandidateRow[][] {
  const byEmail = new Map<string, CandidateRow[]>()
  for (const c of candidates) {
    const email = c.email?.trim().toLowerCase()
    if (!email) continue
    const list = byEmail.get(email) ?? []
    list.push(c)
    byEmail.set(email, list)
  }
  return [...byEmail.values()].filter((list) => list.length >= 2)
}

function findCandidateNamePlzDuplicates(candidates: CandidateRow[]): CandidateRow[][] {
  const byKey = new Map<string, CandidateRow[]>()
  for (const c of candidates) {
    const plz = c.plz?.trim()
    const name = `${c.first_name} ${c.last_name}`.trim().toLowerCase().replace(/\s+/g, " ")
    if (!plz || !name) continue
    const key = `${name}__${plz}`
    const list = byKey.get(key) ?? []
    list.push(c)
    byKey.set(key, list)
  }
  return [...byKey.values()].filter((list) => list.length >= 2)
}

// ── HTML-Mail ────────────────────────────────────────────────────────────
// Inline-CSS auf jedem Element (statt <style>-Block) - viele Mail-Clients (allen voran
// Outlook/Gmail) ignorieren eingebettete/externe Stylesheets komplett, nur
// element-style="..." kommt zuverlässig überall an.

const BRAND_BLUE = "#1e56a0"
const CARD_BG = "#f8fafc"
const BORDER_GRAY = "#e5e7eb"
const TEXT_GRAY = "#6b7280"
const TEXT_LIGHT_GRAY = "#9ca3af"
const FONT_STACK = "-apple-system, Helvetica, Arial, sans-serif"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function clientLink(id: string): string {
  return `${APP_BASE_URL}/dashboard/clients/${id}`
}

function candidateLink(id: string): string {
  return `${APP_BASE_URL}/dashboard/candidates/${id}`
}

interface GroupCardItem {
  name: string
  href: string
  id: string
}

// Eine Verdachtsgruppe als eigene, abgegrenzte Karte statt Aufzählungspunkt - reason
// als kleine graue Überschrift der Karte, darunter jeder Kandidat/Kunde als klickbarer
// Link in Markenblau mit grauer ID darunter. Von allen drei Abschnitten unten genutzt
// (Kunden-PLZ-Gruppen, Kandidaten-E-Mail-Gruppen, Kandidaten-Name+PLZ-Gruppen), da sie
// optisch identisch sind - nur reason-Text und Ziel-Links unterscheiden sich.
function renderGroupCard(reason: string, items: GroupCardItem[]): string {
  const rows = items
    .map(
      (item) => `
        <div style="margin-bottom:8px;">
          <a href="${item.href}" style="color:${BRAND_BLUE};text-decoration:none;font-size:14px;font-weight:500;">${escapeHtml(item.name)}</a>
          <div style="font-size:11px;color:${TEXT_LIGHT_GRAY};margin-top:1px;">ID: ${item.id}</div>
        </div>`
    )
    .join("")

  return `
      <div style="background-color:${CARD_BG};border-radius:8px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:12px;color:${TEXT_GRAY};margin-bottom:10px;">${reason}</div>${rows}
      </div>`
}

// Abschnittsüberschrift mit dünner Trennlinie darüber - grenzt die drei
// Fund-Kategorien optisch klar voneinander (und vom Intro-Text darüber) ab.
function renderSection(title: string, cardsHtml: string): string {
  return `
    <div style="border-top:1px solid ${BORDER_GRAY};padding-top:20px;margin-top:20px;">
      <h2 style="font-size:14px;font-weight:600;color:#111827;margin:0 0 14px;">${title}</h2>${cardsHtml}
    </div>`
}

function buildEmailHtml(params: {
  clientGroups: ClientDuplicateGroup[]
  candidateEmailGroups: CandidateRow[][]
  candidateNamePlzGroups: CandidateRow[][]
}): string {
  const sections: string[] = []

  if (params.clientGroups.length > 0) {
    const cards = params.clientGroups
      .map((g) => {
        const reason =
          g.commonTerms.length > 0
            ? `Gleiche PLZ ${escapeHtml(g.plz)}, gemeinsame Begriffe: ${escapeHtml(g.commonTerms.join(", "))}`
            : `Gleiche PLZ ${escapeHtml(g.plz)}, hohe Namens-Ähnlichkeit`
        const items = g.clients.map((c) => ({ name: c.name, href: clientLink(c.id), id: c.id }))
        return renderGroupCard(reason, items)
      })
      .join("")
    sections.push(renderSection(`Mögliche Kunden-Dubletten (${params.clientGroups.length})`, cards))
  }

  if (params.candidateEmailGroups.length > 0) {
    const cards = params.candidateEmailGroups
      .map((group) => {
        const reason = `Gleiche E-Mail-Adresse: ${escapeHtml(group[0].email ?? "")}`
        const items = group.map((c) => ({
          name: `${c.first_name} ${c.last_name}`,
          href: candidateLink(c.id),
          id: c.id,
        }))
        return renderGroupCard(reason, items)
      })
      .join("")
    sections.push(
      renderSection(`Mögliche Kandidaten-Dubletten – gleiche E-Mail (${params.candidateEmailGroups.length})`, cards)
    )
  }

  if (params.candidateNamePlzGroups.length > 0) {
    const cards = params.candidateNamePlzGroups
      .map((group) => {
        const reason = `Gleicher Name + PLZ ${escapeHtml(group[0].plz ?? "")}`
        const items = group.map((c) => ({
          name: `${c.first_name} ${c.last_name}`,
          href: candidateLink(c.id),
          id: c.id,
        }))
        return renderGroupCard(reason, items)
      })
      .join("")
    sections.push(
      renderSection(
        `Mögliche Kandidaten-Dubletten – gleicher Name &amp; PLZ (${params.candidateNamePlzGroups.length})`,
        cards
      )
    )
  }

  const generatedDate = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  return `
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid ${BORDER_GRAY};border-radius:8px;font-family:${FONT_STACK};overflow:hidden;">
  <div style="padding:28px 28px 4px;">
    <div style="font-size:20px;font-weight:700;color:${BRAND_BLUE};">Kandidatenwerk</div>
    <div style="font-size:16px;font-weight:600;color:#111827;margin-top:6px;">Tägliche Duplettenprüfung</div>
    <div style="font-size:13px;color:${TEXT_GRAY};margin-top:10px;line-height:1.5;">
      Rein heuristisch gefundene Verdachtsfälle - bitte einzeln prüfen, es wird nichts
      automatisch zusammengeführt.
    </div>
  </div>
  <div style="padding:0 28px;">${sections.join("")}
  </div>
  <div style="padding:20px 28px 24px;margin-top:8px;border-top:1px solid ${BORDER_GRAY};">
    <div style="font-size:11px;color:${TEXT_LIGHT_GRAY};">Automatisch generiert von Kandidatenwerk am ${generatedDate}</div>
  </div>
</div>
`.trim()
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const supabase: SupabaseClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  console.log("=== Kunden laden (ohne archivierte) ===")
  const { data: clientRows, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, plz, status")
    .neq("status", ARCHIVED_STATUS)
  if (clientsError) throw new Error(`Kunden konnten nicht geladen werden: ${clientsError.message}`)

  console.log("=== Kandidaten laden ===")
  const { data: candidateRows, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, plz")
  if (candidatesError) throw new Error(`Kandidaten konnten nicht geladen werden: ${candidatesError.message}`)

  const clients: ClientRow[] = clientRows ?? []
  const candidates: CandidateRow[] = candidateRows ?? []
  console.log(`${clients.length} Kunden, ${candidates.length} Kandidaten geladen`)
  console.log("")

  const clientGroups = findClientDuplicateGroups(clients)
  const candidateEmailGroups = findCandidateEmailDuplicates(candidates)
  const candidateNamePlzGroups = findCandidateNamePlzDuplicates(candidates)

  console.log("=== Ergebnis ===")
  console.log(`Kunden-Verdachtsgruppen (PLZ + Namens-Ähnlichkeit): ${clientGroups.length}`)
  console.log(`Kandidaten-Verdachtsgruppen (gleiche E-Mail): ${candidateEmailGroups.length}`)
  console.log(`Kandidaten-Verdachtsgruppen (gleicher Name + PLZ): ${candidateNamePlzGroups.length}`)

  const totalFindings = clientGroups.length + candidateEmailGroups.length + candidateNamePlzGroups.length

  if (totalFindings === 0) {
    console.log("")
    console.log("Keine Verdachtsfälle gefunden - es wird keine Mail verschickt.")
    return
  }

  const html = buildEmailHtml({ clientGroups, candidateEmailGroups, candidateNamePlzGroups })
  const subject = `Duplettenprüfung: ${totalFindings} Verdachtsgruppe${totalFindings !== 1 ? "n" : ""} gefunden`

  if (dryRun) {
    console.log("")
    console.log("=== --dry-run: Mail wird NICHT verschickt, nur angezeigt ===")
    console.log(`Betreff: ${subject}`)
    console.log("")
    console.log(html)
    return
  }

  console.log("")
  console.log("=== Admin-E-Mail-Adressen laden ===")
  const adminEmails = await getAdminEmails(supabase)
  if (adminEmails.length === 0) {
    console.log("Keine Admin-E-Mail-Adressen gefunden - Mail wird nicht verschickt.")
    return
  }
  console.log(`${adminEmails.length} Admin(s) gefunden: ${adminEmails.join(", ")}`)

  await sendEmail(adminEmails, subject, html)
  console.log("")
  console.log(`Mail verschickt an: ${adminEmails.join(", ")}`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
