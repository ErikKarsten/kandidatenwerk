import { describe, expect, it } from "vitest"
import { applyEmailLogo, hasEmailLayout, renderEmailLayout } from "./email-layout"

describe("E-Mail-Layout", () => {
  const html = renderEmailLayout({ heading: "Hallo", contentHtml: "<p>Text</p>" })

  it("markiert das Layout und enthält Symbol und Schriftzug", () => {
    expect(hasEmailLayout(html)).toBe(true)
    expect(html).toContain("Kandidatenwerk")
  })

  it("ersetzt Symbol und Schriftzug durch das Agentur-Logo", () => {
    const withLogo = applyEmailLogo(html, "https://example.com/logo.png")
    expect(withLogo).toContain('<img src="https://example.com/logo.png"')
    expect(withLogo).not.toContain("<svg")
    expect(withLogo).toContain("<p>Text</p>")
    expect(applyEmailLogo(html, null)).toBe(html)
  })
})
