import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export const runtime = "experimental-edge"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isDashboard = pathname.startsWith("/dashboard")
  const isPortal = pathname.startsWith("/portal")
  const isProtected = isDashboard || isPortal
  const isLoginPage = pathname === "/login"

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // role wird erst NACH dem "eingeloggt?"-Check geladen (kein Grund, das fuer jede
  // Anfrage zu tun) - Kunden-Portal-Nutzer (role "client") duerfen nur unter /portal,
  // alle anderen nur unter /dashboard. Ohne diese Trennung wuerde ein Portal-Login
  // z.B. per direktem Aufruf von /dashboard/candidates trotzdem die volle interne
  // Oberflaeche sehen (auch wenn die Daten selbst durch RLS eingeschraenkt waeren -
  // die UI-Beschraenkung ist ein zweites, unabhaengiges Sicherheitsnetz, siehe die
  // Kunden-Portal-Spezifikation).
  if (user && (isDashboard || isPortal || isLoginPage)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    const isClient = profile?.role === "client"

    if (isDashboard && isClient) {
      return NextResponse.redirect(new URL("/portal", request.url))
    }
    if (isPortal && !isClient) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    if (isLoginPage) {
      return NextResponse.redirect(new URL(isClient ? "/portal" : "/dashboard", request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
