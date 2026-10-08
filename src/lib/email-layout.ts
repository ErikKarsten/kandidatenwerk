// Einheitliches Layout aller Mails aus Kandidatenwerk (Paket 19, T-87) - nach dem Vorbild
// der Portal-Einladung (supabase/email-templates/invite.html): grauer Hintergrund, weiße
// Karte, Badge mit Aktentasche, Schriftzug "Kandidatenwerk", Fußzeile. sendEmail legt es
// um jede Mail, die es noch nicht hat (Erkennung über data-kw-layout).

import { DATENSCHUTZ_URL, IMPRESSUM_URL } from "@/lib/legal-links"

export const EMAIL_LAYOUT_MARKER = "data-kw-layout"
const BLUE = "#1e56a0"

export interface EmailLayoutOptions {
  // Kleine Zeile unter dem Schriftzug, z.B. "Kunden-Portal".
  subtitle?: string | null
  // Überschrift über dem Inhalt.
  heading?: string | null
  // Fertiges HTML des Inhalts.
  contentHtml: string
  // Hinweis in der Fußzeile über "Automatisch generiert …" bzw. dem Absender.
  footerNote?: string | null
  // Statt "Automatisch generiert von Kandidatenwerk", z.B. "Gesendet von Max Muster".
  footerSender?: string | null
}

export function renderEmailLayout(o: EmailLayoutOptions): string {
  const footer = [o.footerNote, o.footerSender ?? "Automatisch generiert von Kandidatenwerk"].filter(Boolean).join("<br>")
  return `
<div ${EMAIL_LAYOUT_MARKER}="1" style="background-color:#f0f4f8;padding:32px 16px;font-family:-apple-system,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #dde3ea;border-radius:16px;overflow:hidden;">
    <div style="padding:32px 32px 0;text-align:center;">
      <!--KW_LOGO_START-->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr>
          <td style="width:44px;height:44px;background-color:#0f2137;border-radius:12px;text-align:center;vertical-align:middle;" align="center" valign="middle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ba3c3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:12px;">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </td>
        </tr>
      </table>
      <div style="font-size:20px;font-weight:700;color:${BLUE};">Kandidatenwerk</div>
      <!--KW_LOGO_END-->
      ${o.subtitle ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${o.subtitle}</div>` : ""}
    </div>
    <div style="padding:28px 32px 8px;">
      ${o.heading ? `<div style="font-size:17px;font-weight:600;color:#111827;text-align:center;margin-bottom:16px;">${o.heading}</div>` : ""}
      <div style="font-size:14px;color:#374151;line-height:1.6;">${o.contentHtml}</div>
    </div>
    <div style="padding:20px 32px 24px;margin-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
      <div style="font-size:11px;color:#9ca3af;line-height:1.6;">${footer}</div>
      <div style="font-size:11px;color:#9ca3af;line-height:1.6;margin-top:8px;"><a href="${IMPRESSUM_URL}" style="color:#9ca3af;">Impressum</a> &middot; <a href="${DATENSCHUTZ_URL}" style="color:#9ca3af;">Datenschutz</a></div>
    </div>
  </div>
</div>`.trim()
}

// Knopf im Layout-Stil (z.B. "Kandidat ansehen").
export function emailButton(href: string, label: string): string {
  return `<div style="text-align:center;margin:20px 0 4px;"><a href="${href}" style="display:inline-block;background-color:${BLUE};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">${label}</a></div>`
}

// Agentur-Logo statt Symbol + Schriftzug (Paket 23, T-94) - setzt sendEmail ein, wenn in
// den Kontoeinstellungen ein Logo hinterlegt ist.
// Logo-Größe für Mails: feste width/height-Attribute, weil Outlook und andere Programme
// max-height/max-width ignorieren und das Bild sonst in Originalgröße zeigen (Paket 38).
// Die Abmessungen stehen beim Hochladen in der URL (&w=…&h=…).
const LOGO_MAX_HEIGHT = 56
const LOGO_MAX_WIDTH = 220

export function emailLogoSize(logoUrl: string): { width: number; height: number } | null {
  const w = Number(logoUrl.match(/[?&]w=(\d+)/)?.[1])
  const h = Number(logoUrl.match(/[?&]h=(\d+)/)?.[1])
  if (!w || !h) return null
  let height = Math.min(LOGO_MAX_HEIGHT, h)
  let width = Math.round((w * height) / h)
  if (width > LOGO_MAX_WIDTH) {
    width = LOGO_MAX_WIDTH
    height = Math.round((h * width) / w)
  }
  return { width, height }
}

export function applyEmailLogo(html: string, logoUrl: string | null | undefined): string {
  if (!logoUrl) return html
  const safe = logoUrl.replace(/"/g, "%22")
  const size = emailLogoSize(logoUrl)
  const attrs = size ? `width="${size.width}" height="${size.height}"` : `height="${LOGO_MAX_HEIGHT}"`
  const dims = size ? `width:${size.width}px;height:${size.height}px;` : `height:${LOGO_MAX_HEIGHT}px;width:auto;`
  return html.replace(
    /<!--KW_LOGO_START-->[\s\S]*?<!--KW_LOGO_END-->/,
    `<img src="${safe}" alt="Logo" ${attrs} style="display:block;margin:0 auto;${dims}max-width:${LOGO_MAX_WIDTH}px;border:0;outline:none;text-decoration:none;">`
  )
}

export function hasEmailLayout(html: string): boolean {
  return html.includes(EMAIL_LAYOUT_MARKER)
}
