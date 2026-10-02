import { describe, expect, it } from "vitest"
import { addDays, berlinDayStartUtc, parseDateRange } from "./dashboard-stats"

describe("berlinDayStartUtc", () => {
  it("rechnet Sommerzeit (UTC+2) um", () => {
    expect(berlinDayStartUtc("2026-07-15")).toBe("2026-07-14T22:00:00.000Z")
  })
  it("rechnet Winterzeit (UTC+1) um", () => {
    expect(berlinDayStartUtc("2026-01-15")).toBe("2026-01-14T23:00:00.000Z")
  })
})

describe("parseDateRange", () => {
  it("übernimmt gültige Daten", () => {
    expect(parseDateRange("2026-09-01", "2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30" })
  })
  it("tauscht vertauschte Daten", () => {
    expect(parseDateRange("2026-09-30", "2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" })
  })
  it("fällt bei ungültigen Werten auf 30 Tage zurück", () => {
    const range = parseDateRange("quatsch", "2026-09-30")
    expect(range).toEqual({ from: addDays("2026-09-30", -29), to: "2026-09-30" })
  })
})
