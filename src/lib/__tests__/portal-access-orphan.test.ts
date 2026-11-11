import { beforeEach, describe, expect, it, vi } from "vitest"

// Paket 100: Portal-Zugang eines gelöschten Kunden wird vom neuen Kunden übernommen.
const state: {
  profile: { id: string; role: string; client_id: string | null } | null
  clients: Set<string>
  updates: { id: string; patch: Record<string, unknown> }[]
  created: number
} = { profile: null, clients: new Set(), updates: [], created: 0 }

const fakeAdmin = {
  from(table: string) {
    if (table === "profiles") {
      return {
        select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            state.updates.push({ id, patch })
            return { error: null }
          },
        }),
        insert: async () => ({ error: null }),
      }
    }
    if (table === "clients") {
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: state.clients.has(id) ? { id } : null, error: null }) }),
        }),
      }
    }
    throw new Error(`unerwartete Tabelle ${table}`)
  },
  auth: {
    admin: {
      createUser: async () => {
        state.created++
        return { data: { user: { id: "neu" } }, error: null }
      },
      deleteUser: async () => ({}),
    },
  },
}

vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => fakeAdmin }))
vi.mock("@/lib/password-reset", () => ({ sendPortalAccessMail: vi.fn() }))
vi.mock("@/lib/password-link", () => ({ createPasswordLink: vi.fn() }))

const { ensurePortalAccess } = await import("@/lib/portal-access")

describe("ensurePortalAccess bei Zugängen gelöschter Kunden (Paket 100)", () => {
  beforeEach(() => {
    state.profile = null
    state.clients = new Set(["neuer-kunde", "anderer-kunde"])
    state.updates = []
    state.created = 0
  })

  it("übernimmt den Zugang, wenn der alte Kunde gelöscht ist", async () => {
    state.profile = { id: "p1", role: "client", client_id: "geloeschter-kunde" }
    expect(await ensurePortalAccess("neuer-kunde", " HHenze@Kamey-StB.de ")).toEqual({ profileId: "p1", created: false })
    expect(state.updates).toEqual([{ id: "p1", patch: { client_id: "neuer-kunde" } }])
    expect(state.created).toBe(0)
  })

  it("blockiert weiter, wenn der Zugang zu einem bestehenden anderen Kunden gehört", async () => {
    state.profile = { id: "p1", role: "client", client_id: "anderer-kunde" }
    expect(await ensurePortalAccess("neuer-kunde", "a@b.de")).toEqual({ error: "Diese E-Mail ist schon Portal-Zugang eines anderen Kunden." })
    expect(state.updates).toEqual([])
  })

  it("übernimmt nie einen Team-Zugang", async () => {
    state.profile = { id: "p1", role: "agency_member", client_id: null }
    expect(await ensurePortalAccess("neuer-kunde", "a@b.de")).toEqual({ error: "Diese E-Mail gehört zu einem Team-Zugang." })
    expect(state.updates).toEqual([])
  })

  it("legt ohne vorhandenen Zugang wie bisher einen neuen an", async () => {
    expect(await ensurePortalAccess("neuer-kunde", "a@b.de")).toEqual({ profileId: "neu", created: true })
    expect(state.created).toBe(1)
  })
})
