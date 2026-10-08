import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"

// Berufsbilder, für die Musterdatensätze erstellt werden können (Paket 41) - client-tauglich.
export const SAMPLE_BERUFSBILDER = BERUFSBILD_OPTIONS.filter((o) => o.value !== "sonstige")
