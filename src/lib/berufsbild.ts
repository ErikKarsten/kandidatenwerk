// Werte müssen exakt mit dem CHECK-Constraint auf campaigns.berufsbild / candidates.berufsbild übereinstimmen
export const BERUFSBILD_OPTIONS = [
  { value: "steuerfachangestellte", label: "Steuerfachangestellte" },
  { value: "steuerfachwirt", label: "Steuerfachwirt" },
  { value: "bilanzbuchhalter", label: "Bilanzbuchhalter" },
  { value: "steuerberater", label: "Steuerberater" },
  { value: "sonstige", label: "Sonstige" },
] as const

export type Berufsbild = (typeof BERUFSBILD_OPTIONS)[number]["value"]
