// Daten für das Meta-Analyse-Tool (Paket 108): Summen je Anzeige im Zeitraum aus
// meta_anzeigen_tag, dazu Texte/Bilder/Motiv aus meta_anzeigen und die KI-Einschätzung.
// Keine Meta-Anfrage - alles kommt aus der Datenbank.
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { artAus, kennzahlen, regionAus, statusText, typAus, type AnzeigeAuswertung, type Einschaetzung } from "@/lib/meta-analyse"
import { MOTIVE_BUCKET } from "@/lib/meta-anzeigen"
import type { DateRange } from "@/lib/dashboard-stats"

interface SummenRow {
  anzeige_id: string
  anzeige_name: string | null
  kampagne_id: string | null
  kampagne: string | null
  ausgaben: number | string
  impressionen: number | string
  klicks: number | string
  leads: number | string
  videoaufrufe_3s: number | string
  thruplays: number | string
}

interface AnzeigeRow {
  id: string
  name: string
  kampagne: string | null
  status: string | null
  format: string | null
  ueberschriften: string[]
  texte: string[]
  zielgruppe: string | null
  budget: string | null
  bild_pfad: string | null
  motiv_typ: string | null
}

export interface MetaAnalyseDaten {
  anzeigen: AnzeigeAuswertung[]
  stand: string | null
  datenAb: string | null
  metaKampagnenIds: string[]
}

const zahl = (v: number | string | null | undefined) => Number(v ?? 0) || 0

async function inStuecken<T>(ids: string[], n: number, fn: (teil: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += n) out.push(...(await fn(ids.slice(i, i + n))))
  return out
}

export async function loadMetaAnalyse(range: DateRange): Promise<MetaAnalyseDaten> {
  const db = createSupabaseAdminClient() as unknown as SupabaseClient
  const [summen, erster, status] = await Promise.all([
    db.rpc("meta_anzeigen_summen", { von: range.from, bis: range.to }),
    db.from("meta_anzeigen_tag").select("datum").order("datum", { ascending: true }).limit(1).maybeSingle(),
    db.from("meta_konto_status").select("geprueft_am").order("geprueft_am", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (summen.error) throw new Error(summen.error.message)
  const rows = ((summen.data ?? []) as SummenRow[]).filter((r) => zahl(r.ausgaben) > 0 || zahl(r.impressionen) > 0)
  const ids = rows.map((r) => r.anzeige_id)

  const [details, einsch] = await Promise.all([
    inStuecken(ids, 200, async (teil) => {
      const { data } = await db
        .from("meta_anzeigen")
        .select("id, name, kampagne, status, format, ueberschriften, texte, zielgruppe, budget, bild_pfad, motiv_typ")
        .in("id", teil)
      return (data ?? []) as AnzeigeRow[]
    }),
    inStuecken(ids, 200, async (teil) => {
      const { data } = await db
        .from("meta_einschaetzungen")
        .select("anzeige_id, bild_urteil, bild, text_urteil, text, benefits_urteil, benefits, fazit")
        .in("anzeige_id", teil)
      return (data ?? []) as (Einschaetzung & { anzeige_id: string })[]
    }),
  ])
  const detailMap = new Map(details.map((d) => [d.id, d]))
  const einschMap = new Map(einsch.map((e) => [e.anzeige_id, e]))

  // Vorschaubilder: signierte Links (1 Stunde) in einem Aufruf.
  const pfade = details.map((d) => d.bild_pfad).filter((p): p is string => !!p)
  const urls = new Map<string, string>()
  for (let i = 0; i < pfade.length; i += 500) {
    const { data } = await db.storage.from(MOTIVE_BUCKET).createSignedUrls(pfade.slice(i, i + 500), 3600)
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }

  const anzeigen: AnzeigeAuswertung[] = rows.map((r) => {
    const d = detailMap.get(r.anzeige_id)
    const kampagne = d?.kampagne ?? r.kampagne ?? ""
    const name = d?.name ?? r.anzeige_name ?? r.anzeige_id
    const z = { ausgaben: zahl(r.ausgaben), impressionen: zahl(r.impressionen), klicks: zahl(r.klicks), leads: zahl(r.leads) }
    const e = einschMap.get(r.anzeige_id)
    return {
      id: r.anzeige_id,
      anzeige: name,
      kampagne,
      kampagne_id: r.kampagne_id,
      art: artAus(kampagne),
      typ: typAus(name, kampagne, d?.motiv_typ),
      region: regionAus(kampagne),
      format: d?.format ?? null,
      status: statusText(d?.status),
      ueberschriften: d?.ueberschriften ?? [],
      texte: d?.texte ?? [],
      zielgruppe: d?.zielgruppe ?? null,
      budget: d?.budget ?? null,
      ...z,
      videoaufrufe_3s: zahl(r.videoaufrufe_3s),
      thruplays: zahl(r.thruplays),
      ...kennzahlen(z),
      bildUrl: d?.bild_pfad ? (urls.get(d.bild_pfad) ?? null) : null,
      einschaetzung: e
        ? { bild_urteil: e.bild_urteil, bild: e.bild, text_urteil: e.text_urteil, text: e.text, benefits_urteil: e.benefits_urteil, benefits: e.benefits, fazit: e.fazit }
        : null,
    }
  })

  return {
    anzeigen,
    stand: (status.data?.geprueft_am as string | undefined) ?? null,
    datenAb: (erster.data?.datum as string | undefined) ?? null,
    metaKampagnenIds: [...new Set(rows.map((r) => r.kampagne_id).filter((k): k is string => !!k))],
  }
}
