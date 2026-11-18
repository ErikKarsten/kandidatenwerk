import { NextResponse } from "next/server"
import { metaConfigured, runMetaZentral } from "@/lib/meta-zentral"
import { syncMetaAnzeigen } from "@/lib/meta-anzeigen"
import { fehlerAntwort, metaAnalyseZugang } from "@/lib/meta-analyse-guard"

// "Daten von Meta holen" im Meta-Analyse-Tool (Paket 108): Zahlen der letzten Tage und
// Kontostand (1 Anfrage), dazu Texte und Bilder der Anzeigen (1 Anfrage je 50 Anzeigen).
// Die KI-Einschätzung neuer Anzeigen läuft morgens im täglichen Lauf.
export async function POST() {
  const z = await metaAnalyseZugang()
  if ("antwort" in z) return z.antwort
  if (!metaConfigured()) return NextResponse.json({ status: "fehler", nachricht: "Meta ist in dieser Umgebung nicht eingerichtet." })
  try {
    const zentral = await runMetaZentral(z.db)
    const anzeigen = await syncMetaAnzeigen(z.db, { ki: false })
    return NextResponse.json({
      status: "fertig",
      nachricht: `${zentral.tageszeilen} Tageszeilen, ${anzeigen.anzeigen} Anzeigen, ${anzeigen.neueBilder} neue Bilder`,
    })
  } catch (err) {
    const antwort = fehlerAntwort(err)
    return NextResponse.json({ status: "fehler", nachricht: ((await antwort.json()) as { fehler: string }).fehler })
  }
}
