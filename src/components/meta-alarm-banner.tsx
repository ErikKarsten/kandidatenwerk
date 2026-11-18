// Rote Leiste über jeder Dashboard-Seite, solange Meta die Anzeigen nicht ausspielt
// (Paket 108, übernommen aus dem Meta-Analyse-Tool). Stand aus meta_konto_status, den der
// zentrale Meta-Abruf alle 30 Minuten schreibt - hier keine Meta-Anfrage.
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { uhrIn, type KontoStand } from "@/lib/meta-konto-logik"

export async function MetaAlarmBanner() {
  const db = createSupabaseAdminClient() as unknown as SupabaseClient
  const { data } = await db.from("meta_konto_status").select("stand").order("geprueft_am", { ascending: false }).limit(1).maybeSingle()
  const stand = data?.stand as KontoStand | undefined
  if (!stand?.alarm) return null

  const konto = stand.konto_id.replace(/^act_/, "")
  return (
    <div role="alert" className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ backgroundColor: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b" }}>
      <p className="font-semibold">🔴 {stand.alarm_titel ?? "Kampagnen offline"}</p>
      <p className="mt-0.5">{stand.alarm_text}</p>
      <p className="mt-1 text-xs" style={{ color: "#b91c1c" }}>
        Geprüft um {uhrIn(stand.geprueft_am, stand.zeitzone)} Uhr ·{" "}
        <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${konto}`} target="_blank" rel="noopener noreferrer" className="underline">
          Im Werbeanzeigenmanager beheben
        </a>{" "}
        · <a href="/meta-analyse-tool/index.html" className="underline">Im Meta-Analyse-Tool ansehen</a>
      </p>
    </div>
  )
}
