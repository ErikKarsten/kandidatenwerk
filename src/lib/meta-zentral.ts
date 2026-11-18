// Zentraler Meta-Abruf (Paket 108): alle 30 Minuten EINE Anfrage ans Werbekonto, die
// Kontostatus, Ausgabenlimit, Zahl der aktiven Anzeigen und die Zahlen pro Anzeige und
// Tag der letzten Tage zusammen liefert (Feld-Erweiterung der Graph API, geprüft
// 18.11.2026). Vorher fragten das Dashboard (bei jedem Aufruf) und das Meta-Analyse-Tool
// (jede Minute) getrennt - Fehler "User request limit reached".
//
// Ergebnis: meta_anzeigen_tag (Dashboard liest daraus) und meta_konto_status (rote
// Leiste und Meta-Analyse-Tool). Liest bei Meta nur.

import type { SupabaseClient } from "@supabase/supabase-js"
import { metaGraphFetch } from "@/lib/meta-ads-client"
import { ausCent, bewerte, tagIn, type KontoStand } from "@/lib/meta-konto-logik"

// Lead-Aktionen wie im Meta-Analyse-Tool: der größte Wert zählt ("lead" fasst die
// anderen normalerweise schon zusammen).
const LEAD_TYPEN = ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_conversion.fb_pixel_lead"]
const INSIGHT_FELDER = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,spend,impressions,reach,inline_link_clicks,actions,video_thruplay_watched_actions"
// Meta korrigiert Zahlen noch einige Tage nach - die letzten Tage werden immer neu geholt.
export const TAGE_ZURUECK = 3

interface InsightRow {
  ad_id: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  date_start: string
  spend?: string
  impressions?: string
  reach?: string
  inline_link_clicks?: string
  actions?: { action_type: string; value: string }[]
  video_thruplay_watched_actions?: { action_type: string; value: string }[]
}

interface Paged<T> {
  data: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

interface KontoAntwort {
  id: string
  name?: string
  currency?: string
  account_status?: number
  disable_reason?: number
  spend_cap?: string
  amount_spent?: string
  timezone_name?: string
  ads?: { summary?: { total_count?: number } }
  pro_anzeige?: Paged<InsightRow>
}

export function metaAdAccount(): string {
  const raw = (process.env.META_AD_ACCOUNT_ID ?? "").trim()
  if (!raw) throw new Error("META_AD_ACCOUNT_ID ist nicht gesetzt.")
  return raw.startsWith("act_") ? raw : `act_${raw}`
}

export function metaConfigured(): boolean {
  return Boolean(process.env.META_AD_ACCOUNT_ID && process.env.META_ACCESS_TOKEN)
}

function minusTage(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const zahl = (v: string | undefined) => Number(v ?? 0) || 0
const leadsAus = (actions: InsightRow["actions"]) =>
  Math.max(0, ...LEAD_TYPEN.map((t) => zahl(actions?.find((a) => a.action_type === t)?.value)))

export function toTagesZeile(r: InsightRow, jetzt: string) {
  return {
    anzeige_id: r.ad_id,
    datum: r.date_start,
    anzeige_name: r.ad_name ?? null,
    anzeigengruppe_id: r.adset_id ?? null,
    anzeigengruppe: r.adset_name ?? null,
    kampagne_id: r.campaign_id ?? null,
    kampagne: r.campaign_name ?? null,
    ausgaben: Math.round(zahl(r.spend) * 100) / 100,
    impressionen: zahl(r.impressions),
    reichweite: zahl(r.reach),
    link_klicks: zahl(r.inline_link_clicks),
    leads: leadsAus(r.actions),
    videoaufrufe_3s: zahl(r.actions?.find((a) => a.action_type === "video_view")?.value),
    thruplays: zahl(r.video_thruplay_watched_actions?.find((a) => a.action_type === "video_view")?.value),
    aktualisiert_am: jetzt,
  }
}

// Zahlen pro Anzeige und Tag für einen Zeitraum (Konto-Zeitzone), über alle Seiten.
// Für Nachträge und das einmalige Auffüllen (scripts/meta-anzeigen-auffuellen.ts).
export async function fetchAdDailyInsights(since: string, until: string): Promise<InsightRow[]> {
  const rows: InsightRow[] = []
  let after: string | undefined
  for (let page = 0; page < 50; page++) {
    const resp = await metaGraphFetch<Paged<InsightRow>>(`/${metaAdAccount()}/insights`, {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: INSIGHT_FELDER,
      limit: 500,
      ...(after ? { after } : {}),
    })
    rows.push(...resp.data)
    after = resp.paging?.next ? resp.paging.cursors?.after : undefined
    if (!after) break
  }
  return rows
}

export async function saveAdDailyRows(db: SupabaseClient, rows: InsightRow[]): Promise<number> {
  const jetzt = new Date().toISOString()
  const zeilen = rows.filter((r) => zahl(r.impressions) > 0 || zahl(r.spend) > 0).map((r) => toTagesZeile(r, jetzt))
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await db.from("meta_anzeigen_tag").upsert(zeilen.slice(i, i + 500), { onConflict: "anzeige_id,datum" })
    if (error) throw new Error(`meta_anzeigen_tag speichern: ${error.message}`)
  }
  return zeilen.length
}

export interface MetaZentralResult {
  konto: string
  tageszeilen: number
  anfragen: number
  impressionenHeute: number
  ausgabenHeute: number
  aktiveAnzeigen: number | null
  alarm: string | null
  hinweise: string[]
}

export async function runMetaZentral(db: SupabaseClient): Promise<MetaZentralResult> {
  const account = metaAdAccount()
  const geprueftAm = new Date().toISOString()
  // Konto-Zeitzone ist Europe/Berlin; Meta liefert date_start in Konto-Zeit.
  const heute = tagIn(geprueftAm, "Europe/Berlin")
  const seit = minusTage(heute, TAGE_ZURUECK - 1)
  const hinweise: string[] = []

  // Die eine Anfrage: Konto + aktive Anzeigen + Zahlen pro Anzeige und Tag.
  const fields = [
    "name,currency,account_status,disable_reason,spend_cap,amount_spent,timezone_name",
    'ads.effective_status(["ACTIVE"]).limit(1).summary(true){id}',
    `insights.level(ad).time_increment(1).time_range(${JSON.stringify({ since: seit, until: heute })}).limit(500).as(pro_anzeige){${INSIGHT_FELDER}}`,
  ].join(",")
  const k = await metaGraphFetch<KontoAntwort>(`/${account}`, { fields })
  let anfragen = 1

  const rows = [...(k.pro_anzeige?.data ?? [])]
  // Nur bei sehr vielen Anzeigen nötig: weitere Seiten einzeln nachladen.
  let after = k.pro_anzeige?.paging?.next ? k.pro_anzeige.paging.cursors?.after : undefined
  while (after && anfragen < 10) {
    const resp = await metaGraphFetch<Paged<InsightRow>>(`/${account}/insights`, {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since: seit, until: heute }),
      fields: INSIGHT_FELDER,
      limit: 500,
      after,
    })
    anfragen++
    rows.push(...resp.data)
    after = resp.paging?.next ? resp.paging.cursors?.after : undefined
  }
  const tageszeilen = await saveAdDailyRows(db, rows)

  const heuteRows = rows.filter((r) => r.date_start === heute)
  const limit = ausCent(k.spend_cap)
  const zeile: KontoStand = {
    konto_id: account,
    name: k.name ?? null,
    waehrung: k.currency ?? null,
    kontostatus: k.account_status ?? null,
    sperrgrund: k.disable_reason ?? null,
    ausgabenlimit: limit && limit > 0 ? limit : null, // 0 heißt bei Meta: kein Limit
    ausgegeben: ausCent(k.amount_spent),
    ausgaben_heute: Math.round(heuteRows.reduce((s, r) => s + zahl(r.spend), 0) * 100) / 100,
    impressionen_heute: heuteRows.reduce((s, r) => s + zahl(r.impressions), 0),
    aktive_anzeigen: k.ads?.summary?.total_count ?? null,
    zeitzone: k.timezone_name ?? null,
    geprueft_am: geprueftAm,
  }
  if (zeile.aktive_anzeigen == null) hinweise.push("Zahl der aktiven Anzeigen nicht geliefert.")

  const { data: vorherRow } = await db.from("meta_konto_status").select("stand").eq("konto_id", account).maybeSingle()
  const vorher = (vorherRow?.stand as KontoStand | undefined) ?? null
  const { alarm } = bewerte(zeile, vorher)
  // Benachrichtigungen aufs Gerät gibt es nicht (wie im Meta-Analyse-Tool seit 18.11.):
  // Der Alarm erscheint nur auf der Seite.
  zeile.alarm_gemeldet = null
  zeile.alarm_gemeldet_am = null
  const { error: speicherFehler } = await db.from("meta_konto_status").upsert({ konto_id: account, stand: zeile, geprueft_am: geprueftAm }, { onConflict: "konto_id" })
  if (speicherFehler) throw new Error(`meta_konto_status speichern: ${speicherFehler.message}`)

  return {
    konto: account,
    tageszeilen,
    anfragen,
    impressionenHeute: zeile.impressionen_heute,
    ausgabenHeute: zeile.ausgaben_heute,
    aktiveAnzeigen: zeile.aktive_anzeigen,
    alarm: alarm?.schluessel ?? null,
    hinweise,
  }
}
