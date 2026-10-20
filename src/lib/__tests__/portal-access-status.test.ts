import { describe, expect, it } from "vitest"
import { accessStatusText } from "@/app/dashboard/clients/[id]/portal-access-section"

describe("Kundenzugang: letzte Anmeldung (Paket 73)", () => {
  it("zeigt Datum und Uhrzeit in deutscher Zeit", () => {
    expect(accessStatusText({ id: "1", email: "a@b.de", status: "aktiv", lastSignInAt: "2026-10-20T07:14:00Z" })).toBe("Zuletzt angemeldet: 20.10.2026, 09:14 Uhr")
    expect(accessStatusText({ id: "1", email: "a@b.de", status: "eingeladen", invitedAt: "2026-10-19T12:58:56Z" })).toBe("Eingeladen am 19.10.2026, 14:58 Uhr · noch kein Login")
    expect(accessStatusText({ id: "1", email: "a@b.de", status: "angelegt" })).toBe("Angelegt, Einladung noch nicht verschickt")
  })
})
