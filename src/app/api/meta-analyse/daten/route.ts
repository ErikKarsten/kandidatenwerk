import { NextResponse, type NextRequest } from "next/server"
import { metaAnalyseDaten } from "@/lib/meta-analyse-api"
import { fehlerAntwort, metaAnalyseZugang } from "@/lib/meta-analyse-guard"

// Daten der Seite für 7, 30 oder 90 Tage (Paket 108). Keine Meta-Anfrage.
export async function GET(request: NextRequest) {
  const z = await metaAnalyseZugang()
  if ("antwort" in z) return z.antwort
  const tage = Number(request.nextUrl.searchParams.get("tage"))
  try {
    return NextResponse.json(await metaAnalyseDaten(z.db, [7, 30, 90].includes(tage) ? tage : 30))
  } catch (err) {
    return fehlerAntwort(err)
  }
}
