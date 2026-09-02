// Einmaliger Import der externen "Stecktafel"-Daten (stecktafel-daten.json, liegt lokal
// im Projektordner-übergeordneten Verzeichnis - siehe STECKTAFEL_PATH unten) in
// Kandidatenwerk: legt fehlende Kunden an und überträgt die Kanzlei-Zuordnungen
// (client_assignments) samt Status-Pipeline.
//
// WICHTIG: Läuft standardmäßig als DRY RUN (keine Schreibvorgänge, nur Vorschau).
// Erst mit --apply werden tatsächlich Daten geschrieben:
//   npx tsx scripts/import-stecktafel-assignments.ts            (Vorschau)
//   npx tsx scripts/import-stecktafel-assignments.ts --apply    (führt aus)
//
// Ablauf:
//   1. Kunden-Namensabgleich (Token-Overlap, wie in den vorherigen Bestandsaufnahmen)
//      + zwei manuelle Overrides für die geklärten mehrdeutigen Fälle (Grigat, ZRK)
//   2. Fehlende Kunden (kein Treffer, ohne die 2 Platzhalter "Vorlage"/"Neuer Kunde")
//      werden als neue Kunden vorbereitet
//   3. Stecktafel-Kandidaten mit gültiger E-Mail: per E-Mail gegen bestehende
//      Kandidaten abgeglichen - Treffer bekommen eine neue client_assignments-Zeile,
//      Nicht-Treffer werden zusätzlich als neuer Kandidat angelegt
//   4. Kandidaten ohne prüfbare E-Mail werden NICHT importiert, sondern nur gelistet
//   5. Bereits aktiv zugeordnete Kandidaten werden übersprungen und vermerkt
//   6. Mehrfachzuordnungen derselben E-Mail auf unterschiedliche Kunden (Stecktafel-
//      Datenfehler) werden erkannt - nur die erste Zeile wird verwendet, der Rest
//      vermerkt (der UNIQUE PARTIAL INDEX würde ohnehin nur eine aktive Zuordnung
//      pro Kandidat zulassen)

import path from "node:path"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { extractCleanName } from "../src/lib/leadtable-import"
import { mapKanzleistelleBerufsbild } from "../src/lib/sync-kanzleistelle"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const APPLY = process.argv.includes("--apply")

const STECKTAFEL_PATH = "/Users/steffenneubert/Desktop/Recruiting Stecktafel/stecktafel-daten.json"

const PLACEHOLDER_CUSTOMER_NAMES = new Set(["Vorlage", "Neuer Kunde"])

// Manuelle Overrides für die beiden Kunden-Duplikat-Fälle, die per Namensabgleich
// mehrdeutig blieben (siehe Bestandsaufnahme vom 02.09.2026) - hier anhand des
// eindeutigeren Literal-Namensvergleichs aufgelöst statt anhand reiner Token-Overlap-
// Heuristik: "Nicole Grigat ..." beginnt wortwörtlich mit "Nicole Grigat", und
// "ZRK STEUERBERATER & WIRTSCHAFTSPRÜFER" ist (case-insensitive) identisch zum
// KW-Kundennamen "ZRK Steuerberater & Wirtschaftsprüfer".
const MANUAL_CLIENT_OVERRIDES: Record<string, string> = {
  "Nicole Grigat Steuerberatungs- und Rechtsberatungskanzlei": "6e9ebbdc-41f3-4adf-ad49-f1ebf22b06b7", // Nicole Grigat
  "ZRK STEUERBERATER & WIRTSCHAFTSPRÜFER": "9686f1aa-c38c-4d9f-98e6-5798b4a1872f", // ZRK Steuerberater & Wirtschaftsprüfer
}

// 1:1-Mapping Stecktafel-Spalte -> client_assignments.status (siehe CHECK-Constraint
// in 20260901000004_add_client_assignments.sql - die Werte wurden absichtlich danach
// benannt).
const VALID_ASSIGNMENT_STATUSES = new Set(["inbox", "vq", "vqk", "vg", "ja", "nein"])

const STOP = new Set([
  "wirtschaftsprüfungsgesellschaft", "wirtschaftsprüfer", "steuerberatungsgesellschaft", "steuerberatungskanzlei",
  "steuerberatungs", "rechtsberatungskanzlei", "partnerschaftsgesellschaft", "partnerschaft", "gesellschaft",
  "steuerberater", "steuerberaterin", "steuerberatung", "steuerbüro", "kanzlei", "rechtsanwälte", "rechtsanwalt",
  "rechtsanwaltsgesellschaft", "rechtsanwältin", "syndikus", "diplomingenieurökonom", "sozietät", "steuerberatersozietät",
  "gmbh", "mbh", "mbb", "gmbb", "kg", "gbr", "partg", "ag", "ug", "ek", "ev", "co", "und", "altes", "produkt", "neues", "angebot",
  "stb", "von", "der", "the",
])

function tokenize(name: string): string[] {
  let n = name.toLowerCase()
  n = n.replace(/\(altes produkt\)|\(altes produkte\)|\(neues angebot\)/g, " ")
  n = n.replace(/[.,•·|/\-–+&()]/g, " ")
  n = n.replace(/[^a-zäöüß0-9\s]/g, " ")
  return n.split(/\s+/).filter(Boolean).filter((t) => !STOP.has(t))
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  const inter = [...sa].filter((x) => sb.has(x)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : inter / union
}

function containment(a: string[], b: string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  const inter = [...sa].filter((x) => sb.has(x)).length
  const smaller = Math.min(sa.size, sb.size)
  return smaller === 0 ? 0 : inter / smaller
}

interface StecktafelCandidate {
  id: string
  personId?: string
  name: string
  jobTitle?: string
  columnId: string
  phone?: string
  email?: string
  plz?: string
  ort?: string
  history?: { ts: number; text: string }[]
}

interface StecktafelCustomer {
  id: string
  name: string
  status?: string
  ort?: string
  contactPerson?: string
  phone?: string
  email?: string
  plz?: string
  candidates?: StecktafelCandidate[]
}

function isValidEmail(e: string | undefined | null): e is string {
  return !!(e && e.trim() && e.includes("@"))
}

async function main() {
  console.log(APPLY ? "=== MODUS: APPLY (schreibt tatsächlich Daten) ===" : "=== MODUS: DRY RUN (keine Schreibvorgänge) ===")
  console.log("")

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const stecktafel = JSON.parse(readFileSync(STECKTAFEL_PATH, "utf-8")).state as {
    customers: StecktafelCustomer[]
  }

  const { data: kwClientsRaw, error: clientsError } = await supabase.from("clients").select("id, name")
  if (clientsError) throw new Error(clientsError.message)
  const kwClients = (kwClientsRaw ?? []).map((c) => ({ ...c, tokens: tokenize(c.name) }))

  const { data: kwCandidatesRaw, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, email, first_name, last_name")
  if (candidatesError) throw new Error(candidatesError.message)
  const kwCandidatesByEmail = new Map(
    (kwCandidatesRaw ?? [])
      .filter((c) => c.email)
      .map((c) => [c.email!.trim().toLowerCase(), c])
  )

  const { data: activeAssignmentsRaw, error: activeAssignmentsError } = await supabase
    .from("client_assignments")
    .select("candidate_id")
    .is("removed_at", null)
  if (activeAssignmentsError) throw new Error(activeAssignmentsError.message)
  const candidateIdsWithActiveAssignment = new Set((activeAssignmentsRaw ?? []).map((a) => a.candidate_id))

  // ── Schritt 1: Kunden-Namensabgleich ──────────────────────────────────────────
  function resolveClientId(stecktafelName: string): { clientId: string | null; isNew: boolean; isPlaceholder: boolean } {
    if (PLACEHOLDER_CUSTOMER_NAMES.has(stecktafelName.trim())) {
      return { clientId: null, isNew: false, isPlaceholder: true }
    }
    if (MANUAL_CLIENT_OVERRIDES[stecktafelName]) {
      return { clientId: MANUAL_CLIENT_OVERRIDES[stecktafelName], isNew: false, isPlaceholder: false }
    }

    const ct = tokenize(stecktafelName)
    const scored = kwClients.map((k) => ({
      id: k.id,
      jaccard: jaccard(ct, k.tokens),
      containment: containment(ct, k.tokens),
    }))
    const candidates = scored.filter((s) => s.containment >= 0.99 || s.jaccard >= 0.6)
    if (candidates.length === 1) {
      return { clientId: candidates[0].id, isNew: false, isPlaceholder: false }
    }
    // Kein Treffer oder weiterhin mehrdeutig (sollte nach den Overrides nicht mehr
    // vorkommen) - wird als "neuer Kunde" behandelt.
    return { clientId: null, isNew: true, isPlaceholder: false }
  }

  const newClients: { stecktafelName: string; name: string; contact_name: string | null; contact_email: string | null; phone: string | null; plz: string | null; ort: string | null }[] = []
  const clientIdByStecktafelName = new Map<string, string>()
  const skippedPlaceholders: string[] = []

  for (const customer of stecktafel.customers) {
    const { clientId, isNew, isPlaceholder } = resolveClientId(customer.name)
    if (isPlaceholder) {
      skippedPlaceholders.push(customer.name)
      continue
    }
    if (clientId) {
      clientIdByStecktafelName.set(customer.name, clientId)
    } else if (isNew) {
      newClients.push({
        stecktafelName: customer.name,
        name: customer.name,
        contact_name: customer.contactPerson?.trim() || null,
        contact_email: customer.email?.trim() || null,
        phone: customer.phone?.trim() || null,
        plz: customer.plz?.trim() || null,
        ort: customer.ort?.trim() || null,
      })
    }
  }

  // ── Schritt 2: Neue Kunden tatsächlich anlegen (nur bei --apply), damit Schritt 3
  // deren echte IDs für die client_assignments-Inserts kennt ──────────────────────
  if (APPLY) {
    for (const nc of newClients) {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: nc.name,
          contact_name: nc.contact_name,
          contact_email: nc.contact_email,
          phone: nc.phone,
          plz: nc.plz,
          ort: nc.ort,
          status: "Aktiv",
          active: true,
        })
        .select("id")
        .single()
      if (error) throw new Error(`Kunde "${nc.name}" konnte nicht angelegt werden: ${error.message}`)
      clientIdByStecktafelName.set(nc.stecktafelName, data.id)
    }
  }

  // ── Schritt 3: Kandidaten-Zeilen der Stecktafel durchgehen ────────────────────
  interface CandidateRow {
    stecktafelCandidateId: string
    name: string
    email: string | null
    phone: string | null
    plz: string | null
    jobTitle: string | null
    columnId: string
    customerName: string
    createdAt: string | null // ISO, aus history[0].ts falls vorhanden
  }

  const allRows: CandidateRow[] = []
  for (const customer of stecktafel.customers) {
    if (PLACEHOLDER_CUSTOMER_NAMES.has(customer.name.trim())) continue
    for (const cand of customer.candidates ?? []) {
      const firstHistoryTs = cand.history?.[0]?.ts
      allRows.push({
        stecktafelCandidateId: cand.id,
        name: cand.name,
        email: cand.email?.trim() || null,
        phone: cand.phone?.trim() || null,
        plz: cand.plz?.trim() || null,
        jobTitle: cand.jobTitle?.trim() || null,
        columnId: cand.columnId,
        customerName: customer.name,
        createdAt: firstHistoryTs ? new Date(firstHistoryTs).toISOString() : null,
      })
    }
  }

  const rowsWithEmail = allRows.filter((r) => isValidEmail(r.email))
  const rowsWithoutEmail = allRows.filter((r) => !isValidEmail(r.email))

  // Mehrfach-Zeilen derselben E-Mail: exakte Duplikate (gleicher Kunde+Status)
  // zusammenfassen, echte Konflikte (unterschiedlicher Kunde) auf die erste Zeile
  // reduzieren und den Rest vermerken - der UNIQUE PARTIAL INDEX ließe ohnehin nur
  // eine aktive Zuordnung pro Kandidat zu.
  const byEmail = new Map<string, CandidateRow[]>()
  for (const row of rowsWithEmail) {
    const key = row.email!.toLowerCase()
    if (!byEmail.has(key)) byEmail.set(key, [])
    byEmail.get(key)!.push(row)
  }

  const chosenRows: CandidateRow[] = []
  const conflictSkipped: { row: CandidateRow; keptCustomer: string }[] = []
  for (const [, rows] of byEmail) {
    chosenRows.push(rows[0])
    for (const extra of rows.slice(1)) {
      if (extra.customerName !== rows[0].customerName) {
        conflictSkipped.push({ row: extra, keptCustomer: rows[0].customerName })
      }
      // exakte Duplikate (gleicher Kunde) werden stillschweigend zusammengefasst
    }
  }

  interface PlannedAssignment {
    candidateName: string
    email: string
    candidateId: string | null // gefüllt bei bestehendem Kandidaten
    isNewCandidate: boolean
    clientId: string | null
    clientName: string
    status: string
    createdAt: string | null
    jobTitle: string | null
    plz: string | null
    phone: string | null
    skipReason: "already_assigned" | "no_client" | "invalid_status" | null
  }

  const plannedAssignments: PlannedAssignment[] = []

  for (const row of chosenRows) {
    const email = row.email!.toLowerCase()
    const existingCandidate = kwCandidatesByEmail.get(email)
    const clientId = clientIdByStecktafelName.get(row.customerName) ?? null
    const status = VALID_ASSIGNMENT_STATUSES.has(row.columnId) ? row.columnId : null

    let skipReason: PlannedAssignment["skipReason"] = null
    if (existingCandidate && candidateIdsWithActiveAssignment.has(existingCandidate.id)) {
      skipReason = "already_assigned"
    } else if (!status) {
      skipReason = "invalid_status"
    } else if (!clientId && !newClients.some((nc) => nc.stecktafelName === row.customerName)) {
      skipReason = "no_client"
    }

    plannedAssignments.push({
      candidateName: row.name,
      email: row.email!,
      candidateId: existingCandidate?.id ?? null,
      isNewCandidate: !existingCandidate,
      clientId,
      clientName: row.customerName,
      status: status ?? row.columnId,
      createdAt: row.createdAt,
      jobTitle: row.jobTitle,
      plz: row.plz,
      phone: row.phone,
      skipReason,
    })
  }

  // ── Ausgabe: vollständige Vorschau ─────────────────────────────────────────────
  console.log(`=== 1. Neue Kunden (${newClients.length}) ===`)
  newClients.forEach((nc) => {
    console.log(
      `  "${nc.name}"  |  contact_name=${JSON.stringify(nc.contact_name)}  contact_email=${JSON.stringify(nc.contact_email)}  phone=${JSON.stringify(nc.phone)}  plz=${JSON.stringify(nc.plz)}  ort=${JSON.stringify(nc.ort)}  status=Aktiv`
    )
  })

  console.log("")
  console.log(`=== Übersprungene Platzhalter-Kunden (${skippedPlaceholders.length}) ===`)
  skippedPlaceholders.forEach((n) => console.log(`  "${n}"`))

  console.log("")
  const toAssignExisting = plannedAssignments.filter((p) => !p.isNewCandidate && !p.skipReason)
  console.log(`=== 2. Zuordnungen für BESTEHENDE Kandidaten (${toAssignExisting.length}) ===`)
  toAssignExisting.forEach((p) => {
    console.log(
      `  ${p.candidateName} (${p.email})  ->  "${p.clientName}"  status=${p.status}  created_at=${p.createdAt ?? "now()"}`
    )
  })

  console.log("")
  const toCreateNew = plannedAssignments.filter((p) => p.isNewCandidate && !p.skipReason)
  console.log(`=== 3. NEUE Kandidaten + Zuordnung (${toCreateNew.length}) ===`)
  toCreateNew.forEach((p) => {
    const { firstName, lastName } = extractCleanName(p.candidateName)
    const berufsbild = p.jobTitle ? mapKanzleistelleBerufsbild(p.jobTitle) : null
    console.log(
      `  ${firstName} ${lastName}  (${p.email})  Telefon=${JSON.stringify(p.phone)}  PLZ=${JSON.stringify(p.plz)}  jobTitle="${p.jobTitle}" -> berufsbild=${berufsbild}  source=manual`
    )
    console.log(
      `      -> Zuordnung zu "${p.clientName}"  status=${p.status}  created_at=${p.createdAt ?? "now()"}`
    )
  })

  console.log("")
  const alreadyAssigned = plannedAssignments.filter((p) => p.skipReason === "already_assigned")
  console.log(`=== 5. Übersprungen: bereits aktiv zugeordnet (${alreadyAssigned.length}) ===`)
  alreadyAssigned.forEach((p) => console.log(`  ${p.candidateName} (${p.email}) - wollte zu "${p.clientName}"`))

  const invalidStatus = plannedAssignments.filter((p) => p.skipReason === "invalid_status")
  if (invalidStatus.length > 0) {
    console.log("")
    console.log(`=== Übersprungen: unbekannter Status (${invalidStatus.length}) ===`)
    invalidStatus.forEach((p) => console.log(`  ${p.candidateName} (${p.email})  columnId="${p.status}"`))
  }

  const noClient = plannedAssignments.filter((p) => p.skipReason === "no_client")
  if (noClient.length > 0) {
    console.log("")
    console.log(`=== Übersprungen: kein Kunde auflösbar (${noClient.length}) ===`)
    noClient.forEach((p) => console.log(`  ${p.candidateName} (${p.email})  Kunde="${p.clientName}"`))
  }

  console.log("")
  console.log(`=== 6. Mehrfachzuordnung in Stecktafel - übersprungen (${conflictSkipped.length}) ===`)
  conflictSkipped.forEach(({ row, keptCustomer }) =>
    console.log(`  ${row.name} (${row.email}) -> "${row.customerName}" übersprungen, behalten: "${keptCustomer}"`)
  )

  console.log("")
  console.log(`=== 4. Kandidaten OHNE prüfbare E-Mail - NICHT importiert, zur manuellen Durchsicht (${rowsWithoutEmail.length}) ===`)
  rowsWithoutEmail.forEach((r) =>
    console.log(`  ${r.name || "(ohne Namen)"}  |  Kanzlei: "${r.customerName}"  |  Status: ${r.columnId}${r.email ? `  |  E-Mail-Feld enthielt: ${JSON.stringify(r.email)}` : ""}`)
  )

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(
    JSON.stringify(
      {
        neueKunden: newClients.length,
        uebersprungenePlatzhalter: skippedPlaceholders.length,
        zuordnungenBestehendeKandidaten: toAssignExisting.length,
        neueKandidatenMitZuordnung: toCreateNew.length,
        uebersprungenBereitsZugeordnet: alreadyAssigned.length,
        uebersprungenUnbekannterStatus: invalidStatus.length,
        uebersprungenKeinKunde: noClient.length,
        uebersprungenMehrfachzuordnung: conflictSkipped.length,
        ohneEmailNichtImportiert: rowsWithoutEmail.length,
      },
      null,
      2
    )
  )

  if (!APPLY) {
    console.log("")
    console.log("=== DRY RUN - keine Daten wurden geschrieben. Erneut mit --apply ausführen, um wirklich zu importieren. ===")
    return
  }

  // ── APPLY: tatsächliche Schreibvorgänge ────────────────────────────────────────
  console.log("")
  console.log("=== Schreibe client_assignments ... ===")
  let created = 0
  const runErrors: { candidate: string; message: string }[] = []

  for (const p of [...toAssignExisting, ...toCreateNew]) {
    try {
      let candidateId = p.candidateId
      if (p.isNewCandidate) {
        const { firstName, lastName } = extractCleanName(p.candidateName)
        const berufsbild = p.jobTitle ? mapKanzleistelleBerufsbild(p.jobTitle) : null
        const { data: newCandidate, error: insertError } = await supabase
          .from("candidates")
          .insert({
            first_name: firstName,
            last_name: lastName,
            email: p.email,
            phone: p.phone,
            plz: p.plz,
            berufsbild,
            source: "manual",
            client_id: p.clientId,
            notes: `Import aus Stecktafel, Kanzlei "${p.clientName}"`,
          })
          .select("id")
          .single()
        if (insertError) throw new Error(insertError.message)
        candidateId = newCandidate.id
      }

      if (!candidateId || !p.clientId) throw new Error("candidateId oder clientId fehlt")

      const { error: assignError } = await supabase.from("client_assignments").insert({
        candidate_id: candidateId,
        client_id: p.clientId,
        status: p.status,
        created_at: p.createdAt ?? undefined,
      })
      if (assignError) throw new Error(assignError.message)

      created++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      runErrors.push({ candidate: p.candidateName, message })
      console.log(`  FEHLER bei ${p.candidateName}: ${message}`)
    }
  }

  console.log("")
  console.log(`Zuordnungen erstellt: ${created}, Fehler: ${runErrors.length}`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
