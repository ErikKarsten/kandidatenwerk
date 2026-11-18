import { redirect } from "next/navigation"

// Meta-Analyse-Tool (Paket 108/110): eigene Seite unter /meta-analyse-tool/ (Webseite des
// Tools 1:1, Daten über /api/meta-analyse/*). Nicht mehr im Rahmen eingebettet - die
// Live-Domain setzt X-Frame-Options: DENY (Cloudflare), dann bleibt der Rahmen leer.
// Diese Adresse leitet nur noch weiter (alte Lesezeichen).
export default function MetaAnalysePage() {
  redirect("/meta-analyse-tool/index.html")
}
