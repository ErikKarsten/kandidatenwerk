"use server"

// Standorte eines Kunden (Paket 16, T-75) - im Kanzleiprofil und in den Stammdaten.
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { geocodePlz } from "@/lib/geocode-plz"
import { reverseGeocodeCity } from "@/lib/reverse-geocode"
import { syncPrimaryLocationToClient } from "@/lib/client-locations"
import { scheduleKanzleistelleSync } from "@/lib/kanzleistelle-auto-sync"

type Result = { error: string } | null

export interface LocationInput {
  strasse: string
  plz: string
  ort: string
}

async function staff() {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  return { supabase }
}

function done(clientId: string): null {
  // Ort der Firma auf Kanzleistelle24 folgt dem Hauptstandort.
  scheduleKanzleistelleSync(clientId)
  revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath("/dashboard/clients")
  revalidatePath("/dashboard/map")
  return null
}

type Prepared = { error: string } | { row: { plz: string; ort: string | null; strasse: string | null; lat: number | null; lng: number | null } }

async function prepare(input: LocationInput): Promise<Prepared> {
  const plz = input.plz.trim()
  if (!/^\d{5}$/.test(plz)) return { error: "Bitte eine 5-stellige PLZ eingeben." }
  const coords = geocodePlz(plz)
  // Ort einmalig beim Speichern ermitteln, wenn er nicht angegeben wurde.
  const ort = input.ort.trim() || (coords ? await reverseGeocodeCity(coords.lat, coords.lng) : null)
  return { row: { plz, ort: ort || null, strasse: input.strasse.trim() || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null } }
}

export async function addClientLocationAction(clientId: string, input: LocationInput): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const prepared = await prepare(input)
  if ("error" in prepared) return { error: prepared.error }
  const { count } = await ctx.supabase.from("client_locations").select("id", { count: "exact", head: true }).eq("client_id", clientId)
  const { error } = await ctx.supabase.from("client_locations").insert({ ...prepared.row, client_id: clientId, is_primary: (count ?? 0) === 0 })
  if (error) return { error: error.message }
  await syncPrimaryLocationToClient(ctx.supabase, clientId)
  return done(clientId)
}

export async function updateClientLocationAction(clientId: string, id: string, input: LocationInput): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const prepared = await prepare(input)
  if ("error" in prepared) return { error: prepared.error }
  const { error } = await ctx.supabase.from("client_locations").update(prepared.row).eq("id", id).eq("client_id", clientId)
  if (error) return { error: error.message }
  await syncPrimaryLocationToClient(ctx.supabase, clientId)
  return done(clientId)
}

export async function setPrimaryClientLocationAction(clientId: string, id: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error: clearError } = await ctx.supabase.from("client_locations").update({ is_primary: false }).eq("client_id", clientId).eq("is_primary", true)
  if (clearError) return { error: clearError.message }
  const { error } = await ctx.supabase.from("client_locations").update({ is_primary: true }).eq("id", id).eq("client_id", clientId)
  if (error) return { error: error.message }
  await syncPrimaryLocationToClient(ctx.supabase, clientId)
  return done(clientId)
}

// Löschen; war es der Hauptstandort, rückt der älteste verbleibende nach.
export async function deleteClientLocationAction(clientId: string, id: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { data: removed, error } = await ctx.supabase.from("client_locations").delete().eq("id", id).eq("client_id", clientId).select("is_primary").maybeSingle()
  if (error) return { error: error.message }
  if (removed?.is_primary) {
    const { data: next } = await ctx.supabase.from("client_locations").select("id").eq("client_id", clientId).order("created_at").limit(1).maybeSingle()
    if (next) await ctx.supabase.from("client_locations").update({ is_primary: true }).eq("id", next.id)
  }
  await syncPrimaryLocationToClient(ctx.supabase, clientId)
  return done(clientId)
}
