// Fotos von Team-Mitgliedern (Paket 15, T-73) im privaten Bucket team-avatars. Hoch- und
// ausgeliefert wird nur serverseitig mit dem Service-Role-Client; im Browser landen nur
// zeitlich begrenzte, signierte Links.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

const BUCKET = "team-avatars"
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

export function validateAvatar(file: File | null): string | null {
  if (!file || file.size === 0) return "Bitte ein Foto auswählen."
  if (!ALLOWED_TYPES[file.type]) return "Foto bitte als JPG, PNG oder WebP hochladen."
  if (file.size > MAX_BYTES) return "Das Foto darf höchstens 5 MB groß sein."
  return null
}

// Lädt das Foto hoch und liefert den Pfad; ein vorheriges Foto wird entfernt.
export async function uploadAvatar(admin: SupabaseClient<Database>, profileId: string, file: File, previousPath?: string | null): Promise<string> {
  const path = `${profileId}/${Date.now()}.${ALLOWED_TYPES[file.type]}`
  const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
  if (error) throw new Error(error.message)
  if (previousPath) await admin.storage.from(BUCKET).remove([previousPath])
  return path
}

export async function removeAvatar(admin: SupabaseClient<Database>, path: string | null | undefined): Promise<void> {
  if (path) await admin.storage.from(BUCKET).remove([path])
}

export async function signedAvatarUrl(admin: SupabaseClient<Database>, path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}
