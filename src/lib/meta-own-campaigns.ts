// Eigene Meta-Kampagnen von Kanzleien (Paket 80): Kampagnen im Werbekonto, deren Name NICHT
// mit "KS24" beginnt, laufen für eine bestimmte Kanzlei. Ihr Lead-Formular lässt sich in
// der Kanzlei-Kampagne unter "Einrichtung" verknüpfen - die Leads landen dann über den
// Meta-Leads-Sync (alle 30 Minuten) und den Webhook direkt in dieser Kampagne.
// Nur lesend; nur Server.
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchFormDirectory, metaGraphFetch } from "@/lib/meta-ads-client"
import { extractLeadFormId, isKs24Campaign, LEAD_OBJECTIVES } from "@/lib/meta-campaigns-parse"

export interface OwnMetaForm {
  formId: string
  // Ohne Zugriff (Seite dem Systemnutzer nicht freigegeben) kennen wir Name und Status nicht.
  formName: string | null
  formStatus: string | null
  pageName: string | null
  accessible: boolean
  // Schon mit einer Kampagne in Kandidatenwerk verknüpft?
  linkedTo: { id: string; title: string } | null
}

export interface OwnMetaCampaign {
  id: string
  name: string
  forms: OwnMetaForm[]
}

interface Paged<T> {
  data: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

async function fetchAll<T>(path: string, params: Record<string, string>, pageSize: number): Promise<T[]> {
  const out: T[] = []
  let after: string | undefined
  for (let page = 0; page < 50; page++) {
    const resp = await metaGraphFetch<Paged<T>>(path, { ...params, limit: String(pageSize), ...(after ? { after } : {}) })
    out.push(...(resp.data ?? []))
    after = resp.paging?.cursors?.after
    if (!resp.paging?.next || !after) break
  }
  return out
}

export async function listOwnMetaCampaigns(db: SupabaseClient): Promise<OwnMetaCampaign[]> {
  const adAccountId = process.env.META_AD_ACCOUNT_ID
  if (!adAccountId) throw new Error("META_AD_ACCOUNT_ID ist nicht gesetzt.")
  const act = `/act_${adAccountId.replace(/^act_/, "")}`

  const campaigns = await fetchAll<{ id: string; name: string; objective?: string }>(
    `${act}/campaigns`,
    { fields: "id,name,objective", effective_status: JSON.stringify(["ACTIVE"]) },
    200
  )
  const own = campaigns.filter((c) => (!c.objective || LEAD_OBJECTIVES.has(c.objective)) && !isKs24Campaign(c.name))
  if (own.length === 0) return []

  // Formulare aus den Anzeigen der Kampagnen (aktive Anzeigen zuerst).
  const ads: { campaign_id: string; effective_status?: string; creative?: unknown }[] = []
  for (let i = 0; i < own.length; i += 50) {
    ads.push(
      ...(await fetchAll<{ campaign_id: string; effective_status?: string; creative?: unknown }>(
        `${act}/ads`,
        {
          fields:
            "campaign_id,effective_status,creative{object_story_spec{link_data{call_to_action},video_data{call_to_action}},asset_feed_spec{call_to_actions}}",
          filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: own.slice(i, i + 50).map((c) => c.id) }]),
        },
        25
      ))
    )
  }
  ads.sort((a, b) => Number(b.effective_status === "ACTIVE") - Number(a.effective_status === "ACTIVE"))
  const formIdsByCampaign = new Map<string, string[]>()
  for (const ad of ads) {
    const formId = extractLeadFormId(ad.creative)
    if (!formId) continue
    const list = formIdsByCampaign.get(ad.campaign_id) ?? []
    if (!list.includes(formId)) list.push(formId)
    formIdsByCampaign.set(ad.campaign_id, list)
  }

  const allFormIds = [...new Set([...formIdsByCampaign.values()].flat())]
  const [directory, { data: linkedRows }] = await Promise.all([
    fetchFormDirectory(),
    allFormIds.length
      ? db.from("campaigns").select("id, title, meta_form_id").in("meta_form_id", allFormIds)
      : Promise.resolve({ data: [] as { id: string; title: string; meta_form_id: string }[] }),
  ])
  const linkedByForm = new Map((linkedRows ?? []).map((r) => [r.meta_form_id as string, { id: r.id as string, title: r.title as string }]))

  return own
    .map((c) => ({
      id: c.id,
      name: c.name,
      forms: (formIdsByCampaign.get(c.id) ?? []).map((formId): OwnMetaForm => {
        const info = directory.get(formId)
        return {
          formId,
          formName: info?.name ?? null,
          formStatus: info?.status ?? null,
          pageName: info?.pageName ?? null,
          accessible: !!info,
          linkedTo: linkedByForm.get(formId) ?? null,
        }
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
}
