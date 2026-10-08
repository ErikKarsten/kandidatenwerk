// Text der Website einer Kanzlei als zusätzliche Quelle für das Kanzleiprofil (Neuimport
// T-20, Paket 39): Startseite plus bis zu vier passende Unterseiten (Über uns, Team, Kanzlei,
// Karriere, Leistungen). Ohne Skripte, Stile und Navigation, gekürzt.
const PAGE_HINTS = /(ueber|über|about|kanzlei|team|karriere|jobs|stellen|leistung|mandant|philosophie|wir)/i
const MAX_PAGE_CHARS = 8_000
const MAX_TOTAL_CHARS = 25_000

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Kandidatenwerk Kanzleiprofil)" }, redirect: "follow", signal: AbortSignal.timeout(15_000) })
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function fetchWebsiteText(website: string | null | undefined): Promise<string | null> {
  if (!website?.trim()) return null
  const start = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`
  const html = await fetchHtml(start)
  if (!html) return null
  const base = new URL(start)
  const links = [...html.matchAll(/href="([^"#?]+)"/gi)]
    .map((m) => {
      try {
        return new URL(m[1], base)
      } catch {
        return null
      }
    })
    .filter((u): u is URL => !!u && u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && PAGE_HINTS.test(u.pathname))
  const pages = [...new Set(links.map((u) => u.toString()))].slice(0, 4)
  const texts = [`Startseite (${start}):\n${htmlToText(html).slice(0, MAX_PAGE_CHARS)}`]
  for (const page of pages) {
    const sub = await fetchHtml(page)
    if (sub) texts.push(`${page}:\n${htmlToText(sub).slice(0, MAX_PAGE_CHARS)}`)
  }
  return texts.join("\n\n").slice(0, MAX_TOTAL_CHARS)
}
