import { beforeEach, describe, expect, it, vi } from "vitest"

// Paket 93: Leads aus dem eigenen Formular einer Kanzlei - Stand aus Leadtable übernehmen
// und mit "vorqualifiziert" automatisch der Kampagne zuordnen.

const leadtable = vi.hoisted(() => ({ lead: null as Record<string, unknown> | null, search: null as { _id: string } | null }))
vi.mock("@/lib/leadtable-client", () => ({
  leadtableFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/searchLeadByMail/")) {
      if (!leadtable.search) throw new Error("Leadtable-API-Fehler (404): not found")
      return { leads: [leadtable.search] }
    }
    return { lead: leadtable.lead }
  }),
}))

const assignment = vi.hoisted(() => ({ notLive: null as string | null, ensure: vi.fn(async () => ({ id: "a1", created: true })) }))
vi.mock("@/lib/client-assignment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client-assignment")>()),
  clientNotLiveError: vi.fn(async () => assignment.notLive),
  ensureCampaignAssignment: assignment.ensure,
}))

import { enrichCandidateFromLeadtable, leadtableEnrichNote } from "./leadtable-enrich"
import { assignOwnCampaignLead } from "./own-campaign-leads"

type Row = Record<string, unknown>

// Kleiner Ersatz für den Supabase-Client: eq/neq/is filtern, update/insert werden mitgeschrieben.
function fakeDb(tables: Record<string, Row[]>) {
  const writes: { table: string; op: "update" | "insert"; data: Row }[] = []
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let patch: Row | null = null
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
    const result = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    const b = {
      select: () => b,
      limit: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      update: (d: Row) => ((patch = d), b),
      insert: (d: Row) => {
        writes.push({ table, op: "insert", data: d })
        return Promise.resolve({ error: null })
      },
      single: result,
      maybeSingle: result,
      then: (resolve: (v: { error: null }) => unknown) => {
        if (patch) {
          writes.push({ table, op: "update", data: patch })
          for (const r of rows()) Object.assign(r, patch)
        }
        return Promise.resolve({ error: null }).then(resolve)
      },
    }
    return b
  }
  return { db: { from } as never, writes }
}

describe("Leadtable-Stand übernehmen (Paket 93)", () => {
  beforeEach(() => {
    leadtable.search = { _id: "lt1" }
    leadtable.lead = {
      _id: "lt1",
      statusID: { name: "Absage" },
      description: "<p>27.10.26 [10:00 Uhr]: kein Interesse mehr</p>",
      modifiedData: { q_rwi3pf: "Steuerfachangestellte", q_gy0zcd: "ab 17 Uhr" },
    }
  })

  it("übernimmt Status, Notizen und nur leere Zusatzfelder", async () => {
    const candidate = { id: "c1", email: "a@gmx.de", status: "neu", description: null, custom_fields: { ausbildung: "StFA (eigene Angabe)" }, leadtable_lead_id: null }
    const { db, writes } = fakeDb({ candidates: [candidate] })
    const result = await enrichCandidateFromLeadtable(db, "c1", { fieldLabels: { erreichbarkeit: "Erreichbarkeit" } })

    expect(result).toEqual({ found: true, leadtableStatus: "Absage", status: "abgelehnt", description: true, fields: ["erreichbarkeit"] })
    expect(candidate.status).toBe("abgelehnt")
    expect(candidate.leadtable_lead_id).toBe("lt1")
    expect(candidate.description).toContain("kein Interesse mehr")
    expect(candidate.custom_fields).toEqual({ ausbildung: "StFA (eigene Angabe)", erreichbarkeit: "ab 17 Uhr" })
    const note = writes.find((w) => w.table === "candidate_history")
    expect(note?.data.content).toBe("Aus Leadtable übernommen: Status „Absage“ → Abgelehnt, Notizen, Zusatzfelder (Erreichbarkeit).")
  })

  it("lässt einen schon bearbeiteten Status und vorhandene Notizen stehen", async () => {
    const candidate = { id: "c1", email: "a@gmx.de", status: "in_kontakt", description: "Eigene Notiz", custom_fields: {}, leadtable_lead_id: null }
    const { db } = fakeDb({ candidates: [candidate] })
    const result = await enrichCandidateFromLeadtable(db, "c1")
    expect(result.status).toBeUndefined()
    expect(result.description).toBe(false)
    expect(candidate.status).toBe("in_kontakt")
    expect(candidate.description).toBe("Eigene Notiz")
  })

  it("setzt die Leadtable-Kennung nicht, wenn ein anderer Kandidat sie schon hat", async () => {
    const candidate = { id: "c1", email: "a@gmx.de", status: "neu", description: null, custom_fields: {}, leadtable_lead_id: null }
    const { db } = fakeDb({ candidates: [candidate, { id: "c2", leadtable_lead_id: "lt1" }] })
    await enrichCandidateFromLeadtable(db, "c1")
    expect(candidate.leadtable_lead_id).toBeNull()
    expect(candidate.status).toBe("abgelehnt")
  })

  it("ändert nichts, wenn der Lead nicht in Leadtable steht", async () => {
    leadtable.search = null
    const candidate = { id: "c1", email: "a@gmx.de", status: "neu", description: null, custom_fields: {}, leadtable_lead_id: null }
    const { db, writes } = fakeDb({ candidates: [candidate] })
    expect(await enrichCandidateFromLeadtable(db, "c1")).toEqual({ found: false, description: false, fields: [] })
    expect(writes).toEqual([])
  })

  it("schreibt ohne Änderung keinen Verlaufseintrag", () => {
    expect(leadtableEnrichNote({ found: true, leadtableStatus: "Unbearbeitet", description: false, fields: [] })).toBeNull()
  })
})

describe("Automatisch zuordnen bei vorqualifiziert (Paket 93)", () => {
  const ownLead = () => ({ id: "c1", status: "vorqualifiziert", campaign_id: "k1", campaign_only: true, tags: [] as string[] })
  const kanzleiCampaign = { id: "k1", title: "Steuerfachangestellte*r", kind: "kanzlei", client_id: "cl1" }

  beforeEach(() => {
    assignment.notLive = null
    assignment.ensure.mockClear()
  })

  it("ordnet einen vorqualifizierten Lead der eigenen Kampagne zu", async () => {
    const { db, writes } = fakeDb({ candidates: [ownLead()], campaigns: [kanzleiCampaign], client_assignments: [] })
    expect(await assignOwnCampaignLead(db, "c1", "u1")).toEqual({ kind: "assigned", campaignId: "k1", clientId: "cl1" })
    expect(assignment.ensure).toHaveBeenCalledWith(db, "c1", "k1", "u1")
    expect(writes.at(-1)?.data.content).toBe("Vorqualifiziert und damit automatisch der Kampagne „Steuerfachangestellte*r“ zugeordnet.")
  })

  it("ordnet nicht zu, wenn die Kanzlei nicht live ist, und vermerkt den Grund", async () => {
    assignment.notLive = "Kandidaten können nur Kanzleien in der Projektphase „Live“ zugeordnet werden."
    const { db, writes } = fakeDb({ candidates: [ownLead()], campaigns: [kanzleiCampaign], client_assignments: [] })
    const outcome = await assignOwnCampaignLead(db, "c1", "u1")
    expect(outcome?.kind).toBe("not_assigned")
    expect(assignment.ensure).not.toHaveBeenCalled()
    expect(writes.at(-1)?.data.content).toMatch(/^Nicht an die Kanzlei gegangen: /)
  })

  it("lässt Kandidaten ohne eigene Kampagne, schon zugeordnete und Musterdatensätze in Ruhe", async () => {
    const pool = { ...ownLead(), campaign_only: false }
    const sample = { ...ownLead(), id: "c2", tags: ["Musterdatensatz"] }
    const assigned = { ...ownLead(), id: "c3" }
    const { db } = fakeDb({
      candidates: [pool, sample, assigned],
      campaigns: [kanzleiCampaign],
      client_assignments: [{ candidate_id: "c3", client_id: "cl1", removed_at: null }],
    })
    expect(await assignOwnCampaignLead(db, "c1", null)).toBeNull()
    expect(await assignOwnCampaignLead(db, "c2", null)).toBeNull()
    expect(await assignOwnCampaignLead(db, "c3", null)).toBeNull()
    expect(assignment.ensure).not.toHaveBeenCalled()
  })
})
