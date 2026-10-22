import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Paket 76: Musterdatensätze haben Adressen bei gängigen Mailanbietern - dorthin geht nie etwas.
describe("keine Mails an Musterdatensätze", () => {
  beforeEach(() => {
    vi.stubEnv("BREVO_API_KEY", "test")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test")
    vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("lässt Adressen aus, die nur Musterdatensätzen gehören", async () => {
    const brevo: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/rest/v1/candidates")) {
        return new Response(JSON.stringify([
          { email: "anna.muster12@gmx.de", tags: ["Musterdatensatz"] },
          { email: "max.beispiel34@gmail.com", tags: ["Musterdatensatz"] },
          { email: "max.beispiel34@gmail.com", tags: [] },
        ]), { status: 200, headers: { "Content-Type": "application/json" } })
      }
      if (url.includes("/rest/v1/")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })
      brevo.push(String(init?.body))
      return new Response("{}", { status: 201 })
    }))
    const { sendEmail } = await import("@/lib/brevo-mail")
    await expect(sendEmail(["anna.muster12@gmx.de"], "Hallo", "<p>x</p>")).resolves.toEqual([])
    expect(brevo).toHaveLength(0)
    // Gehört die Adresse auch einem echten Kandidaten, geht die Mail raus.
    await expect(sendEmail(["Anna.Muster12@gmx.de", "max.beispiel34@gmail.com", "info@kanzlei.de"], "Hallo", "<p>x</p>")).resolves.toEqual([
      "max.beispiel34@gmail.com",
      "info@kanzlei.de",
    ])
    expect(brevo).toHaveLength(1)
    expect(brevo[0]).not.toContain("anna.muster12")
  })

  it("Automatisierungen an den Kandidaten lassen Musterdatensätze aus", async () => {
    const { resolveAutomationRecipients } = await import("@/lib/automation-engine")
    const db = {} as never
    await expect(resolveAutomationRecipients(db, "candidate", { email: "anna.muster12@gmx.de", client_id: null, tags: ["Musterdatensatz"] })).resolves.toEqual([])
    await expect(resolveAutomationRecipients(db, "candidate", { email: "echt@gmx.de", client_id: null, tags: [] })).resolves.toEqual(["echt@gmx.de"])
  })
})
