import type { MetadataRoute } from "next"

// Paket 108: Damit Kandidatenwerk auf dem iPhone als App auf den Home-Bildschirm gelegt
// werden kann - nur dann erlaubt iOS Browser-Benachrichtigungen (Kampagnen-Alarm).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kandidatenwerk",
    short_name: "Kandidatenwerk",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e3a5f",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  }
}
