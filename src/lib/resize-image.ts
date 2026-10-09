"use client"

// Bild im Browser verkleinern, bevor es hochgeladen wird (Paket 38): Logos kommen oft in
// Druckauflösung (z.B. 10.000 px) - zu groß für Mails und Seitenleiste. Liefert eine PNG-
// Datei mit höchstens maxSide Pixeln Kantenlänge und die Abmessungen.
// Abmessungen ohne das ganze Bild zu dekodieren (sehr große Logos, z. B. 10.000 px).
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Bild konnte nicht gelesen werden."))
    }
    img.src = url
  })
}

export async function resizeImageFile(file: File, maxSide = 480): Promise<{ file: File; width: number; height: number }> {
  const original = await imageSize(file)
  const scale = Math.min(1, maxSide / Math.max(original.width, original.height))
  const width = Math.max(1, Math.round(original.width * scale))
  const height = Math.max(1, Math.round(original.height * scale))
  // Beim Dekodieren gleich verkleinern - ein 10.000-px-Bild in voller Größe sprengt den
  // Speicher des Browsers (Paket 46: Logo ließ sich nicht ändern).
  const bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" })
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
