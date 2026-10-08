// Platzhalter während eine Detailseite auf dem Server geladen wird (Paket 41): Der Klick
// reagiert sofort, statt ohne Rückmeldung auf den Server zu warten.
function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/70 ${className}`} />
}

export function DetailPageSkeleton({ cards = 2, label = "Wird geladen…" }: { cards?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={label}>
      <Bar className="h-4 w-36" />
      <div className="flex items-center gap-3">
        <Bar className="h-8 w-2/5 min-w-[220px]" />
        <Bar className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cards}, minmax(0, 1fr))` }}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
            <Bar className="h-4 w-28" />
            <Bar className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="flex gap-6 border-b pb-3" style={{ borderColor: "#dde3ea" }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Bar key={i} className="h-4 w-20" />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <Bar className="h-4 w-1/3" />
        <Bar className="h-4 w-2/3" />
        <Bar className="h-4 w-1/2" />
      </div>
      <p className="text-center text-xs text-gray-400">{label}</p>
    </div>
  )
}
