import { describe, expect, it } from "vitest"
import { candidatePortalLink, substituteTemplateVars, usesCandidateLink, wrapAutomationEmailHtml } from "@/lib/automation-engine"

const vars = {
  Kandidatenname: "Erika Muster",
  Kampagnenname: "SFA Hamburg",
  Kundenname: "Kanzlei Beispiel",
  Email: "erika@example.com",
  Telefon: "0151 123",
  Bewerberlink: candidatePortalLink("abc-123"),
}

describe("substituteTemplateVars", () => {
  it("ersetzt alle bekannten Platzhalter, auch mehrfach", () => {
    expect(substituteTemplateVars("#Kandidatenname / #Kandidatenname bei #Kundenname", vars)).toBe(
      "Erika Muster / Erika Muster bei Kanzlei Beispiel"
    )
  })

  it("lässt unbekannte Platzhalter stehen", () => {
    expect(substituteTemplateVars("Hallo #Vorname", vars)).toBe("Hallo #Vorname")
  })
})

describe("wrapAutomationEmailHtml", () => {
  it("escaped HTML aus Kandidatendaten", () => {
    const text = substituteTemplateVars("Neu: #Kandidatenname", { ...vars, Kandidatenname: '<script>alert("x")</script>' })
    const html = wrapAutomationEmailHtml(text)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("macht aus Leerzeilen Absätze und aus Zeilenumbrüchen <br>", () => {
    const html = wrapAutomationEmailHtml("Zeile 1\nZeile 2\n\nAbsatz 2")
    expect(html.match(/<p /g)).toHaveLength(2)
    expect(html).toContain("Zeile 1<br>Zeile 2")
  })
})

describe("Bewerberlink (Paket 16)", () => {
  it("wird als klickbarer Link ins Kundenportal ausgegeben", () => {
    const html = wrapAutomationEmailHtml(substituteTemplateVars("Zum Profil: #Bewerberlink", vars))
    expect(html).toContain('href="https://kandidatenwerk.kanzleistelle24.de/portal/candidates/abc-123"')
    expect(html).toContain("Bewerberprofil öffnen")
  })

  it("erkennt, ob eine Automatisierung den Link nutzt", () => {
    expect(usesCandidateLink({ subject: "Neu", body_html: "Hier: #Bewerberlink" })).toBe(true)
    expect(usesCandidateLink({ subject: "Neu", body_html: "Ohne Link" })).toBe(false)
  })
})
