// Daten für das Meta-Analyse-Tool (Paket 108, public/meta-analyse-tool/app.js).
// Liefert in einer Antwort, was die Webseite des Tools vorher einzeln aus der Supabase-
// Datenbank des Tools las - in derselben Form, damit die Seite unverändert rechnen kann:
//   anzeigen      wie die Ansicht "anzeigen_ansicht" (mit art, region, typ)
//   zahlen        wie "zahlen_tag" im Zeitraum, zahlenVorher im Zeitraum davor
//   einsch        wie "einschaetzungen"
//   bilder        Pfad -> signierter Link (1 Stunde)
//   qualifizierung wie "_kandidatenwerk/qualifizierung.json" (jetzt direkt aus Kandidatenwerk)
// Keine Meta-Anfrage.
import type { SupabaseClient } from "@supabase/supabase-js"
import { artAus, regionAus, typAus } from "@/lib/meta-analyse"
import { MOTIVE_BUCKET } from "@/lib/meta-anzeigen"
import { tagIn } from "@/lib/meta-konto-logik"

const SEITE = 1000

function plusTage(tag: string, n: number): string {
  const d = new Date(`${tag}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function alleZeilen<T>(abfrage: (von: number, bis: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const zeilen: T[] = []
  for (let ab = 0; ; ab += SEITE) {
    const { data, error } = await abfrage(ab, ab + SEITE - 1)
    if (error) throw new Error(error.message)
    zeilen.push(...((data ?? []) as T[]))
    if (!data || data.length < SEITE) break
  }
  return zeilen
}

const stuecke = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

interface TagZeile {
  anzeige_id: string
  datum: string
  anzeige_name?: string | null
  anzeigengruppe_id?: string | null
  anzeigengruppe?: string | null
  kampagne_id?: string | null
  kampagne?: string | null
  ausgaben: number | string
  leads: number | string
}

export async function metaAnalyseDaten(db: SupabaseClient, tage: number) {
  const [{ data: letzte }, { data: erste }, { data: konto }] = await Promise.all([
    db.from("meta_anzeigen_tag").select("datum").order("datum", { ascending: false }).limit(1).maybeSingle(),
    db.from("meta_anzeigen_tag").select("datum").order("datum", { ascending: true }).limit(1).maybeSingle(),
    db.from("meta_konto_status").select("geprueft_am").order("geprueft_am", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!letzte) return { leer: true }
  const bis = String(letzte.datum).slice(0, 10)
  const von = plusTage(bis, -(tage - 1))
  const vorVon = plusTage(von, -tage)
  const vorBis = plusTage(von, -1)
  const vorherMoeglich = Boolean(erste && String(erste.datum).slice(0, 10) <= vorVon)

  const felder = "anzeige_id,datum,anzeige_name,anzeigengruppe_id,anzeigengruppe,kampagne_id,kampagne,ausgaben,impressionen,link_klicks,leads,videoaufrufe_3s,thruplays"
  const [zahlenRoh, vorherRoh] = await Promise.all([
    alleZeilen<TagZeile>((a, b) => db.from("meta_anzeigen_tag").select(felder).gte("datum", von).lte("datum", bis).order("anzeige_id").order("datum").range(a, b)),
    vorherMoeglich
      ? alleZeilen<TagZeile>((a, b) =>
          db.from("meta_anzeigen_tag").select("anzeige_id,datum,anzeige_name,kampagne_id,kampagne,ausgaben,leads").gte("datum", vorVon).lte("datum", vorBis).order("anzeige_id").order("datum").range(a, b)
        )
      : Promise.resolve(null),
  ])

  // Namen aus den Tageszahlen - falls Texte/Bilder einer neuen Anzeige noch fehlen
  // (die holt Kandidatenwerk einmal am Tag), zählt sie trotzdem mit.
  const ausZahlen = new Map<string, TagZeile>()
  for (const z of [...(vorherRoh ?? []), ...zahlenRoh]) ausZahlen.set(z.anzeige_id, z)
  const ids = [...ausZahlen.keys()]

  const details = new Map<string, Record<string, unknown>>()
  const einsch: Record<string, unknown>[] = []
  for (const teil of stuecke(ids, 200)) {
    const [{ data: d, error: e1 }, { data: e, error: e2 }] = await Promise.all([
      db.from("meta_anzeigen").select("*").in("id", teil),
      db.from("meta_einschaetzungen").select("*").in("anzeige_id", teil),
    ])
    if (e1 || e2) throw new Error((e1 ?? e2)!.message)
    for (const r of (d ?? []) as Record<string, unknown>[]) details.set(r.id as string, r)
    einsch.push(...((e ?? []) as Record<string, unknown>[]))
  }

  const anzeigen = ids.map((id) => {
    const z = ausZahlen.get(id)!
    const d = details.get(id)
    const name = (d?.name as string | undefined) ?? z.anzeige_name ?? id
    const kampagne = (d?.kampagne as string | undefined) ?? z.kampagne ?? ""
    return {
      id,
      name,
      kampagne_id: (d?.kampagne_id as string | undefined) ?? z.kampagne_id ?? null,
      kampagne,
      anzeigengruppe_id: (d?.anzeigengruppe_id as string | undefined) ?? z.anzeigengruppe_id ?? null,
      anzeigengruppe: (d?.anzeigengruppe as string | undefined) ?? z.anzeigengruppe ?? null,
      status: d?.status ?? null,
      erstellt_am: d?.erstellt_am ?? null,
      format: d?.format ?? null,
      ueberschriften: d?.ueberschriften ?? [],
      texte: d?.texte ?? [],
      button: d?.button ?? null,
      lead_formular_id: d?.lead_formular_id ?? null,
      zielgruppe: d?.zielgruppe ?? null,
      budget: d?.budget ?? null,
      bild_pfad: d?.bild_pfad ?? null,
      motiv_typ: d?.motiv_typ ?? null,
      aktualisiert_am: d?.aktualisiert_am ?? null,
      art: artAus(kampagne),
      region: regionAus(kampagne),
      typ: typAus(name, kampagne, d?.motiv_typ as string | null | undefined),
    }
  })

  const bilder: Record<string, string> = {}
  const imZeitraum = new Set(zahlenRoh.map((z) => z.anzeige_id))
  const pfade = [...new Set(anzeigen.filter((a) => imZeitraum.has(a.id)).map((a) => a.bild_pfad as string | null).filter((p): p is string => !!p))]
  for (const teil of stuecke(pfade, 500)) {
    const { data } = await db.storage.from(MOTIVE_BUCKET).createSignedUrls(teil, 3600)
    for (const b of data ?? []) if (b.path && b.signedUrl) bilder[b.path] = b.signedUrl
  }

  const zahlen = zahlenRoh.map((z) => {
    const r = z as TagZeile & Record<string, unknown>
    return { anzeige_id: r.anzeige_id, datum: r.datum, ausgaben: r.ausgaben, impressionen: r.impressionen, link_klicks: r.link_klicks, leads: r.leads, videoaufrufe_3s: r.videoaufrufe_3s, thruplays: r.thruplays }
  })
  const zahlenVorher = vorherRoh?.map((z) => ({ anzeige_id: z.anzeige_id, datum: z.datum, ausgaben: z.ausgaben, leads: z.leads })) ?? null

  return {
    von,
    bis,
    anzeigen,
    zahlen,
    zahlenVorher,
    einsch,
    bilder,
    abgerufen: (konto?.geprueft_am as string | undefined) ?? null,
    qualifizierung: await qualifizierung(db, von, bis),
  }
}

// Wie scripts/kandidatenwerk-sync.mjs im Meta-Analyse-Tool: Meta-Leads je Meta-Kampagne
// und Tag nach Status - nur Zahlen, für den Zeitraum der Seite.
async function qualifizierung(db: SupabaseClient, von: string, bis: string) {
  const { data: kampagnen, error } = await db.from("campaigns").select("id, title, meta_campaign_id").not("meta_campaign_id", "is", null)
  if (error) throw new Error(error.message)
  const metaVon = new Map(((kampagnen ?? []) as { id: string; title: string | null; meta_campaign_id: string }[]).map((k) => [k.id, { meta: String(k.meta_campaign_id), titel: k.title }]))
  const ergebnis: Record<string, { titel: string | null; tage: Record<string, Record<string, number>> }> = {}
  // Einen Tag Puffer wegen der Zeitzone; gezählt wird nach Berliner Tag.
  const seit = `${plusTage(von, -1)}T00:00:00Z`
  for (const ids of stuecke([...metaVon.keys()], 80)) {
    const rows = await alleZeilen<{ campaign_id: string; status: string | null; created_at: string }>((a, b) =>
      db
        .from("candidates")
        .select("campaign_id, status, created_at")
        .in("campaign_id", ids)
        .not("meta_lead_id", "is", null)
        .eq("is_demo", false)
        .gte("created_at", seit)
        .order("created_at")
        .order("id")
        .range(a, b)
    )
    for (const c of rows) {
      const k = metaVon.get(c.campaign_id)
      if (!k) continue
      const tag = tagIn(c.created_at, "Europe/Berlin")
      if (tag < von || tag > bis) continue
      const eintrag = (ergebnis[k.meta] ??= { titel: k.titel, tage: {} })
      const zaehler = (eintrag.tage[tag] ??= {})
      const status = c.status || "unbekannt"
      zaehler[status] = (zaehler[status] ?? 0) + 1
    }
  }
  return { stand: new Date().toISOString(), kampagnen: ergebnis }
}
