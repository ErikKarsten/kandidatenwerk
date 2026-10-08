const LEADTABLE_BASE_URL = "https://api.lead-table.com/api/v3/external"

export async function leadtableFetch<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(`${LEADTABLE_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }

  // Leadtable begrenzt die Anfragen (429) - bei Massenabfragen (Neuimport) kurz warten und
  // erneut versuchen, Retry-After beachten (Paket 39).
  let response!: Response
  for (let attempt = 0; attempt < 6; attempt++) {
    response = await fetch(url, {
      headers: {
        "x-api-key": process.env.LEADTABLE_API_KEY!,
        email: process.env.LEADTABLE_ACCOUNT_EMAIL!,
      },
    })
    if (response.status !== 429) break
    const retryAfter = Number(response.headers.get("retry-after"))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60_000)))
  }

  if (!response.ok) {
    throw new Error(`Leadtable-API-Fehler (${response.status}): ${await response.text()}`)
  }

  return response.json()
}
