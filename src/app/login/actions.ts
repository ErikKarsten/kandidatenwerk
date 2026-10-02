"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { candidateLoginSchema } from "@/lib/schemas"
import { checkLoginRateLimit } from "@/lib/ratelimit"
import { z } from "zod"

export async function loginAction(_prevState: string | null, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  // Rate Limiting: max. 5 Versuche/Minute je E-Mail und 20/Minute je IP (siehe
  // src/lib/ratelimit.ts). cf-connecting-ip setzt Cloudflare selbst, nicht der Client.
  const ip = (await headers()).get("cf-connecting-ip")
  if (!(await checkLoginRateLimit(email ?? "", ip))) {
    return "Zu viele Login-Versuche. Bitte warte eine Minute und versuche es dann erneut."
  }

  // ✅ INPUT VALIDATION MIT ZOD
  let validated
  try {
    validated = candidateLoginSchema.parse({ email, password })
  } catch (err) {
    // ✅ VALIDIERUNGSFEHLER ABFANGEN
    if (err instanceof z.ZodError) {
      return err.issues[0].message
    }
    return "Ein Fehler ist aufgetreten"
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: validated.email,
    password: validated.password,
  })

  if (error) {
    return error.message
  }

  // Kunden-Portal-Nutzer (role "client") landen im eingeschraenkten Portal statt im
  // internen Dashboard - siehe middleware.ts, die dieselbe Unterscheidung nochmal
  // serverseitig gegen direkte URL-Aufrufe absichert.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null }

  // redirect() wirft intern einen NEXT_REDIRECT-Fehler und muss daher außerhalb
  // jedes try/catch aufgerufen werden, sonst wird der Redirect fälschlich abgefangen.
  redirect(profile?.role === "client" ? "/portal" : "/dashboard")
}
