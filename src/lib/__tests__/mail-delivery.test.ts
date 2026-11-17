import { describe, expect, it } from "vitest"
import { describeReason, planDelivery, type DeliveryEvent } from "@/lib/mail-delivery"

const now = new Date("2026-11-17T12:00:00Z")
const ev = (over: Partial<DeliveryEvent>): DeliveryEvent => ({
  messageId: "<m1@brevo>",
  email: "kanzlei@example.org",
  event: "softBounces",
  reason: "554 5.7.1 blocked using bl.spamcop.net",
  date: "2026-11-17T11:00:00Z",
  ...over,
})

describe("planDelivery", () => {
  const sent = new Map([
    ["<m1@brevo>", { retry_of: null }],
    ["<m2@brevo>", { retry_of: "<m1@brevo>" }],
  ])

  it("verschickt eine vorübergehend abgewiesene Mail einmal erneut", () => {
    expect(planDelivery([ev({})], sent, new Set(), now)).toEqual({ retry: [ev({})], report: [] })
  })

  it("wartet die Mindestzeit ab", () => {
    expect(planDelivery([ev({ date: "2026-11-17T11:45:00Z" })], sent, new Set(), now)).toEqual({ retry: [], report: [] })
  })

  it("meldet endgültige Abweisungen und gescheiterte zweite Versuche", () => {
    const hard = ev({ event: "hardBounces" })
    const blocked = ev({ event: "blocked", email: "x@example.org" })
    const secondTry = ev({ messageId: "<m2@brevo>" })
    expect(planDelivery([hard, blocked, secondTry], sent, new Set(), now)).toEqual({ retry: [], report: [hard, blocked, secondTry] })
  })

  it("lässt fremde und schon bearbeitete Mails aus, doppelte Ereignisse nur einmal", () => {
    const foreign = ev({ messageId: "<fremd@brevo>" })
    const done = new Set(["<m1@brevo>|kanzlei@example.org|softBounces"])
    expect(planDelivery([foreign, ev({})], sent, done, now)).toEqual({ retry: [], report: [] })
    expect(planDelivery([ev({}), ev({})], sent, new Set(), now).retry).toHaveLength(1)
  })
})

describe("describeReason", () => {
  it("erklärt den Grund in einfachen Worten", () => {
    expect(describeReason({ event: "blocked", reason: "" })).toContain("gesperrt")
    expect(describeReason({ event: "hardBounces", reason: "550 user unknown" })).toContain("existiert nicht")
    expect(describeReason({ event: "softBounces", reason: "554 blocked" })).toContain("abgewiesen (554 blocked)")
  })
})
