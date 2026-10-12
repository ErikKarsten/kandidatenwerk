import { describe, expect, it } from "vitest"
import { hashToken } from "@/lib/password-link"

describe("hashToken", () => {
  it("liefert einen stabilen SHA-256-Hash", async () => {
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})
