import { describe, expect, it } from "vitest"
import { applyEmailLogo, emailLogoSize, hasEmailLayout, renderEmailLayout } from "./email-layout"

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

  it("gibt dem Logo feste Abmessungen aus der URL (Outlook)", () => {
    expect(emailLogoSize("https://x/logo.png?v=1&w=480&h=480")).toEqual({ width: 56, height: 56 })
    expect(emailLogoSize("https://x/logo.png?v=1&w=480&h=120")).toEqual({ width: 220, height: 55 })
    expect(emailLogoSize("https://x/logo.png?v=1")).toBeNull()
    const html = applyEmailLogo(renderEmailLayout({ contentHtml: "x" }), "https://x/logo.png?v=1&w=480&h=480")
    expect(html).toContain('width="56" height="56"')
  })
})
