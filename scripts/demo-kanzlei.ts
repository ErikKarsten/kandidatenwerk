// Demo-Kanzlei mit Beispieldaten (Paket 42): "TEST Musterkanzlei" in Bonn mit fertigem
// Kanzleiprofil, Standort, Ansprechpartner, zwei gesuchten Stellen mit je einer Kanzlei-Kampagne,
// sechs KI-Musterkandidaten im Umkreis (Tag "Musterdatensatz") - vier davon zugeordnet in
// verschiedenen Status -, einem Projektkommentar und einer Aufgabe.
//
// Bewusst ohne Login-Zugänge (Portal-Zugang bei Bedarf in den Stammdaten einladen), ohne
// Automatisierungen und ohne Veröffentlichung auf Kanzleistelle24; Kontaktdaten nur
// @example.com. Mehrfach ausführbar (vorhandene Teile bleiben). scripts/live-bereinigen.ts
// entfernt die Kanzlei wieder.
//
// Usage: npx tsx scripts/demo-kanzlei.ts
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { geocodePlz } from "../src/lib/geocode-plz"
import { createSampleCandidates } from "../src/lib/sample-candidates"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const NAME = "TEST Musterkanzlei"
const PLZ = "53111"
const ORT = "Bonn"
const CAMPAIGNS = [
  { title: "Steuerfachangestellte (m/w/d) – Bonn", berufsbild: "steuerfachangestellte" },
  { title: "Bilanzbuchhalter (m/w/d) – Bonn", berufsbild: "bilanzbuchhalter" },
] as const

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

async function main() {
  const coords = geocodePlz(PLZ)!
  const agency = (await must(db.from("agencies").select("id").order("created_at").limit(1).single(), "Agentur"))!
  const kam = await must(db.from("profiles").select("id").eq("role", "agency_admin").order("created_at").limit(1).maybeSingle(), "Key Account Manager")

  // 1. Kanzlei
  let client = await must(db.from("clients").select("id").eq("name", NAME).maybeSingle(), "Kanzlei suchen")
  if (!client) {
    client = await must(
      db
        .from("clients")
        .insert({
          agency_id: agency.id,
          name: NAME,
          contact_name: "Dr. Julia Beispiel",
          contact_email: "kanzlei@example.com",
          phone: "+49 228 000000",
          plz: PLZ,
          ort: ORT,
          lat: coords.lat,
          lng: coords.lng,
          status: "active",
          project_phase: "live",
          contract_start: new Date().toISOString().slice(0, 10),
          contract_term_months: 12,
          key_account_manager_id: kam?.id ?? null,
          auto_forward_enabled: false,
        })
        .select("id")
        .single(),
      "Kanzlei anlegen"
    )
    console.log("Kanzlei angelegt.")
  }
  const clientId = client!.id

  // 2. Standort, Ansprechpartner, Kanzleiprofil
  const { count: locations } = await db.from("client_locations").select("id", { count: "exact", head: true }).eq("client_id", clientId)
  if (!locations) await must(db.from("client_locations").insert({ client_id: clientId, strasse: "Musterstraße 1", plz: PLZ, ort: ORT, lat: coords.lat, lng: coords.lng, is_primary: true }), "Standort")
  const { count: contacts } = await db.from("client_contacts").select("id", { count: "exact", head: true }).eq("client_id", clientId)
  if (!contacts) await must(db.from("client_contacts").insert({ client_id: clientId, name: "Dr. Julia Beispiel", email: "kanzlei@example.com", phone: "+49 228 000000", role: "Partnerin" }), "Ansprechpartner")
  await must(
    db.from("client_profiles").upsert(
      {
        client_id: clientId,
        kurzbeschreibung: "Moderne Steuerkanzlei in der Bonner Innenstadt mit 18 Mitarbeitenden und Schwerpunkt auf mittelständischen Unternehmen.",
        intro:
          "Die TEST Musterkanzlei berät seit über 25 Jahren Unternehmen, Freiberufler und Privatpersonen in Bonn und Umgebung. Das Team arbeitet vollständig digital mit DATEV und legt Wert auf kurze Wege, feste Ansprechpartner und eine strukturierte Einarbeitung.",
        website: "https://www.example.com",
        mitarbeiterzahl: "18",
        standorte: `Musterstraße 1, ${PLZ} ${ORT}`,
        mandantenstruktur: "Mittelständische Unternehmen, Handwerk, Ärzte und Freiberufler, Privatpersonen",
        software: "DATEV (Kanzlei-Rechnungswesen, Unternehmen online, DMS)",
        arbeitszeiten: "Gleitzeit, Kernzeit 9–14 Uhr, Teilzeit möglich",
        homeoffice: "Bis zu 3 Tage pro Woche",
        gehaltsgefuege: "Steuerfachangestellte 42.000–52.000 €, Bilanzbuchhalter 55.000–65.000 € je nach Erfahrung",
        ansprechpartner_bewerbung: "Dr. Julia Beispiel (Partnerin)",
        painpoints: "Hohe Arbeitslast im Abschlussbereich, zwei offene Stellen seit mehreren Monaten.",
        ziele_zusammenarbeit: "Zwei Einstellungen bis Jahresende: eine Steuerfachangestellte und ein Bilanzbuchhalter.",
        benefits: ["30 Tage Urlaub", "Jobticket", "Bezahlte Fortbildungen", "Moderne Arbeitsplätze", "Teamevents"],
        finalized_at: new Date().toISOString(),
        finalized_by: kam?.id ?? null,
      },
      { onConflict: "client_id" }
    ),
    "Kanzleiprofil"
  )

  // 3. Kampagnen und Stellen (je Stelle eine Kampagne)
  const campaignIds: string[] = []
  for (const c of CAMPAIGNS) {
    let row = await must(db.from("campaigns").select("id").eq("client_id", clientId).eq("title", c.title).maybeSingle(), "Kampagne suchen")
    if (!row) {
      row = await must(
        db
          .from("campaigns")
          .insert({ agency_id: agency.id, client_id: clientId, kind: "kanzlei", status: "active", title: c.title, berufsbild: c.berufsbild, plz: PLZ, lat: coords.lat, lng: coords.lng, radius_km: 30 })
          .select("id")
          .single(),
        "Kampagne"
      )
    }
    campaignIds.push(row!.id)
  }
  const [stfaCampaign, bibuCampaign] = campaignIds
  const { count: positions } = await db.from("client_positions").select("id", { count: "exact", head: true }).eq("client_id", clientId)
  if (!positions) {
    await must(
      db.from("client_positions").insert([
        {
          client_id: clientId,
          title: "Steuerfachangestellte (m/w/d)",
          berufsbild: "steuerfachangestellte",
          plz: PLZ,
          ort: ORT,
          lat: coords.lat,
          lng: coords.lng,
          radius_km: 30,
          arbeitszeit: "Vollzeit oder Teilzeit (ab 30 Std.)",
          berufserfahrung: "Ab 2 Jahre",
          software: "DATEV",
          gehalt: "42.000–52.000 €",
          startdatum: "Ab sofort",
          aufgaben: "Finanz- und Lohnbuchhaltung, Jahresabschlüsse für Einzelunternehmen und Personengesellschaften, betriebliche und private Steuererklärungen",
          anforderungen: "Abgeschlossene Ausbildung als Steuerfachangestellte/r, sicherer Umgang mit DATEV, selbstständige Arbeitsweise",
          campaign_id: stfaCampaign,
          sort_order: 0,
        },
        {
          client_id: clientId,
          title: "Bilanzbuchhalter (m/w/d)",
          berufsbild: "bilanzbuchhalter",
          plz: PLZ,
          ort: ORT,
          lat: coords.lat,
          lng: coords.lng,
          radius_km: 30,
          arbeitszeit: "Vollzeit",
          berufserfahrung: "Ab 3 Jahre",
          software: "DATEV",
          gehalt: "55.000–65.000 €",
          startdatum: "Nach Vereinbarung",
          aufgaben: "Erstellung von Jahresabschlüssen für GmbHs, E-Bilanz, Vorbereitung von Betriebsprüfungen",
          anforderungen: "Geprüfte/r Bilanzbuchhalter/in, mehrjährige Erfahrung im Abschlussbereich",
          campaign_id: bibuCampaign,
          sort_order: 1,
        },
      ]),
      "Stellen"
    )
  }

  // 4. Musterkandidaten im Umkreis (KI) und Zuordnungen in verschiedenen Status
  const { count: assigned } = await db.from("client_assignments").select("id", { count: "exact", head: true }).eq("client_id", clientId)
  if (!assigned) {
    console.log("KI erstellt 6 Musterkandidaten (ca. 2 Minuten)…")
    const [stfa, bibu] = await Promise.all([
      createSampleCandidates(db, { berufsbild: "steuerfachangestellte", plz: PLZ }, kam?.id ?? null),
      createSampleCandidates(db, { berufsbild: "bilanzbuchhalter", plz: PLZ }, kam?.id ?? null),
    ])
    const now = Date.now()
    const plan: { id: string; campaignId: string; status: string; daysAgo: number; touched: boolean }[] = [
      { id: stfa[0], campaignId: stfaCampaign, status: "inbox", daysAgo: 1, touched: false },
      { id: stfa[1], campaignId: stfaCampaign, status: "vg", daysAgo: 9, touched: true },
      { id: stfa[2], campaignId: stfaCampaign, status: "ja", daysAgo: 30, touched: true },
      { id: bibu[0], campaignId: bibuCampaign, status: "nein", daysAgo: 14, touched: true },
    ]
    for (const a of plan) {
      const at = new Date(now - a.daysAgo * 86400e3).toISOString()
      await must(
        db.from("client_assignments").insert({ candidate_id: a.id, client_id: clientId, campaign_id: a.campaignId, status: a.status, created_by: kam?.id ?? null, created_at: at, client_touched_at: a.touched ? at : null }),
        "Zuordnung"
      )
    }
    console.log("4 Kandidaten zugeordnet (Neu, Vorstellungsgespräch, Eingestellt, Abgelehnt), 2 Bilanzbuchhalter frei für „Passende Kandidaten“.")
  }

  // 5. Kommentar und Aufgabe
  const { count: comments } = await db.from("client_comments").select("id", { count: "exact", head: true }).eq("client_id", clientId)
  if (!comments) {
    await must(
      db.from("client_comments").insert({
        client_id: clientId,
        author_id: kam?.id ?? null,
        kind: "termin",
        content: "Kick-off mit Dr. Beispiel: Fokus zuerst auf die Steuerfachangestellte, Bilanzbuchhalter ab nächstem Monat. Vorstellungsgespräche bevorzugt dienstags und donnerstags.",
      }),
      "Kommentar"
    )
  }
  if (kam) {
    const { count: tasks } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("client_id", clientId)
    if (!tasks) {
      await must(
        db.from("tasks").insert({ title: "Feedback zum Vorstellungsgespräch einholen", description: "Demo-Aufgabe der TEST Musterkanzlei.", assigned_to: kam.id, created_by: kam.id, client_id: clientId }),
        "Aufgabe"
      )
    }
  }

  console.log(`Fertig: ${NAME} (${clientId})`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
