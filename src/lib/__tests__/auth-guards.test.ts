import { describe, expect, it } from "vitest"
import { getStaffContext, requireAgencyAdmin, requireStaffUser } from "@/lib/auth-guards"

// Nachgebauter Supabase-Server-Client: nur auth.getUser() und
// from("profiles").select().eq().single(), wie von den Guards genutzt.
function fakeSupabase(user: { id: string } | null, profile: { role: string; agency_id: string | null } | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }),
    }),
  } as unknown as Parameters<typeof getStaffContext>[0]
}

describe("auth-guards", () => {
  it("lehnt ohne Login ab", async () => {
    expect(await requireStaffUser(fakeSupabase(null, null))).toEqual({ error: "Nicht eingeloggt." })
  })

  it("lehnt Portal-Kunden ab", async () => {
    expect(await requireStaffUser(fakeSupabase({ id: "u" }, { role: "client", agency_id: null }))).toEqual({
      error: "Nicht berechtigt.",
    })
  })

  it("lehnt Nutzer ohne Profil ab (Lücke der alten requireStaffUser-Kopien)", async () => {
    expect(await requireStaffUser(fakeSupabase({ id: "u" }, null))).toEqual({ error: "Nicht berechtigt." })
  })

  it.each(["agency_admin", "agency_member"])("lässt %s als Staff durch", async (role) => {
    expect(await requireStaffUser(fakeSupabase({ id: "u" }, { role, agency_id: "a" }))).toBeNull()
  })

  it("requireAgencyAdmin lehnt Mitarbeiter ab und lässt Admins durch", async () => {
    expect(await requireAgencyAdmin(fakeSupabase({ id: "u" }, { role: "agency_member", agency_id: "a" }))).toEqual({
      error: "Nur für Agentur-Admins.",
    })
    expect(await requireAgencyAdmin(fakeSupabase({ id: "u" }, { role: "agency_admin", agency_id: "a" }))).toEqual({
      staff: { userId: "u", role: "agency_admin", agencyId: "a" },
    })
  })
})
