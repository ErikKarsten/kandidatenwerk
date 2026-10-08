"use client"

// Bild im Browser verkleinern, bevor es hochgeladen wird (Paket 38): Logos kommen oft in
// Druckauflösung (z.B. 10.000 px) - zu groß für Mails und Seitenleiste. Liefert eine PNG-
// Datei mit höchstens maxSide Pixeln Kantenlänge und die Abmessungen.
export async function resizeImageFile(file: File, maxSide = 480): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Bild konnte nicht verarbeitet werden.")
  return { file: new File([blob], "logo.png", { type: "image/png" }), width, height }
}
