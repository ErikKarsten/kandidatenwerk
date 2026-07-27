"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { candidateLoginSchema } from "@/lib/schemas"
import { checkRateLimit } from "@/lib/ratelimit"
import { z } from "zod"

export async function loginAction(_prevState: string | null, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  // ✅ RATE LIMITING CHECK
  const rateLimit = await checkRateLimit(email, 5, 3600000) // 5 Versuche pro Stunde
  if (!rateLimit.success) {
    return "Zu viele Login-Versuche. Versuche es in 1 Stunde erneut."
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

  // redirect() wirft intern einen NEXT_REDIRECT-Fehler und muss daher außerhalb
  // jedes try/catch aufgerufen werden, sonst wird der Redirect fälschlich abgefangen.
  redirect("/dashboard")
}
