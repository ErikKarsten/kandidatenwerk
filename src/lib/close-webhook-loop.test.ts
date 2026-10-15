import { describe, expect, it, vi } from "vitest"

// Paket 68: Ein in Close zurückgenommener Statuswechsel ("Gewonnen" gesetzt und gelöscht)
// hat den Webhook mit 500 scheitern lassen - Close stellte endlos neu zu, jede Zustellung
// startete die Übernahme samt KI-Profil von vorn.
vi.mock("@/lib/close-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/close-api")>()),
  closeGet: vi.fn(async () => {
    throw new Error('Close-API 404: {"error": "404 Not Found: Activity not found."}')
  }),
}))

describe("gelöschte Aktivität aus Close", () => {
  it("ist kein Fehler, sondern 'in Close gelöscht'", async () => {
    const { recordActivityFromWebhook, ACTIVITY_DELETED } = await import("./close-sync")
    const outcome = await recordActivityFromWebhook({} as never, {
      event: { object_type: "activity.lead_status_change", action: "created", data: { id: "acti_1", lead_id: "lead_1" } as never },
    })
    expect(outcome).toBe(ACTIVITY_DELETED)
  })
})

describe("queueOnboarding", () => {
  function fakeDb(existing: { triggered_at: string } | null) {
    const upserts: Record<string, unknown>[] = []
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing }) }) }),
        upsert: async (row: Record<string, unknown>) => (upserts.push(row), { error: null }),
      }),
    }
    return { db: db as never, upserts }
  }

  it("ignoriert dasselbe Ereignis noch einmal", async () => {
    const { queueOnboarding } = await import("./close-onboarding")
    const { db, upserts } = fakeDb({ triggered_at: "2026-10-12T14:01:58.641+00:00" })
    expect(await queueOnboarding(db, "lead_1", "Gewonnen", "2026-10-12T14:01:58.641000+00:00")).toBe(false)
    expect(upserts).toHaveLength(0)
  })

  it("plant einen neueren Statuswechsel ein", async () => {
    const { queueOnboarding } = await import("./close-onboarding")
    const { db, upserts } = fakeDb({ triggered_at: "2026-10-15T08:37:07+00:00" })
    expect(await queueOnboarding(db, "lead_1", "Gewonnen", "2026-10-15T11:42:15+00:00")).toBe(true)
    expect(upserts[0]).toMatchObject({ status: "offen", attempts: 0, trigger_status: "Gewonnen" })
  })

  it("plant beim ersten Mal ein", async () => {
    const { queueOnboarding } = await import("./close-onboarding")
    const { db, upserts } = fakeDb(null)
    expect(await queueOnboarding(db, "lead_1", "Gewonnen", "2026-10-15T11:42:15+00:00")).toBe(true)
    expect(upserts).toHaveLength(1)
  })
})
