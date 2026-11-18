import { NextResponse } from "next/server"
import { metaConfigured, metaAdAccount, runMetaZentral } from "@/lib/meta-zentral"
import { fehlerAntwort, metaAnalyseZugang } from "@/lib/meta-analyse-guard"

// Konto-Prüfung für das Meta-Analyse-Tool (Paket 108).
// GET: letzter gespeicherter Stand (alle 30 Minuten vom zentralen Abruf). POST ("Jetzt
// prüfen"): live bei Meta nachfragen - eine Anfrage, höchstens alle 45 Sekunden (wie die
// Supabase-Funktion konto-live des Tools), sonst kommt der letzte Stand zurück.
const ZWISCHENSPEICHER_MS = 45_000

async function letzterStand(db: Parameters<typeof runMetaZentral>[0]) {
  const { data } = await db.from("meta_konto_status").select("stand, geprueft_am").order("geprueft_am", { ascending: false }).limit(1).maybeSingle()
  return (data?.stand as { geprueft_am?: string } | undefined) ?? null
}

export async function GET() {
  const z = await metaAnalyseZugang()
  if ("antwort" in z) return z.antwort
  return NextResponse.json({ status: await letzterStand(z.db) })
}

export async function POST() {
  const z = await metaAnalyseZugang()
  if ("antwort" in z) return z.antwort
  if (!metaConfigured()) return NextResponse.json({ fehler: "Meta ist in dieser Umgebung nicht eingerichtet." }, { status: 503 })
  const vorher = await letzterStand(z.db)
  if (vorher?.geprueft_am && Date.now() - Date.parse(vorher.geprueft_am) < ZWISCHENSPEICHER_MS) {
    return NextResponse.json({ status: vorher, live: true, frisch: false })
  }
  try {
    await runMetaZentral(z.db)
    const { data } = await z.db.from("meta_konto_status").select("stand").eq("konto_id", metaAdAccount()).maybeSingle()
    return NextResponse.json({ status: data?.stand ?? null, live: true, frisch: true })
  } catch (err) {
    return fehlerAntwort(err)
  }
}
