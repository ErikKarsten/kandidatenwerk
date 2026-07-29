const LEADTABLE_BASE_URL = "https://api.lead-table.com/api/v3/external"

export async function leadtableFetch<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(`${LEADTABLE_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    headers: {
      "x-api-key": process.env.LEADTABLE_API_KEY!,
      email: process.env.LEADTABLE_ACCOUNT_EMAIL!,
    },
  })

  if (!response.ok) {
    throw new Error(`Leadtable-API-Fehler (${response.status}): ${await response.text()}`)
  }

  return response.json()
}
