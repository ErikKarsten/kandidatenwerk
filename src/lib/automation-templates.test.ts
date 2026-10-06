import { describe, expect, it } from "vitest"
import { automationDelayLabel, automationRecipientLabel, automationTriggerLabel, isCampaignTrigger } from "./automation-templates"
import { ASSIGNMENT_STATUS_OPTIONS, PORTAL_ASSIGNMENT_STATUS_VALUES, assignmentStatusLabel } from "./assignment-status"
import { CANDIDATE_STATUS_OPTIONS } from "./candidate-status"

describe("Automatisierungs-Vorlagen", () => {
  it("beschriftet Auslöser, Empfänger und Verzögerung", () => {
    expect(automationTriggerLabel("new_lead", null)).toBe("Neuer Lead")
    expect(automationTriggerLabel("status_change", "nicht_erreicht_mail")).toBe("Statusänderung → 2x nicht erreicht + Mail")
    expect(automationRecipientLabel("client")).toBe("Kanzlei: alle Portal-Zugänge (ohne Zugang: Kontakt-E-Mail)")
    expect(automationDelayLabel(3600)).toBe("1 Stunde")
    expect(automationDelayLabel(45)).toBe("45 Sekunden")
  })

  it("trennt Kampagnen-Auslöser von manuellen Vorlagen", () => {
    expect(isCampaignTrigger("new_lead")).toBe(true)
    expect(isCampaignTrigger("status_change")).toBe(true)
    expect(isCampaignTrigger("client_assigned")).toBe(true)
    expect(isCampaignTrigger("manual")).toBe(false)
    expect(automationTriggerLabel("client_assigned", null)).toBe("Kandidat der Kampagne zugeordnet")
  })
})

describe("Status vereinheitlicht (Paket 15)", () => {
  it("kennt intern kein Interview, Vorgestellt oder Platziert mehr", () => {
    const values = CANDIDATE_STATUS_OPTIONS.map((o) => o.value as string)
    for (const removed of ["interview", "vorgestellt", "platziert"]) expect(values).not.toContain(removed)
  })

  it("benennt den Kunden-Status überall gleich", () => {
    expect(ASSIGNMENT_STATUS_OPTIONS.map((o) => o.label)).toEqual(["Neu", "Vorstellungsgespräch", "Eingestellt", "Abgelehnt"])
    expect(PORTAL_ASSIGNMENT_STATUS_VALUES.map((v) => assignmentStatusLabel(v).label)).toEqual(["Vorstellungsgespräch", "Eingestellt", "Abgelehnt"])
    expect(assignmentStatusLabel("unbekannt").label).toBe("unbekannt")
  })
})
