import { describe, expect, it } from "vitest"
import { messageIdFromAddress } from "./inbound-replies"

describe("messageIdFromAddress", () => {
  it("liest die Nachrichten-ID aus der Antwortadresse", () => {
    expect(messageIdFromAddress("k-3f2b9c1e-1a2b-4c3d-8e9f-0123456789ab@antwort.kanzleistelle24.de")).toBe("3f2b9c1e-1a2b-4c3d-8e9f-0123456789ab")
    expect(messageIdFromAddress("K-3F2B9C1E-1A2B-4C3D-8E9F-0123456789AB@antwort.kanzleistelle24.de")).toBe("3f2b9c1e-1a2b-4c3d-8e9f-0123456789ab")
  })
  it("ignoriert andere Adressen", () => {
    expect(messageIdFromAddress("info@kanzleistelle24.de")).toBeNull()
    expect(messageIdFromAddress(null)).toBeNull()
  })
})
