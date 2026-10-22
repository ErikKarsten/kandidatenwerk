import { describe, expect, it } from "vitest"
import { CLIENT_NOT_LIVE_MESSAGE, clientNotLiveError, ensureCampaignAssignment } from "@/lib/client-assignment"

// Paket 78: Kandidaten nur an Kanzleien in der Projektphase "Live".
function fakeDb(tables: Record<string, Record<string, unknown> | null>, inserts: unknown[] = []) {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
        insert: (row: unknown) => {
          inserts.push(row)
          return { select: () => ({ single: async () => ({ data: { id: "neu" }, error: null }) }) }
        },
      }
      return q
    },
  } as never
}

describe("Zuordnen nur an Live-Kanzleien", () => {
  it("meldet Kanzleien, die nicht live sind", async () => {
    await expect(clientNotLiveError(fakeDb({ clients: { project_phase: "live" } }), "k1")).resolves.toBeNull()
    await expect(clientNotLiveError(fakeDb({ clients: { project_phase: "onboarding" } }), "k1")).resolves.toBe(CLIENT_NOT_LIVE_MESSAGE)
    await expect(clientNotLiveError(fakeDb({ clients: null }), "k1")).resolves.toBe(CLIENT_NOT_LIVE_MESSAGE)
  })

  it("legt keine Zuordnung zu einer Kanzlei im Onboarding an", async () => {
    const inserts: unknown[] = []
    const base = { campaigns: { client_id: "k1", kind: "kanzlei" }, candidates: { status: "vorqualifiziert", is_demo: false, tags: [] } }
    await expect(ensureCampaignAssignment(fakeDb({ ...base, clients: { project_phase: "onboarding" } }, inserts), "c1", "camp1")).rejects.toThrow(CLIENT_NOT_LIVE_MESSAGE)
    expect(inserts).toHaveLength(0)
    await expect(ensureCampaignAssignment(fakeDb({ ...base, clients: { project_phase: "live" }, client_assignments: null }, inserts), "c1", "camp1")).resolves.toEqual({ id: "neu", created: true })
    expect(inserts).toHaveLength(1)
  })
})
