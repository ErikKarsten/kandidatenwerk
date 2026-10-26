import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { HANDBUCH_HTML } from "./handbuch-html"

// Benutzerhandbuch (Paket 90): nur für das Team. Ohne Anmeldung zur Anmeldung, Portal-Zugänge
// der Kanzleien bekommen es nicht (internes Wissen über Abläufe und Zuständigkeiten).
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login", request.url))
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return NextResponse.redirect(new URL("/portal", request.url))
  return new NextResponse(HANDBUCH_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  })
}
