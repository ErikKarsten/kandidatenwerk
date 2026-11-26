// „Alle Leadeingänge im Portal“ (Paket 117): Einzelne Kanzleien (altes Produkt, z. B. STB
// Rendsburg) sehen im Kundenportal jeden Lead ihrer eigenen Kampagnen, nicht erst die
// vorqualifizierten. Schalter je Kunde: clients.portal_alle_leads.
//
// Umsetzung über die normale Zuordnung (client_assignments), damit die Kanzlei die Leads in
// ihrer Kandidatenliste hat und den Status setzen kann:
// - alleLeadsZuordnen ordnet alle noch nicht zugeordneten Leads still zu (alle 5 Minuten im
//   Automations-Job und sofort beim Einschalten) - ohne Mail.
// - Die Automatisierung „Kandidat zugeordnet“ (Mail an die Kanzlei) feuert erst, wenn der
//   Lead vorqualifiziert ist (run-automations.ts); beim Vorqualifizieren wird der Zeitpunkt
//   der Zuordnung auf jetzt gesetzt (own-campaign-leads.ts), damit Verzögerungen ab dann zählen.
// - Im Portal steht neben dem Status der Kanzlei unser Stand (standBeiUns).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { ASSIGNABLE_STATUS, isSampleCandidate } from "@/lib/client-assignment"
import { LIVE_PHASE } from "@/lib/client-project"

type Db = SupabaseClient<Database>

export const ALLE_LEADS_HINWEIS = "Im Kundenportal sichtbar: Die Kanzlei sieht alle Leadeingänge (auch nicht vorqualifizierte)."

// Unser Bearbeitungsstand in Worten für die Kanzlei.
export function standBeiUns(status: string | null | undefined): { label: string; bg: string; text: string } {
  switch (status) {
    case ASSIGNABLE_STATUS:
      return { label: "Von uns vorqualifiziert", bg: "#16a34a1f", text: "#15803d" }
    case "abgelehnt":
      return { label: "Von uns als nicht geeignet eingestuft", bg: "#9ca3af18", text: "#6b7280" }
    case "nicht_auf_suche":
      return { label: "Derzeit nicht auf Suche", bg: "#8b5cf618", text: "#6d28d9" }
    case "nicht_erreicht_mail":
      return { label: "Für uns nicht erreichbar", bg: "#f9731618", text: "#c2410c" }
    default:
      return { label: "Bei uns in Bearbeitung", bg: "#2563eb18", text: "#1d4ed8" }
  }
}

// Ordnet alle Leads der eigenen Kampagnen freigeschalteter Kanzleien zu, die noch nicht
// zugeordnet sind. clientId: nur diese Kanzlei (beim Einschalten).
export async function alleLeadsZuordnen(db: Db, clientId?: string): Promise<{ zugeordnet: number }> {
  let kundenQuery = db.from("clients").select("id").eq("portal_alle_leads", true).eq("project_phase", LIVE_PHASE)
  if (clientId) kundenQuery = kundenQuery.eq("id", clientId)
  const { data: kunden, error: kundenFehler } = await kundenQuery
  if (kundenFehler) throw new Error(kundenFehler.message)
  let zugeordnet = 0
  for (const kunde of kunden ?? []) {
    const { data: kampagnen } = await db.from("campaigns").select("id").eq("client_id", kunde.id).eq("kind", "kanzlei").eq("is_demo", false)
    const kampagnenIds = (kampagnen ?? []).map((k) => k.id)
    if (!kampagnenIds.length) continue
    const leads: { id: string; campaign_id: string | null; tags: string[] | null }[] = []
    for (let von = 0; ; von += 1000) {
      const { data, error } = await db.from("candidates").select("id, campaign_id, tags").in("campaign_id", kampagnenIds).eq("is_demo", false).order("id").range(von, von + 999)
      if (error) throw new Error(error.message)
      leads.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const { data: aktiv } = await db.from("client_assignments").select("candidate_id").eq("client_id", kunde.id).is("removed_at", null)
    const schonDa = new Set((aktiv ?? []).map((a) => a.candidate_id))
    const neu = leads.filter((l) => !schonDa.has(l.id) && !isSampleCandidate(l.tags))
    for (let i = 0; i < neu.length; i += 200) {
      const teil = neu.slice(i, i + 200)
      const { error } = await db.from("client_assignments").insert(teil.map((l) => ({ candidate_id: l.id, client_id: kunde.id, campaign_id: l.campaign_id })))
      if (error) throw new Error(error.message)
      await db.from("candidate_history").insert(teil.map((l) => ({ candidate_id: l.id, type: "note", content: ALLE_LEADS_HINWEIS })))
      zugeordnet += teil.length
    }
  }
  return { zugeordnet }
}

// Beim Abschalten: Zuordnungen nicht vorqualifizierter Leads aus den eigenen Kampagnen
// zurücknehmen - übrig bleibt, was die Kanzlei auch ohne Freischaltung sähe.
export async function alleLeadsZuruecknehmen(db: Db, clientId: string): Promise<{ entfernt: number }> {
  const { data: zuordnungen } = await db
    .from("client_assignments")
    .select("id, candidate_id, candidates(status, is_demo, campaign_only)")
    .eq("client_id", clientId)
    .is("removed_at", null)
  const weg = (zuordnungen ?? []).filter((z) => {
    const c = (Array.isArray(z.candidates) ? z.candidates[0] : z.candidates) as { status: string; is_demo: boolean; campaign_only: boolean } | null
    return c && !c.is_demo && c.campaign_only && c.status !== ASSIGNABLE_STATUS
  })
  for (let i = 0; i < weg.length; i += 200) {
    const teil = weg.slice(i, i + 200)
    const { error } = await db.from("client_assignments").update({ removed_at: new Date().toISOString() }).in("id", teil.map((z) => z.id))
    if (error) throw new Error(error.message)
    await db.from("candidate_history").insert(teil.map((z) => ({ candidate_id: z.candidate_id, type: "note", content: "Nicht mehr im Kundenportal: Freischaltung „alle Leadeingänge“ beendet." })))
  }
  return { entfernt: weg.length }
}

// Für Portal-Seiten: Hat die Kanzlei des angemeldeten Portal-Nutzers die Freischaltung?
export async function portalSiehtAlleLeads(supabase: Db): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profil } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle()
  if (!profil?.client_id) return false
  const { data: kunde } = await supabase.from("clients").select("portal_alle_leads").eq("id", profil.client_id).maybeSingle()
  return !!kunde?.portal_alle_leads
}
