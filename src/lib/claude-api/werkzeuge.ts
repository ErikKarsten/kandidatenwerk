// Werkzeuge der Claude-Schnittstelle (Paket 111, MCP-Server unter /api/mcp).
// Umfang (Entscheidung 19.11.2026): lesen und übliche Arbeit - kein Löschen, keine
// Massen-Mails. Schreibende Werkzeuge nutzen denselben Kern wie die Oberfläche
// (src/lib/kern.ts): gleicher Verlauf, gleiche Automatisierungen und Benachrichtigungen.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { revalidatePath } from "next/cache"
import { APP_BASE_URL } from "@/lib/app-url"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { ASSIGNMENT_STATUS_OPTIONS, assignmentStatusLabel } from "@/lib/assignment-status"
import { PROJECT_PHASES } from "@/lib/client-project"
import { TEAM_OPTIONS, parseAssignee } from "@/lib/teams"
import {
  addCandidateNote,
  assignCandidateToClient,
  createTask,
  isCandidateStatus,
  setAssignmentStatus,
  setCandidateStatus,
  setTaskStatus,
} from "@/lib/kern"

type Db = SupabaseClient<Database>
type Args = Record<string, unknown>

export interface Werkzeug {
  name: string
  title: string
  description: string
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean }
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint: boolean }
  run: (db: Db, userId: string, args: Args) => Promise<unknown>
}

export class WerkzeugFehler extends Error {}

const statusLabel = (v: string | null) => CANDIDATE_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
const phaseLabel = (v: string | null) => PROJECT_PHASES.find((o) => o.value === v)?.label ?? v
const link = (pfad: string) => `${APP_BASE_URL}${pfad}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(args: Args, key: string, { pflicht = false, max = 4000 } = {}): string | undefined {
  const v = args[key]
  if (v == null || v === "") {
    if (pflicht) throw new WerkzeugFehler(`„${key}“ fehlt.`)
    return undefined
  }
  if (typeof v !== "string") throw new WerkzeugFehler(`„${key}“ muss Text sein.`)
  const t = v.trim()
  if (pflicht && !t) throw new WerkzeugFehler(`„${key}“ fehlt.`)
  if (t.length > max) throw new WerkzeugFehler(`„${key}“ ist zu lang (höchstens ${max} Zeichen).`)
  return t
}

function id(args: Args, key: string, pflicht = true): string | undefined {
  const v = text(args, key, { pflicht, max: 64 })
  if (v && !UUID.test(v)) throw new WerkzeugFehler(`„${key}“ ist keine gültige ID.`)
  return v
}

function anzahl(args: Args, key: string, standard: number, max: number): number {
  const v = args[key]
  if (v == null) return standard
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1) throw new WerkzeugFehler(`„${key}“ muss eine positive ganze Zahl sein.`)
  return Math.min(n, max)
}

// Für PostgREST-or()-Filter: Zeichen entfernen, die den Filter verändern würden.
const suchbegriff = (s: string) => s.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim()

function name(p: { first_name?: string | null; last_name?: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "(ohne Namen)"
}

async function profilNamen(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const liste = [...new Set(ids.filter((x): x is string => !!x))]
  if (!liste.length) return new Map()
  const { data } = await db.from("profiles").select("id, full_name, email").in("id", liste)
  return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email || p.id]))
}

const STATUS_WERTE = CANDIDATE_STATUS_OPTIONS.map((o) => o.value)
const ZUORDNUNG_WERTE = ASSIGNMENT_STATUS_OPTIONS.map((o) => o.value)
const STATUS_ERKLAERUNG = CANDIDATE_STATUS_OPTIONS.map((o) => `${o.value} = ${o.label}`).join(", ")
const ZUORDNUNG_ERKLAERUNG = ASSIGNMENT_STATUS_OPTIONS.map((o) => `${o.value} = ${o.label}`).join(", ")

const lesen = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const schreiben = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

export const WERKZEUGE: Werkzeug[] = [
  {
    name: "kandidaten_suchen",
    title: "Kandidaten suchen",
    description: `Sucht Kandidaten (Bewerber) nach Name, E-Mail oder Telefon, optional gefiltert nach Status, Kampagne oder zugeordneter Kanzlei. Neueste zuerst. Musterdatensätze und Demo-Kandidaten sind ausgeblendet. Status: ${STATUS_ERKLAERUNG}.`,
    inputSchema: {
      type: "object",
      properties: {
        suche: { type: "string", description: "Teil von Vorname, Nachname, E-Mail oder Telefonnummer" },
        status: { type: "string", enum: STATUS_WERTE },
        kampagne_id: { type: "string", description: "Nur Kandidaten dieser Kampagne" },
        kunde_id: { type: "string", description: "Nur Kandidaten, die dieser Kanzlei aktiv zugeordnet sind" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: lesen,
    async run(db, _u, args) {
      const limit = anzahl(args, "limit", 20, 50)
      let q = db
        .from("candidates")
        .select("id, first_name, last_name, email, phone, status, berufsbild, plz, created_at, campaigns(title)")
        .eq("is_demo", false)
        .not("tags", "cs", "{Musterdatensatz}")
        .order("created_at", { ascending: false })
        .limit(limit)
      const suche = text(args, "suche", { max: 100 })
      if (suche) {
        const s = suchbegriff(suche)
        const teile = s.split(" ")
        // "Max Mustermann": Vor- und Nachname getrennt; sonst in allen Feldern.
        q = teile.length === 2
          ? q.ilike("first_name", `%${teile[0]}%`).ilike("last_name", `%${teile[1]}%`)
          : q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
      }
      const status = text(args, "status")
      if (status) {
        if (!isCandidateStatus(status)) throw new WerkzeugFehler(`Unbekannter Status. Erlaubt: ${STATUS_WERTE.join(", ")}`)
        q = q.eq("status", status)
      }
      const kampagne = id(args, "kampagne_id", false)
      if (kampagne) q = q.eq("campaign_id", kampagne)
      const kunde = id(args, "kunde_id", false)
      if (kunde) {
        const { data: zu } = await db.from("client_assignments").select("candidate_id").eq("client_id", kunde).is("removed_at", null)
        const ids = (zu ?? []).map((z) => z.candidate_id)
        if (!ids.length) return { anzahl: 0, kandidaten: [] }
        q = q.in("id", ids.slice(0, 500))
      }
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return {
        anzahl: data.length,
        kandidaten: data.map((c) => {
          const k = c.campaigns as { title: string } | { title: string }[] | null
          return {
            id: c.id,
            name: name(c),
            email: c.email,
            telefon: c.phone,
            status: statusLabel(c.status),
            berufsbild: c.berufsbild,
            plz: c.plz,
            kampagne: (Array.isArray(k) ? k[0]?.title : k?.title) ?? null,
            eingegangen: c.created_at,
            link: link(`/dashboard/candidates/${c.id}`),
          }
        }),
      }
    },
  },
  {
    name: "kandidat_anzeigen",
    title: "Kandidat anzeigen",
    description: "Alle Angaben zu einem Kandidaten: Stammdaten, Status, Beschreibung, offene Fragen, Werdegang, Zuordnungen zu Kanzleien (mit Zuordnungs-ID und Status), die letzten Verlaufseinträge und offene Aufgaben.",
    inputSchema: { type: "object", properties: { kandidat_id: { type: "string" } }, required: ["kandidat_id"], additionalProperties: false },
    annotations: lesen,
    async run(db, _u, args) {
      const kid = id(args, "kandidat_id")!
      const { data: c } = await db
        .from("candidates")
        .select("id, first_name, last_name, email, phone, status, source, berufsbild, plz, description, offene_fragen, cv_werdegang, custom_fields, tags, created_at, campaign_id, campaigns(title)")
        .eq("id", kid)
        .maybeSingle()
      if (!c) throw new WerkzeugFehler("Kandidat nicht gefunden.")
      const [{ data: zu }, { data: verlauf }, { data: aufgaben }] = await Promise.all([
        db.from("client_assignments").select("id, status, created_at, clients(id, name)").eq("candidate_id", kid).is("removed_at", null),
        db.from("candidate_history").select("type, content, created_at, created_by").eq("candidate_id", kid).order("created_at", { ascending: false }).limit(20),
        db.from("tasks").select("id, title, due_date, assigned_to, assigned_team").eq("candidate_id", kid).neq("status", "erledigt"),
      ])
      const namen = await profilNamen(db, [...(verlauf ?? []).map((v) => v.created_by), ...(aufgaben ?? []).map((a) => a.assigned_to)])
      const k = c.campaigns as { title: string } | { title: string }[] | null
      return {
        id: c.id,
        name: name(c),
        email: c.email,
        telefon: c.phone,
        status: statusLabel(c.status),
        status_wert: c.status,
        quelle: c.source,
        berufsbild: c.berufsbild,
        plz: c.plz,
        kampagne: (Array.isArray(k) ? k[0]?.title : k?.title) ?? null,
        tags: c.tags,
        beschreibung: c.description,
        offene_fragen: c.offene_fragen,
        werdegang: c.cv_werdegang ? String(c.cv_werdegang).slice(0, 3000) : null,
        zusatzfelder: c.custom_fields,
        eingegangen: c.created_at,
        zuordnungen: (zu ?? []).map((z) => {
          const cl = z.clients as { id: string; name: string } | { id: string; name: string }[] | null
          const kunde = Array.isArray(cl) ? cl[0] : cl
          return { zuordnung_id: z.id, kunde_id: kunde?.id, kanzlei: kunde?.name, status: assignmentStatusLabel(z.status).label, status_wert: z.status, seit: z.created_at }
        }),
        verlauf: (verlauf ?? []).map((v) => ({ art: v.type, text: v.content, am: v.created_at, von: v.created_by ? (namen.get(v.created_by) ?? null) : null })),
        offene_aufgaben: (aufgaben ?? []).map((a) => ({ id: a.id, titel: a.title, faellig: a.due_date, zugewiesen: a.assigned_to ? namen.get(a.assigned_to) : a.assigned_team ? `Team ${a.assigned_team}` : null })),
        link: link(`/dashboard/candidates/${c.id}`),
      }
    },
  },
  {
    name: "kunden_suchen",
    title: "Kunden (Kanzleien) suchen",
    description: `Sucht Kunden (Kanzleien) nach Name oder Ort, optional nach Projektphase (${PROJECT_PHASES.map((p) => `${p.value} = ${p.label}`).join(", ")}). Nur Kanzleien in Phase „live“ können Kandidaten zugeordnet bekommen.`,
    inputSchema: {
      type: "object",
      properties: {
        suche: { type: "string", description: "Teil von Name oder Ort" },
        phase: { type: "string", enum: PROJECT_PHASES.map((p) => p.value) },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: lesen,
    async run(db, _u, args) {
      let q = db
        .from("clients")
        .select("id, name, ort, plz, project_phase, status, contact_name, contact_email, phone, key_account_manager_id, live_since")
        .order("name")
        .limit(anzahl(args, "limit", 20, 50))
      const suche = text(args, "suche", { max: 100 })
      if (suche) {
        const s = suchbegriff(suche)
        q = q.or(`name.ilike.%${s}%,ort.ilike.%${s}%`)
      }
      const phase = text(args, "phase")
      if (phase) q = q.eq("project_phase", phase)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const kam = await profilNamen(db, data.map((c) => c.key_account_manager_id))
      return {
        anzahl: data.length,
        kunden: data.map((c) => ({
          id: c.id,
          name: c.name,
          ort: c.ort,
          plz: c.plz,
          phase: phaseLabel(c.project_phase),
          status: c.status,
          ansprechpartner: c.contact_name,
          email: c.contact_email,
          telefon: c.phone,
          key_account_manager: c.key_account_manager_id ? kam.get(c.key_account_manager_id) : null,
          live_seit: c.live_since,
          link: link(`/dashboard/clients/${c.id}`),
        })),
      }
    },
  },
  {
    name: "kunde_anzeigen",
    title: "Kunde (Kanzlei) anzeigen",
    description: "Angaben zu einer Kanzlei: Stammdaten, Kampagnen, aktiv zugeordnete Kandidaten (mit Zuordnungs-ID und Status) und offene Aufgaben.",
    inputSchema: { type: "object", properties: { kunde_id: { type: "string" } }, required: ["kunde_id"], additionalProperties: false },
    annotations: lesen,
    async run(db, _u, args) {
      const kid = id(args, "kunde_id")!
      const { data: c } = await db
        .from("clients")
        .select("id, name, ort, plz, project_phase, status, contact_name, contact_email, phone, key_account_manager_id, live_since, contract_start, contract_term_months, tags")
        .eq("id", kid)
        .maybeSingle()
      if (!c) throw new WerkzeugFehler("Kunde nicht gefunden.")
      const [{ data: kampagnen }, { data: zu }, { data: aufgaben }] = await Promise.all([
        db.from("campaigns").select("id, title, status, kind, berufsbild, plz, meta_form_name").eq("client_id", kid).order("created_at", { ascending: false }),
        db.from("client_assignments").select("id, status, created_at, candidates(id, first_name, last_name, status)").eq("client_id", kid).is("removed_at", null).order("created_at", { ascending: false }).limit(100),
        db.from("tasks").select("id, title, due_date, assigned_to, assigned_team").eq("client_id", kid).neq("status", "erledigt"),
      ])
      const namen = await profilNamen(db, [c.key_account_manager_id, ...(aufgaben ?? []).map((a) => a.assigned_to)])
      return {
        id: c.id,
        name: c.name,
        ort: c.ort,
        plz: c.plz,
        phase: phaseLabel(c.project_phase),
        status: c.status,
        ansprechpartner: c.contact_name,
        email: c.contact_email,
        telefon: c.phone,
        key_account_manager: c.key_account_manager_id ? namen.get(c.key_account_manager_id) : null,
        live_seit: c.live_since,
        vertragsbeginn: c.contract_start,
        laufzeit_monate: c.contract_term_months,
        tags: c.tags,
        kampagnen: (kampagnen ?? []).map((k) => ({ id: k.id, titel: k.title, status: k.status, art: k.kind, berufsbild: k.berufsbild, plz: k.plz, meta_formular: k.meta_form_name })),
        zugeordnete_kandidaten: (zu ?? []).map((z) => {
          const ca = z.candidates as { id: string; first_name: string | null; last_name: string | null; status: string | null } | null
          return { zuordnung_id: z.id, kandidat_id: ca?.id, name: ca ? name(ca) : null, status_bei_kanzlei: assignmentStatusLabel(z.status).label, kandidat_status: ca ? statusLabel(ca.status) : null, seit: z.created_at }
        }),
        offene_aufgaben: (aufgaben ?? []).map((a) => ({ id: a.id, titel: a.title, faellig: a.due_date, zugewiesen: a.assigned_to ? namen.get(a.assigned_to) : a.assigned_team ? `Team ${a.assigned_team}` : null })),
        link: link(`/dashboard/clients/${c.id}`),
      }
    },
  },
  {
    name: "kampagnen_auflisten",
    title: "Kampagnen auflisten",
    description: "Listet Kampagnen. Art „lead“ = Meta-Lead-Kampagne von Kanzleistelle24 (Kandidaten-Pool), „kanzlei“ = Kampagne einer bestimmten Kanzlei.",
    inputSchema: {
      type: "object",
      properties: {
        art: { type: "string", enum: ["lead", "kanzlei"] },
        status: { type: "string", description: "z. B. active, paused" },
        kunde_id: { type: "string" },
        suche: { type: "string", description: "Teil des Kampagnentitels" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: lesen,
    async run(db, _u, args) {
      let q = db
        .from("campaigns")
        .select("id, title, kind, status, berufsbild, plz, meta_form_name, created_at, clients(name)")
        .eq("is_demo", false)
        .order("created_at", { ascending: false })
        .limit(anzahl(args, "limit", 50, 100))
      const art = text(args, "art")
      if (art) q = q.eq("kind", art)
      const status = text(args, "status", { max: 40 })
      if (status) q = q.eq("status", status)
      const kunde = id(args, "kunde_id", false)
      if (kunde) q = q.eq("client_id", kunde)
      const suche = text(args, "suche", { max: 100 })
      if (suche) q = q.ilike("title", `%${suchbegriff(suche)}%`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return {
        anzahl: data.length,
        kampagnen: data.map((k) => {
          const cl = k.clients as { name: string } | { name: string }[] | null
          return {
            id: k.id,
            titel: k.title,
            art: k.kind,
            status: k.status,
            kanzlei: (Array.isArray(cl) ? cl[0]?.name : cl?.name) ?? null,
            berufsbild: k.berufsbild,
            plz: k.plz,
            meta_formular: k.meta_form_name,
            angelegt: k.created_at,
            link: link(`/dashboard/campaigns/${k.id}`),
          }
        }),
      }
    },
  },
  {
    name: "aufgaben_auflisten",
    title: "Aufgaben auflisten",
    description: "Listet Aufgaben, standardmäßig die offenen. Optional nur die eigenen, oder die zu einem Kandidaten bzw. einer Kanzlei.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["offen", "erledigt", "alle"], default: "offen" },
        nur_meine: { type: "boolean", default: false },
        kandidat_id: { type: "string" },
        kunde_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: lesen,
    async run(db, userId, args) {
      let q = db
        .from("tasks")
        .select("id, title, description, status, due_date, assigned_to, assigned_team, candidate_id, client_id, created_at, completed_at")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(anzahl(args, "limit", 50, 100))
      const status = text(args, "status") ?? "offen"
      if (status === "offen") q = q.neq("status", "erledigt")
      else if (status === "erledigt") q = q.eq("status", "erledigt")
      if (args.nur_meine === true) q = q.eq("assigned_to", userId)
      const kandidat = id(args, "kandidat_id", false)
      if (kandidat) q = q.eq("candidate_id", kandidat)
      const kunde = id(args, "kunde_id", false)
      if (kunde) q = q.eq("client_id", kunde)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const namen = await profilNamen(db, data.map((a) => a.assigned_to))
      return {
        anzahl: data.length,
        aufgaben: data.map((a) => ({
          id: a.id,
          titel: a.title,
          beschreibung: a.description,
          status: a.status,
          faellig: a.due_date,
          zugewiesen: a.assigned_to ? namen.get(a.assigned_to) : a.assigned_team ? `Team ${a.assigned_team}` : null,
          kandidat_id: a.candidate_id,
          kunde_id: a.client_id,
          erledigt_am: a.completed_at,
        })),
        link: link("/dashboard/tasks"),
      }
    },
  },
  {
    name: "team_auflisten",
    title: "Team auflisten",
    description: `Alle Team-Mitglieder mit ID, Rolle und Team - z. B. um eine Aufgabe zuzuweisen. Teams: ${TEAM_OPTIONS.map((t) => `team:${t.value} (${t.label})`).join(", ")}.`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: lesen,
    async run(db) {
      const { data, error } = await db.from("profiles").select("id, full_name, email, role, team").in("role", ["agency_admin", "agency_member"]).order("full_name")
      if (error) throw new Error(error.message)
      return { team: data.map((p) => ({ id: p.id, name: p.full_name, email: p.email, rolle: p.role === "agency_admin" ? "Admin" : "Mitglied", team: p.team })) }
    },
  },
  {
    name: "kandidat_status_setzen",
    title: "Status eines Kandidaten setzen",
    description: `Setzt den Status eines Kandidaten - genau wie in der Oberfläche: Verlaufseintrag, bei „nicht_auf_suche“ Aufgabe „in 6 Monaten erneut anrufen“, bei „vorqualifiziert“ werden Leads aus der eigenen Meta-Kampagne einer Kanzlei dieser zugeordnet, und die Automatisierungen der Kampagnen laufen sofort (können Mails an Kandidat oder Kanzlei auslösen). Optional mit Notiz. Status: ${STATUS_ERKLAERUNG}.`,
    inputSchema: {
      type: "object",
      properties: { kandidat_id: { type: "string" }, status: { type: "string", enum: STATUS_WERTE }, notiz: { type: "string", description: "Optionaler Verlaufseintrag dazu" } },
      required: ["kandidat_id", "status"],
      additionalProperties: false,
    },
    annotations: schreiben,
    async run(db, userId, args) {
      const kid = id(args, "kandidat_id")!
      const status = text(args, "status", { pflicht: true })!
      if (!isCandidateStatus(status)) throw new WerkzeugFehler(`Unbekannter Status. Erlaubt: ${STATUS_WERTE.join(", ")}`)
      const { data: c } = await db.from("candidates").select("id, status").eq("id", kid).maybeSingle()
      if (!c) throw new WerkzeugFehler("Kandidat nicht gefunden.")
      const r = await setCandidateStatus(db, userId, kid, status)
      if ("error" in r) throw new WerkzeugFehler(r.error)
      const notiz = text(args, "notiz")
      if (notiz) {
        const n = await addCandidateNote(db, userId, kid, notiz)
        if (n) throw new WerkzeugFehler(`Status gesetzt, Notiz fehlgeschlagen: ${n.error}`)
      }
      revalidatePath(`/dashboard/candidates/${kid}`)
      revalidatePath("/dashboard/candidates")
      if (r.clientId) revalidatePath(`/dashboard/clients/${r.clientId}`)
      return { ok: true, vorher: statusLabel(c.status), jetzt: statusLabel(status), automatisch_zugeordnet_kunde_id: r.clientId ?? null, link: link(`/dashboard/candidates/${kid}`) }
    },
  },
  {
    name: "notiz_hinzufuegen",
    title: "Notiz zum Kandidaten",
    description: "Schreibt eine Notiz in den Verlauf eines Kandidaten. @Name benachrichtigt Kolleginnen und Kollegen per Mail (wie in der Oberfläche).",
    inputSchema: { type: "object", properties: { kandidat_id: { type: "string" }, text: { type: "string" } }, required: ["kandidat_id", "text"], additionalProperties: false },
    annotations: schreiben,
    async run(db, userId, args) {
      const kid = id(args, "kandidat_id")!
      const inhalt = text(args, "text", { pflicht: true })!
      const { data: c } = await db.from("candidates").select("id").eq("id", kid).maybeSingle()
      if (!c) throw new WerkzeugFehler("Kandidat nicht gefunden.")
      const r = await addCandidateNote(db, userId, kid, inhalt)
      if (r) throw new WerkzeugFehler(r.error)
      revalidatePath(`/dashboard/candidates/${kid}`)
      return { ok: true, link: link(`/dashboard/candidates/${kid}`) }
    },
  },
  {
    name: "kandidat_kanzlei_zuordnen",
    title: "Kandidat einer Kanzlei zuordnen",
    description: "Ordnet einen Kandidaten einer Kanzlei zu (ohne Kampagne), wie „Kanzlei zuordnen“ in der Oberfläche. Nur vorqualifizierte Kandidaten und nur Kanzleien in Phase „live“. Achtung: Die Automatisierung „Neuer Kandidat für die Kanzlei“ schickt der Kanzlei dann eine Mail. Vorher mit dem Nutzer abstimmen.",
    inputSchema: { type: "object", properties: { kandidat_id: { type: "string" }, kunde_id: { type: "string" } }, required: ["kandidat_id", "kunde_id"], additionalProperties: false },
    annotations: schreiben,
    async run(db, userId, args) {
      const kid = id(args, "kandidat_id")!
      const kunde = id(args, "kunde_id")!
      const r = await assignCandidateToClient(db, userId, kid, kunde)
      if (r) throw new WerkzeugFehler(r.error)
      revalidatePath(`/dashboard/candidates/${kid}`)
      revalidatePath(`/dashboard/clients/${kunde}`)
      return { ok: true, link: link(`/dashboard/candidates/${kid}`) }
    },
  },
  {
    name: "zuordnung_status_setzen",
    title: "Status bei der Kanzlei setzen",
    description: `Setzt den Status einer Kandidaten-Zuordnung bei einer Kanzlei (die zuordnung_id steht bei kandidat_anzeigen bzw. kunde_anzeigen). Status: ${ZUORDNUNG_ERKLAERUNG}.`,
    inputSchema: {
      type: "object",
      properties: { zuordnung_id: { type: "string" }, status: { type: "string", enum: ZUORDNUNG_WERTE } },
      required: ["zuordnung_id", "status"],
      additionalProperties: false,
    },
    annotations: schreiben,
    async run(db, userId, args) {
      const zid = id(args, "zuordnung_id")!
      const status = text(args, "status", { pflicht: true })!
      const r = await setAssignmentStatus(db, userId, zid, status)
      if (r && "error" in r) throw new WerkzeugFehler(r.error)
      if (r) {
        revalidatePath(`/dashboard/candidates/${r.candidateId}`)
        revalidatePath(`/dashboard/clients/${r.clientId}`)
      }
      return { ok: true, status: assignmentStatusLabel(status).label, unveraendert: r === null }
    },
  },
  {
    name: "aufgabe_anlegen",
    title: "Aufgabe anlegen",
    description: "Legt eine Aufgabe an. Ohne „zugewiesen_an“ bekommt sie die Person, der der API-Schlüssel gehört. Zuweisen an eine Person (Profil-ID aus team_auflisten) oder ein Team („team:vertrieb“ usw.) - die Person bekommt dann eine Mail.",
    inputSchema: {
      type: "object",
      properties: {
        titel: { type: "string" },
        beschreibung: { type: "string" },
        zugewiesen_an: { type: "string", description: "Profil-ID oder team:<team>" },
        faellig_am: { type: "string", description: "Datum JJJJ-MM-TT" },
        kandidat_id: { type: "string" },
        kunde_id: { type: "string" },
      },
      required: ["titel"],
      additionalProperties: false,
    },
    annotations: schreiben,
    async run(db, userId, args) {
      const titel = text(args, "titel", { pflicht: true, max: 300 })!
      const faellig = text(args, "faellig_am", { max: 10 })
      if (faellig && !/^\d{4}-\d{2}-\d{2}$/.test(faellig)) throw new WerkzeugFehler("„faellig_am“ bitte als JJJJ-MM-TT.")
      const ziel = text(args, "zugewiesen_an", { max: 64 }) ?? userId
      const assignee = parseAssignee(ziel)
      if (!assignee) throw new WerkzeugFehler("Unbekanntes Team oder ungültige Person bei „zugewiesen_an“.")
      const kandidat = id(args, "kandidat_id", false)
      const kunde = id(args, "kunde_id", false)
      const r = await createTask(db, userId, { title: titel, description: text(args, "beschreibung") ?? null, assignee, candidate_id: kandidat ?? null, client_id: kunde ?? null, due_date: faellig ?? null })
      if ("error" in r) throw new WerkzeugFehler(r.error)
      revalidatePath("/dashboard/tasks")
      if (kunde) revalidatePath(`/dashboard/clients/${kunde}`)
      return { ok: true, aufgabe_id: r.id, link: link("/dashboard/tasks") }
    },
  },
  {
    name: "aufgabe_erledigen",
    title: "Aufgabe erledigen",
    description: "Hakt eine Aufgabe ab (oder öffnet sie mit wieder_oeffnen=true erneut). Gehört die Aufgabe zu einer Fehlermeldung, bekommt der Melder eine Mail, dass sie erledigt ist.",
    inputSchema: {
      type: "object",
      properties: { aufgabe_id: { type: "string" }, wieder_oeffnen: { type: "boolean", default: false } },
      required: ["aufgabe_id"],
      additionalProperties: false,
    },
    annotations: schreiben,
    async run(db, userId, args) {
      const aid = id(args, "aufgabe_id")!
      const { data: t } = await db.from("tasks").select("id, title, client_id").eq("id", aid).maybeSingle()
      if (!t) throw new WerkzeugFehler("Aufgabe nicht gefunden.")
      const status = args.wieder_oeffnen === true ? "offen" : "erledigt"
      const r = await setTaskStatus(db, userId, aid, status)
      if (r) throw new WerkzeugFehler(r.error)
      revalidatePath("/dashboard/tasks")
      revalidatePath("/dashboard/fehlermeldungen")
      if (t.client_id) revalidatePath(`/dashboard/clients/${t.client_id}`)
      return { ok: true, aufgabe: t.title, status }
    },
  },
]
