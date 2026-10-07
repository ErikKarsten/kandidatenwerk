import { afterEach, describe, expect, it } from "vitest"
import { isCronAuthorized } from "./cron-auth"

const req = (secret?: string) => new Request("https://x/api/cron/test", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} })

describe("isCronAuthorized", () => {
  const original = process.env.CRON_SECRET
  afterEach(() => {
    process.env.CRON_SECRET = original
  })

  it("akzeptiert nur das richtige Secret", () => {
    process.env.CRON_SECRET = "geheim-123"
    expect(isCronAuthorized(req("geheim-123"))).toBe(true)
    expect(isCronAuthorized(req("geheim-124"))).toBe(false)
    expect(isCronAuthorized(req("geheim"))).toBe(false)
    expect(isCronAuthorized(req())).toBe(false)
  })

  it("lehnt alles ab, wenn kein Secret gesetzt ist", () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorized(req(""))).toBe(false)
    expect(isCronAuthorized(req("irgendwas"))).toBe(false)
  })
})
