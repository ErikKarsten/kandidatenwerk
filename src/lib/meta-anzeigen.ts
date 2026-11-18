// Täglicher Abruf für das Meta-Analyse-Tool (Paket 108): Texte, Einstellungen und Bilder
// der Anzeigen (wie scripts/meta-sync.mjs im Meta-Analyse-Tool) und die KI-Einschätzung
// von Bild, Text und Benefits für neue Anzeigen. Die Zahlen selbst holt der zentrale
// Abruf alle 30 Minuten (src/lib/meta-zentral.ts). Liest bei Meta nur.
//
// Meta-Anfragen pro Lauf: je 50 Anzeigen eine (Details samt großem Vorschaubild) -
// nur für Anzeigen mit Zahlen in den letzten Tagen oder ohne gespeicherte Details.

import type { SupabaseClient } from "@supabase/supabase-js"
import { metaGraphFetch } from "@/lib/meta-ads-client"
import { metaAdAccount } from "@/lib/meta-zentral"
import { generateText, KIE_IMAGE_MODEL, llmConfigured } from "@/lib/llm"
import { tagIn } from "@/lib/meta-konto-logik"
import type { Urteil } from "@/lib/meta-analyse"

export const MOTIVE_BUCKET = "meta-motive"
const DETAIL_TAGE = 3
const KI_PRO_LAUF = 8
const KI_MIN_AUSGABEN = 50

interface Creative {
  id?: string
  title?: string
  body?: string
  image_url?: string
  thumbnail_url?: string
  video_id?: string
  call_to_action_type?: string
  object_story_spec?: {
    link_data?: { message?: string; name?: string; picture?: string; child_attachments?: unknown[]; call_to_action?: { value?: { lead_gen_form_id?: string } } }
    video_data?: { message?: string; title?: string; call_to_action?: { value?: { lead_gen_form_id?: string } } }
  }
  asset_feed_spec?: {
    bodies?: { text?: string }[]
    titles?: { text?: string }[]
    videos?: unknown[]
    call_to_actions?: { value?: { lead_gen_form_id?: string } }[]
  }
}

interface Targeting {
  age_min?: number
  age_max?: number
  geo_locations?: {
    cities?: { name: string; radius?: number; distance_unit?: string }[]
    regions?: { name: string }[]
    zips?: { name?: string; key?: string }[]
    custom_locations?: { name?: string; address_string?: string; radius?: number; distance_unit?: string }[]
    countries?: string[]
  }
  custom_audiences?: { name: string }[]
  flexible_spec?: unknown[]
}

interface MetaAd {
  id: string
  name?: string
  effective_status?: string
  created_time?: string
  campaign?: { id: string; name: string }
  adset?: { id: string; name: string; daily_budget?: string; lifetime_budget?: string; targeting?: Targeting }
  creative?: Creative
}

const uniq = (arr: (string | null | undefined)[]) => [...new Set(arr.map((s) => (s ?? "").trim()).filter(Boolean))]
const stuecke = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

function texteAus(c: Creative | undefined) {
  const s = c?.object_story_spec ?? {}
  const feed = c?.asset_feed_spec ?? {}
  return {
    texte: uniq([c?.body, s.link_data?.message, s.video_data?.message, ...(feed.bodies ?? []).map((b) => b.text)]),
    ueberschriften: uniq([c?.title, s.link_data?.name, s.video_data?.title, ...(feed.titles ?? []).map((t) => t.text)]),
  }
}

function formatAus(c: Creative | undefined): string {
  const s = c?.object_story_spec ?? {}
  if ((s.link_data?.child_attachments ?? []).length) return "Karussell"
  if (c?.video_id || s.video_data || (c?.asset_feed_spec?.videos ?? []).length) return "Video"
  return "Bild"
}

function formularIdAus(c: Creative | undefined): string | null {
  const s = c?.object_story_spec ?? {}
  return (
    s.link_data?.call_to_action?.value?.lead_gen_form_id ??
    s.video_data?.call_to_action?.value?.lead_gen_form_id ??
    (c?.asset_feed_spec?.call_to_actions ?? []).map((x) => x?.value?.lead_gen_form_id).find(Boolean) ??
    null
  )
}

function zielgruppeAus(t: Targeting | undefined): string | null {
  if (!t) return null
  const teile: string[] = []
  if (t.age_min || t.age_max) teile.push(`Alter ${t.age_min ?? "?"}–${t.age_max ?? "?"}`)
  const g = t.geo_locations ?? {}
  const einheit = (x: { distance_unit?: string }) => (x.distance_unit === "kilometer" ? "km" : "mi")
  const orte = [
    ...(g.cities ?? []).map((c) => `${c.name}${c.radius ? ` +${c.radius}${einheit(c)}` : ""}`),
    ...(g.regions ?? []).map((r) => r.name),
    ...(g.zips ?? []).map((z) => z.name ?? z.key ?? ""),
    ...(g.custom_locations ?? []).map((c) => c.name ?? c.address_string ?? `Punkt +${c.radius}${einheit(c)}`),
    ...(g.countries ?? []),
  ].filter(Boolean)
  if (orte.length) teile.push(`Orte: ${orte.join(", ")}`)
  if ((t.custom_audiences ?? []).length) teile.push(`Eigene Zielgruppen: ${t.custom_audiences!.map((a) => a.name).join(", ")}`)
  if ((t.flexible_spec ?? []).length) teile.push("Interessen/Merkmale eingestellt")
  return teile.join(" | ") || null
}

function budgetAus(adset: MetaAd["adset"]): string {
  if (adset?.daily_budget) return `${Number(adset.daily_budget) / 100} €/Tag`
  if (adset?.lifetime_budget) return `${Number(adset.lifetime_budget) / 100} € gesamt`
  return "Kampagnenbudget"
}

const STATUS_ALLE = [
  "ACTIVE", "PAUSED", "DELETED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED", "ARCHIVED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES",
]
const AD_FELDER = [
  "name,effective_status,created_time",
  "campaign{id,name}",
  "adset{id,name,daily_budget,lifetime_budget,targeting}",
  // Großes Vorschaubild gleich mit (Feld-Erweiterung) - spart eine eigene Bilder-Anfrage.
  "creative.thumbnail_width(1080).thumbnail_height(1080){id,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_story_spec,asset_feed_spec}",
].join(",")

// Bis zu 50 Anzeigen pro Anfrage über das Werbekonto (der Sammelabruf ?ids= ist seit
// Graph API v26 abgeschafft; das Meta-Analyse-Tool fiel dann auf eine Anfrage je Anzeige
// zurück).
async function holeAnzeigen(account: string, ids: string[]): Promise<{ map: Record<string, MetaAd>; anfragen: number }> {
  const map: Record<string, MetaAd> = {}
  let anfragen = 0
  for (const teil of stuecke(ids, 50)) {
    let after: string | undefined
    do {
      anfragen++
      const resp = await metaGraphFetch<{ data: MetaAd[]; paging?: { cursors?: { after?: string }; next?: string } }>(`/${account}/ads`, {
        fields: AD_FELDER,
        filtering: JSON.stringify([
          { field: "ad.id", operator: "IN", value: teil },
          { field: "ad.effective_status", operator: "IN", value: STATUS_ALLE },
        ]),
        limit: 50,
        ...(after ? { after } : {}),
      })
      for (const ad of resp.data) map[ad.id] = ad
      after = resp.paging?.next ? resp.paging.cursors?.after : undefined
    } while (after)
  }
  return { map, anfragen }
}

export interface MetaAnzeigenResult {
  anzeigen: number
  neueBilder: number
  einschaetzungen: number
  anfragen: number
  hinweise: string[]
}

export async function syncMetaAnzeigen(db: SupabaseClient, options: { alle?: boolean; ki?: boolean } = {}): Promise<MetaAnzeigenResult> {
  const hinweise: string[] = []
  const heute = tagIn(new Date().toISOString(), "Europe/Berlin")
  const ab = new Date(`${heute}T12:00:00Z`)
  ab.setUTCDate(ab.getUTCDate() - (DETAIL_TAGE - 1))

  // Anzeigen mit Zahlen in den letzten Tagen (Status/Budget können sich ändern) plus alle
  // Anzeigen mit Zahlen, aber noch ohne Details (z.B. nach dem Auffüllen).
  const mitZahlen = new Set<string>()
  const juengst = new Set<string>()
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.from("meta_anzeigen_tag").select("anzeige_id, datum").order("anzeige_id").order("datum").range(von, von + 999)
    if (error) throw new Error(`meta_anzeigen_tag lesen: ${error.message}`)
    for (const r of (data ?? []) as { anzeige_id: string; datum: string }[]) {
      mitZahlen.add(r.anzeige_id)
      if (r.datum >= ab.toISOString().slice(0, 10)) juengst.add(r.anzeige_id)
    }
    if (!data || data.length < 1000) break
  }
  const vorhanden = new Map<string, string | null>()
  for (const teil of stuecke([...mitZahlen], 200)) {
    const { data, error } = await db.from("meta_anzeigen").select("id, bild_pfad").in("id", teil)
    if (error) throw new Error(`meta_anzeigen lesen: ${error.message}`)
    for (const r of (data ?? []) as { id: string; bild_pfad: string | null }[]) vorhanden.set(r.id, r.bild_pfad)
  }
  const ids = [...mitZahlen].filter((id) => options.alle || juengst.has(id) || !vorhanden.has(id))

  const { map: ads, anfragen } = await holeAnzeigen(metaAdAccount(), ids)

  // Bilder nur für Anzeigen ohne gespeichertes Bild.
  const ohneBild = ids.filter((id) => ads[id] && !vorhanden.get(id))
  let neueBilder = 0
  const bildPfade = new Map<string, string>()
  for (const id of ohneBild) {
    const c = ads[id].creative ?? {}
    const quelle = c.image_url || c.object_story_spec?.link_data?.picture || c.thumbnail_url
    if (!quelle) continue
    try {
      const r = await fetch(quelle, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) continue
      const typ = r.headers.get("content-type") || "image/jpeg"
      const endung = typ.includes("png") ? "png" : typ.includes("webp") ? "webp" : "jpg"
      const pfad = `${id}.${endung}`
      const { error } = await db.storage.from(MOTIVE_BUCKET).upload(pfad, await r.arrayBuffer(), { contentType: typ, upsert: true })
      if (error) {
        hinweise.push(`Bild ${id}: ${error.message}`)
        continue
      }
      bildPfade.set(id, pfad)
      neueBilder++
    } catch (err) {
      hinweise.push(`Bild ${id} nicht geladen: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const jetzt = new Date().toISOString()
  const zeilen = ids
    .filter((id) => ads[id]?.name)
    .map((id) => {
      const ad = ads[id]
      const t = texteAus(ad.creative)
      return {
        id,
        name: ad.name!,
        kampagne_id: ad.campaign?.id ?? null,
        kampagne: ad.campaign?.name ?? null,
        anzeigengruppe_id: ad.adset?.id ?? null,
        anzeigengruppe: ad.adset?.name ?? null,
        status: ad.effective_status ?? null,
        erstellt_am: ad.created_time ?? null,
        format: formatAus(ad.creative),
        ueberschriften: t.ueberschriften,
        texte: t.texte,
        button: ad.creative?.call_to_action_type ?? null,
        lead_formular_id: formularIdAus(ad.creative),
        zielgruppe: zielgruppeAus(ad.adset?.targeting),
        budget: budgetAus(ad.adset),
        bild_pfad: vorhanden.get(id) || bildPfade.get(id) || null,
        aktualisiert_am: jetzt,
      }
    })
  for (const teil of stuecke(zeilen, 200)) {
    // motiv_typ bleibt unberührt (von Hand gesetzt bzw. aus dem Testlauf übernommen).
    const { error } = await db.from("meta_anzeigen").upsert(teil, { onConflict: "id" })
    if (error) throw new Error(`meta_anzeigen speichern: ${error.message}`)
  }

  const einschaetzungen = options.ki === false ? 0 : await neueEinschaetzungen(db, hinweise)
  return { anzeigen: zeilen.length, neueBilder, einschaetzungen, anfragen, hinweise }
}

// --- KI-Einschätzung von Bild, Text und Benefits ---

const URTEILE: Urteil[] = ["stark", "mittel", "schwach", "unklar"]

const SYSTEM = `Du bewertest Facebook-/Instagram-Anzeigen, mit denen Kanzleistelle24 und Steuerkanzleien Mitarbeiter suchen (Steuerfachangestellte, Steuerfachwirte, Bilanzbuchhalter usw.). Ziel jeder Anzeige: möglichst viele passende Bewerbungen über das Lead-Formular.
Beurteile drei Dinge, jeweils mit "stark", "mittel", "schwach" oder "unklar" und genau einem kurzen, konkreten Satz in einfachem Deutsch:
- bild: Fällt das Motiv im Feed auf, passt es zur Zielgruppe, zeigt es Menschen, eine Kanzlei oder einen Ort?
- text: Überschrift und Anzeigentext - spricht er die Zielgruppe direkt an, passt er zur Region der Kampagne, gibt es einen klaren nächsten Schritt?
- benefits: Werden konkrete Vorteile genannt (Gehalt, Homeoffice, Arbeitszeit, Ort) oder nur allgemeine?
Dazu ein fazit: ein Satz, warum die Anzeige vermutlich so läuft, wie sie läuft.
Bei Videos siehst du nur das Vorschaubild - sag das beim Bild und urteile dort "unklar", wenn das Vorschaubild nichts hergibt.
Antworte NUR mit JSON: {"bild_urteil":"…","bild":"…","text_urteil":"…","text":"…","benefits_urteil":"…","benefits":"…","fazit":"…"}`

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function parseEinschaetzung(text: string) {
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, string>
  const urteil = (v: string | undefined): Urteil => (URTEILE.includes(v as Urteil) ? (v as Urteil) : "unklar")
  const satz = (v: string | undefined) => (typeof v === "string" ? v.trim().slice(0, 400) : null)
  return {
    bild_urteil: urteil(json.bild_urteil),
    bild: satz(json.bild),
    text_urteil: urteil(json.text_urteil),
    text: satz(json.text),
    benefits_urteil: urteil(json.benefits_urteil),
    benefits: satz(json.benefits),
    fazit: satz(json.fazit),
  }
}

async function neueEinschaetzungen(db: SupabaseClient, hinweise: string[]): Promise<number> {
  if (!llmConfigured()) return 0
  // Kandidaten: Anzeigen mit Bild und mindestens 50 € Ausgaben, noch ohne Einschätzung.
  const { data: summen } = await db.rpc("meta_anzeigen_summen", { von: "2000-01-01", bis: "2999-12-31" })
  const ausgaben = new Map(((summen ?? []) as { anzeige_id: string; ausgaben: number | string }[]).map((r) => [r.anzeige_id, Number(r.ausgaben) || 0]))
  const { data: alle } = await db.from("meta_anzeigen").select("id, name, kampagne, format, ueberschriften, texte, bild_pfad").not("bild_pfad", "is", null)
  const { data: fertig } = await db.from("meta_einschaetzungen").select("anzeige_id")
  const erledigt = new Set(((fertig ?? []) as { anzeige_id: string }[]).map((r) => r.anzeige_id))
  const offen = ((alle ?? []) as { id: string; name: string; kampagne: string | null; format: string | null; ueberschriften: string[]; texte: string[]; bild_pfad: string }[])
    .filter((a) => !erledigt.has(a.id) && (ausgaben.get(a.id) ?? 0) >= KI_MIN_AUSGABEN)
    .sort((a, b) => (ausgaben.get(b.id) ?? 0) - (ausgaben.get(a.id) ?? 0))
    .slice(0, KI_PRO_LAUF)

  let n = 0
  for (const a of offen) {
    try {
      const { data: blob } = await db.storage.from(MOTIVE_BUCKET).download(a.bild_pfad)
      const bild = blob && blob.size < 4_500_000 ? { mediaType: blob.type || "image/jpeg", base64: base64(await blob.arrayBuffer()) } : null
      const prompt = [
        `Anzeige: ${a.name}`,
        `Kampagne: ${a.kampagne ?? "-"}`,
        `Format: ${a.format ?? "Bild"}${a.format === "Video" ? " (nur Vorschaubild sichtbar)" : ""}`,
        `Überschriften:\n${a.ueberschriften.join("\n---\n") || "-"}`,
        `Anzeigentexte:\n${a.texte.join("\n---\n") || "-"}`,
        bild ? "Das Motiv ist als Bild beigefügt." : "Kein Bild verfügbar - Bild mit \"unklar\" bewerten.",
      ].join("\n\n")
      const antwort = await generateText({ tier: "smart", system: SYSTEM, prompt, images: bild ? [bild] : undefined, maxTokens: 800, timeoutMs: 90_000 })
      const e = parseEinschaetzung(antwort)
      const { error } = await db.from("meta_einschaetzungen").upsert({ anzeige_id: a.id, ...e, modell: bild && process.env.KIE_API_KEY ? `kie.ai ${KIE_IMAGE_MODEL}` : "kie.ai claude-sonnet-5-5" }, { onConflict: "anzeige_id" })
      if (error) throw new Error(error.message)
      n++
    } catch (err) {
      hinweise.push(`Einschätzung ${a.id}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`)
    }
  }
  return n
}
