import { describe, expect, it } from "vitest"
import { matchesDue, weekEnd } from "@/lib/task-due"

describe("Fälligkeit", () => {
  const today = "2026-10-09" // Freitag
  it("Woche endet am Sonntag", () => {
    expect(weekEnd(today)).toBe("2026-10-11")
    expect(weekEnd("2026-10-11")).toBe("2026-10-11")
    expect(weekEnd("2026-10-12")).toBe("2026-10-18")
  })
  it("filtert nach Fälligkeit", () => {
    expect(matchesDue("2026-10-08", "ueberfaellig", today)).toBe(true)
    expect(matchesDue("2026-10-09", "heute", today)).toBe(true)
    expect(matchesDue("2026-10-11", "woche", today)).toBe(true)
    expect(matchesDue("2026-10-12", "woche", today)).toBe(false)
    expect(matchesDue("2026-10-08", "woche", today)).toBe(false)
    expect(matchesDue(null, "ohne", today)).toBe(true)
    expect(matchesDue(null, "heute", today)).toBe(false)
  })
})
