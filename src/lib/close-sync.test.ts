import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { verifyCloseSignature } from "./close-sync"

describe("verifyCloseSignature", () => {
  const key = "a1b2c3d4e5f6"
  const body = '{"event":{"object_type":"activity.meeting"}}'
  const ts = "1759740000"
  const hash = createHmac("sha256", Buffer.from(key, "hex")).update(ts + body).digest("hex")

  it("akzeptiert korrekt signierte Zustellungen", () => {
    expect(verifyCloseSignature(body, ts, hash, key)).toBe(true)
  })

  it("lehnt veränderte oder unsignierte Zustellungen ab", () => {
    expect(verifyCloseSignature(body + " ", ts, hash, key)).toBe(false)
    expect(verifyCloseSignature(body, ts, null, key)).toBe(false)
    expect(verifyCloseSignature(body, ts, hash, undefined)).toBe(false)
  })
})
