import { describe, expect, it } from "vitest"
import { callHistoryText, formatDuration, parsePushEvent, pushSubscribeXml } from "@/lib/sipgate-calls"
import { friendlySipgateError } from "@/lib/sipgate"

// Paket 92: Anrufe über sipgate im Verlauf.
describe("sipgate-Anrufe", () => {
  it("liest die Push-Ereignisse", () => {
    const form = new FormData()
    form.set("event", "hangup")
    form.set("callId", "123456")
    form.set("direction", "out")
    form.set("from", "492111234567")
    form.set("to", "4915111030580")
    form.set("cause", "noAnswer")
    form.append("userId[]", "w2")
    expect(parsePushEvent(form)).toEqual({
      event: "hangup",
      callId: "123456",
      direction: "out",
      from: "492111234567",
      to: "4915111030580",
      cause: "noAnswer",
      sipgateUserIds: ["w2"],
    })
    expect(parsePushEvent(new FormData())).toBeNull()
  })

  it("schreibt verständliche Verlaufseinträge", () => {
    expect(formatDuration(372)).toBe("6:12 Min")
    expect(callHistoryText({ direction: "out", userName: "Christina Hohler", answered: true, durationSeconds: 372, cause: "normalClearing" })).toBe(
      "Ausgehender Anruf · Christina Hohler · 6:12 Min · erreicht"
    )
    expect(callHistoryText({ direction: "out", userName: null, answered: false, durationSeconds: 0, cause: "busy" })).toBe("Ausgehender Anruf · nicht erreicht (besetzt)")
    expect(callHistoryText({ direction: "in", userName: "Josef Beck", answered: false, durationSeconds: 0, cause: "cancel" })).toBe(
      "Eingehender Anruf · Josef Beck · nicht erreicht (abgebrochen)"
    )
  })

  it("abonniert answer und hangup per XML", () => {
    expect(pushSubscribeXml("https://x.de/api/webhooks/sipgate?token=a&b")).toContain('onHangup="https://x.de/api/webhooks/sipgate?token=a&amp;b"')
  })

  it("erklärt sipgate-Fehler", () => {
    expect(friendlySipgateError(401)).toMatch(/Zugangstoken/)
    expect(friendlySipgateError(403, "sipgate.io feature not booked")).toMatch(/nicht gebucht/)
    expect(friendlySipgateError(402)).toMatch(/Guthaben/)
  })
})
