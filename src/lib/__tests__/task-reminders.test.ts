import { describe, expect, it } from "vitest"
import { berlinToday, buildReminderHtml } from "@/lib/cron/task-reminders"

describe("berlinToday", () => {
  it("nimmt das deutsche Datum, nicht das UTC-Datum", () => {
    // 22:30 UTC am 1.10. ist in Berlin (Sommerzeit, UTC+2) schon der 2.10.
    expect(berlinToday(new Date("2026-10-01T22:30:00Z"))).toBe("2026-10-02")
    // 23:30 UTC am 1.12. ist in Berlin (Winterzeit, UTC+1) der 2.12.
    expect(berlinToday(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02")
    expect(berlinToday(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01")
  })
})

describe("buildReminderHtml", () => {
  const base = { assigned_to: "u", candidate_id: null }

  it("markiert überfällige und heute fällige Aufgaben unterschiedlich", () => {
    const html = buildReminderHtml(
      [
        { ...base, id: "1", title: "Alt", due_date: "2026-09-30" },
        { ...base, id: "2", title: "Heute", due_date: "2026-10-02" },
      ],
      "2026-10-02"
    )
    expect(html).toContain("Überfällig seit 30.09.2026")
    expect(html).toContain("Fällig am 02.10.2026")
    expect(html).toContain("2 Aufgaben sind fällig")
  })

  it("escaped Aufgabentitel und verlinkt den Kandidaten", () => {
    const html = buildReminderHtml(
      [{ ...base, id: "1", title: "<b>x</b>", due_date: "2026-10-02", candidate_id: "c1" }],
      "2026-10-02"
    )
    expect(html).not.toContain("<b>x</b>")
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;")
    expect(html).toContain("/dashboard/candidates/c1")
  })
})
