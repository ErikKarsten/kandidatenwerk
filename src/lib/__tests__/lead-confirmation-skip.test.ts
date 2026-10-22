import { afterEach, describe, expect, it, vi } from "vitest"

const sent: string[][] = []
vi.mock("@/lib/brevo-mail", () => ({ sendEmail: vi.fn(async (to: string[]) => { sent.push(to); return to }) }))

// Paket 80: Kampagnen mit "Keine Eingangsbestätigung" werden übersprungen.
function fakeDb(candidates: unknown[], writes: { table: string; row: unknown }[]) {
  const data: Record<string, unknown> = {
    agency_settings: { confirmation_template_id: "t1", confirmation_active_since: "2026-10-01T00:00:00Z" },
    automation_templates: { subject: "Danke #Kandidatenname", body_html: "Hallo" },
    candidates,
    candidate_mail_runs: [],
    berufsbilder: [],
  }
  return {
    from(table: string) {
      const result = { data: data[table] ?? null, error: null }
      const q: Record<string, unknown> = {}
      for (const m of ["select", "eq", "in", "not", "gte", "order", "limit"]) q[m] = () => q
      q.maybeSingle = async () => result
      q.then = (resolve: (v: unknown) => void) => resolve(result)
      q.insert = async (row: unknown) => {
        writes.push({ table, row })
        return { error: null }
      }
      q.delete = () => q
      return q
    },
  } as never
}

describe("Eingangsbestätigung je Kampagne", () => {
  afterEach(() => {
    sent.length = 0
  })

  it("schickt nichts an Leads einer Kampagne mit abgeschalteter Bestätigung, vermerkt sie aber", async () => {
    const { sendLeadConfirmations } = await import("@/lib/lead-confirmation")
    const writes: { table: string; row: unknown }[] = []
    const candidates = [
      { id: "a", first_name: "Anna", last_name: "A", email: "anna@x.de", campaigns: { title: "Grass + Hellstern", kind: "kanzlei", skip_lead_confirmation: true, clients: null } },
      { id: "b", first_name: "Ben", last_name: "B", email: "ben@x.de", campaigns: { title: "KS24 - Köln", kind: "lead", skip_lead_confirmation: false, clients: null } },
    ]
    const result = await sendLeadConfirmations(fakeDb(candidates, writes))
    expect(sent).toEqual([["ben@x.de"]])
    expect(result.sent).toBe(1)
    expect(writes.filter((w) => w.table === "candidate_mail_runs").map((w) => (w.row as { candidate_id: string }).candidate_id)).toEqual(["a", "b"])
    expect(writes.some((w) => w.table === "candidate_history" && JSON.stringify(w.row).includes("Keine Eingangsbestätigung"))).toBe(true)
  })
})
