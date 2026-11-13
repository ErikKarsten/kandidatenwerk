import { describe, expect, it } from "vitest"
import { filterMailRecipients, isAllowedOnStaging, stagingSubject } from "@/lib/mail-guard"

describe("Mail-Sperre für Staging (Paket 102)", () => {
  const staging = { APP_ENV: "staging", MAIL_ALLOWLIST: "test-firma.de, chef@andere.de" }

  it("lässt live alle Empfänger durch", () => {
    expect(filterMailRecipients(["kanzlei@echt.de", "a@b.de"], {})).toEqual(["kanzlei@echt.de", "a@b.de"])
    expect(stagingSubject("Hallo", {})).toBe("Hallo")
  })

  it("schickt auf Staging nur an freigegebene Domains und Adressen", () => {
    expect(
      filterMailRecipients(["anna@test-firma.de", "kanzlei@echt.de", "Chef+kanzlei@Andere.de", "chef@andere.de.evil.com", "x@sub.test-firma.de"], staging)
    ).toEqual(["anna@test-firma.de", "Chef+kanzlei@Andere.de"])
    expect(stagingSubject("Hallo", staging)).toBe("[Staging] Hallo")
  })

  it("schickt auf Staging ohne Freigabeliste gar nichts", () => {
    expect(filterMailRecipients(["anna@test-firma.de"], { APP_ENV: "staging" })).toEqual([])
    expect(filterMailRecipients(["anna@test-firma.de"], { APP_ENV: "staging", MAIL_ALLOWLIST: " , " })).toEqual([])
  })

  it("akzeptiert Domains mit führendem @ und ignoriert Adressen ohne @", () => {
    expect(isAllowedOnStaging("a@test-firma.de", "@test-firma.de")).toBe(true)
    expect(isAllowedOnStaging("test-firma.de", "test-firma.de")).toBe(false)
  })
})
