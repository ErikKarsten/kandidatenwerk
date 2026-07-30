// Setzt PLZ/Koordinaten bei per Google-Places-Suche verifizierten Leadtable-Kunden
// und übernimmt sie anschließend auf deren Kampagnen (sofern die Kampagne noch keine
// eigene PLZ hat).
//
// Usage:
//   npx tsx scripts/leadtable-clients-geocode.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

// "Baumeister & Hoffmann" (abf13be0-db1c-40e9-bc98-d40869870ba5) bewusst ausgelassen —
// zu unsichere Trefferlage bei der Google-Places-Suche.
const CLIENT_GEO: { id: string; plz: string; lat: number; lng: number }[] = [
  { id: "5bfcdffa-9c94-4cbd-89de-23e0acf515ab", plz: "64285", lat: 49.8658596, lng: 8.6532035 },
  { id: "8c6a54c0-2a76-4ac9-9cf4-8b840ef26bc7", plz: "63225", lat: 49.9986444, lng: 8.654311 },
  { id: "0aadf463-d9b2-4604-8285-0e4c80ecd724", plz: "36251", lat: 50.8642763, lng: 9.7181002 },
  { id: "2c1888a0-32d6-42a0-86a3-979a9d31f72a", plz: "31303", lat: 52.4584262, lng: 9.9889172 },
  { id: "0b6ef448-8f5d-4065-b10c-0f7bc4b26f07", plz: "65843", lat: 50.1334694, lng: 8.532669 },
  // Korrigiert: übergebene ID war beschädigt/abgeschnitten (fehlte "f8c78"),
  // gegen die Datenbank verifiziert (Name "Christina Orth" ist eindeutig).
  { id: "88728ee5-2c17-4c78-b448-8f8c78e1fdbc", plz: "37249", lat: 51.370145, lng: 9.8953895 },
  { id: "874af5ca-b862-4cc3-8a5f-daa5e50aa521", plz: "60322", lat: 50.1185722, lng: 8.6771176 },
  { id: "260d05a1-6f27-42e5-93a7-a8364e14027d", plz: "45470", lat: 51.4150183, lng: 6.9137004 },
  { id: "39f5b985-49ce-4762-9c94-b04b065e8f2a", plz: "52064", lat: 50.7696095, lng: 6.0844912 },
  { id: "1a6f1a05-c1e4-487a-be28-e744c626b83e", plz: "49076", lat: 52.2882308, lng: 8.013235 },
  { id: "0033d673-f42e-4eeb-b532-798712b83d1c", plz: "22609", lat: 53.5551216, lng: 9.8441869 },
  { id: "228e847f-e492-4127-b9a0-ff7c9eaed018", plz: "64625", lat: 49.6726438, lng: 8.5845681 },
  { id: "ebe4df34-6f25-4957-b037-4d95261fb5ca", plz: "79761", lat: 47.6353436, lng: 8.2720831 },
  { id: "a859728b-c8fa-4f33-9b26-d47d2fd4b40e", plz: "22525", lat: 53.5748568, lng: 9.9184984 },
  { id: "5ece2ab7-f9f3-4cc8-b8bb-836fc67cea16", plz: "38350", lat: 52.2230224, lng: 11.0062656 },
  { id: "3f8e6e61-d2e7-4bba-9819-6f225d43728b", plz: "58509", lat: 51.2195713, lng: 7.6146476 },
  { id: "11ef1acf-be84-40d8-8f6e-b671da6996cb", plz: "99867", lat: 50.9403809, lng: 10.6975732 },
  { id: "76ad5fe1-5f66-45f3-8f6a-af2a9ad4c1d0", plz: "94315", lat: 48.8815964, lng: 12.5746815 },
  { id: "2a21a8e1-be68-4e47-99f3-2f3ab41310bd", plz: "40547", lat: 51.2398278, lng: 6.7354795 },
  { id: "5f7f9483-a828-41b1-a3c5-052c0f329e5f", plz: "26721", lat: 53.3712126, lng: 7.201022 },
  { id: "93ff46a5-3849-4f8c-b7da-c9329936801f", plz: "52080", lat: 50.798069, lng: 6.122601 },
  { id: "3cae0bc8-1ce4-4a7f-bf58-aee0c23717bf", plz: "70192", lat: 48.78992, lng: 9.17004 },
  { id: "752d7740-3812-4c36-bd34-f61e2eac2009", plz: "74076", lat: 49.1575176, lng: 9.2188918 },
  { id: "862e1f03-f0d7-40dd-857d-4d126994d41f", plz: "91710", lat: 49.1144483, lng: 10.7546912 },
  { id: "822bf580-3573-493b-ab65-05bae56b6f05", plz: "38122", lat: 52.2570768, lng: 10.5143994 },
  { id: "82b21067-03d2-4649-a4ce-0ce8385c391c", plz: "37619", lat: 51.9789458, lng: 9.5169063 },
  { id: "2fca30f5-d12e-4d90-8321-681a814348f3", plz: "61118", lat: 50.182526, lng: 8.743303 },
  { id: "03d4c074-dae9-450a-89c4-67126c767f11", plz: "79822", lat: 47.9187832, lng: 8.2153837 },
  { id: "a61fee78-912b-4d64-aaa4-d60088724fbd", plz: "53227", lat: 50.7413781, lng: 7.1480667 },
  { id: "cff8e84d-4686-407b-8f35-00bb107133ac", plz: "72280", lat: 48.4658697, lng: 8.5009846 },
  { id: "31b53b3f-8bdd-40d3-ac19-ffd48550c53b", plz: "40213", lat: 51.2246832, lng: 6.7754232 },
  { id: "c6d58925-e7da-406e-9743-38f4e4e43200", plz: "60323", lat: 50.1186963, lng: 8.6630229 },
  { id: "f0d11390-53c4-4474-a176-e4fad3ad7be7", plz: "63069", lat: 50.0944719, lng: 8.7495961 },
  { id: "8c46108f-9df7-4d83-bd8b-82ff3cc36a6f", plz: "42899", lat: 51.2090718, lng: 7.232994 },
  { id: "f8f4fc3e-ecc5-4bd9-ad07-0a2db67f330e", plz: "53119", lat: 50.7443313, lng: 7.0522828 },
  { id: "15f65856-21a5-41ba-8669-b92bd8829e50", plz: "40213", lat: 51.2293993, lng: 6.775467 },
  { id: "bfbcfafd-922f-4b2c-9bc9-6b4d2b8ba21b", plz: "71120", lat: 48.7140234, lng: 8.9074787 },
  { id: "eadf797a-4fce-4974-b4a3-eb7eb788857d", plz: "74889", lat: 49.2483805, lng: 8.8509148 },
  { id: "7f989f78-c24b-41c8-9e90-b286a4c0750a", plz: "79098", lat: 47.9919866, lng: 7.8470289 },
  { id: "77a1f7df-bac9-46d4-b836-ec6acb96f853", plz: "52068", lat: 50.7787478, lng: 6.1267167 },
  { id: "12352b27-4ab6-4d7b-b93a-7d6cfaebc5f5", plz: "35576", lat: 50.5601609, lng: 8.4967582 },
  { id: "d80ba8b5-bd14-4c75-a4eb-9b2a2cedc762", plz: "89129", lat: 48.5010945, lng: 10.1220926 },
  { id: "f6018553-1041-4a86-9124-fe329f490c14", plz: "76835", lat: 49.2456573, lng: 8.1143597 },
]

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  console.log(`=== 1. ${CLIENT_GEO.length} Kunden aktualisieren ===`)
  let clientsUpdated = 0
  const clientErrors: { id: string; message: string }[] = []

  for (const entry of CLIENT_GEO) {
    const { error } = await supabase
      .from("clients")
      .update({ plz: entry.plz, lat: entry.lat, lng: entry.lng })
      .eq("id", entry.id)

    if (error) {
      clientErrors.push({ id: entry.id, message: error.message })
      console.log(`  FEHLER bei ${entry.id}: ${error.message}`)
      continue
    }
    clientsUpdated++
  }

  console.log(`Kunden aktualisiert: ${clientsUpdated} / ${CLIENT_GEO.length}`)
  if (clientErrors.length > 0) {
    console.log(`Fehler: ${clientErrors.length}`)
  }

  console.log("")
  console.log("=== 2. Kampagnen ohne eigene PLZ auf Kunden-Geodaten aktualisieren ===")

  const clientIds = CLIENT_GEO.map((c) => c.id)
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, client_id")
    .in("client_id", clientIds)
    .is("plz", null)

  if (campaignsError) throw new Error(campaignsError.message)

  console.log(`${campaigns?.length ?? 0} Kampagnen ohne eigene PLZ gefunden`)

  const geoByClientId = new Map(CLIENT_GEO.map((c) => [c.id, c]))
  let campaignsUpdated = 0
  const campaignErrors: { id: string; message: string }[] = []

  for (const campaign of campaigns ?? []) {
    const geo = geoByClientId.get(campaign.client_id)
    if (!geo) continue // sollte nicht vorkommen, da wir schon nach client_id gefiltert haben

    const { error } = await supabase
      .from("campaigns")
      .update({ plz: geo.plz, lat: geo.lat, lng: geo.lng })
      .eq("id", campaign.id)

    if (error) {
      campaignErrors.push({ id: campaign.id, message: error.message })
      console.log(`  FEHLER bei Kampagne ${campaign.id}: ${error.message}`)
      continue
    }
    campaignsUpdated++
  }

  console.log(`Kampagnen aktualisiert: ${campaignsUpdated}`)
  if (campaignErrors.length > 0) {
    console.log(`Fehler: ${campaignErrors.length}`)
  }

  console.log("")
  console.log("=== Zusammenfassung ===")
  console.log(`Kunden aktualisiert: ${clientsUpdated}`)
  console.log(`Kampagnen erstmals mit PLZ versehen: ${campaignsUpdated}`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
