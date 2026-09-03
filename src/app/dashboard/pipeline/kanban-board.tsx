"use client"

import { useState } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCenter,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import Link from "next/link"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

export interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  source: string
  created_at: string
}

// Aus der zentralen Status-Quelle abgeleitet (dieselbe, die auch der Status-Dropdown
// auf der Kandidatenseite nutzt, siehe candidate-status.ts) - vorher hatte dieses Board
// eigene, größtenteils ungültige Platzhalter-Status ("new"/"contacted"/"offer"/...),
// die an der candidates_status_check-Constraint scheiterten und Drops still
// fehlschlagen ließen. Jetzt garantiert konsistent mit den echten 10 Pipeline-Stufen.
const COLUMNS = CANDIDATE_STATUS_OPTIONS.map((opt) => ({
  status: opt.value as string,
  label: opt.label,
  color: opt.text,
  dot: opt.dot,
}))

export function KanbanBoard({ initialCandidates }: { initialCandidates: Candidate[] }) {
  const [candidates, setCandidates] = useState(initialCandidates)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeCandidate = activeId ? candidates.find((c) => c.id === activeId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const candidateId = active.id as string
    const newStatus = over.id as string
    const oldStatus = (active.data.current as { status: string }).status

    if (newStatus === oldStatus) return

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: newStatus } : c))
    )

    // Gleicher Weg wie die Status-Dropdowns (Kandidaten-Detailseite,
    // Kampagnen-Kandidatentabelle) statt der früheren separaten, einfacheren
    // updateCandidateStatus-Funktion - dadurch löst auch ein Drag-and-Drop-Wechsel auf
    // "vorqualifiziert" die automatische Kunden-Benachrichtigung aus. Anders als die
    // alte Funktion wirft diese Action bei Fehlern nicht, sondern gibt { error }
    // zurück - daher hier auf result?.error statt .catch() prüfen.
    const result = await updateCandidateStatusAction(candidateId, newStatus)
    if (result?.error) {
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: oldStatus } : c))
      )
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 160px)" }}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            column={col}
            candidates={candidates.filter((c) => c.status === col.status)}
            isDragging={activeId !== null}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCandidate && (
          <CandidateCard candidate={activeCandidate} isOverlay />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  column,
  candidates,
  isDragging,
}: {
  column: (typeof COLUMNS)[number]
  candidates: Candidate[]
  isDragging: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status })

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.dot }} />
          <span className="text-sm font-semibold text-gray-700">{column.label}</span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: column.dot + "22", color: column.color }}
        >
          {candidates.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 rounded-xl p-2 transition-colors"
        style={{
          backgroundColor: isOver ? column.dot + "18" : "#e8edf2",
          border: isOver ? `2px dashed ${column.dot}` : "2px dashed transparent",
          minHeight: 120,
        }}
      >
        {candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} />
        ))}
        {candidates.length === 0 && isDragging && (
          <div className="flex flex-1 items-center justify-center rounded-lg py-6 text-xs text-gray-400">
            Hier ablegen
          </div>
        )}
      </div>
    </div>
  )
}

function CandidateCard({
  candidate,
  isOverlay = false,
}: {
  candidate: Candidate
  isOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidate.id,
    data: { status: candidate.status },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    cursor: isOverlay ? "grabbing" : "grab",
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="rounded-lg border bg-white p-3 shadow-sm select-none"
      style={{
        ...style,
        borderColor: "#dde3ea",
        boxShadow: isOverlay ? "0 8px 24px rgba(0,0,0,0.12)" : undefined,
      }}
    >
      <Link
        href={`/dashboard/candidates/${candidate.id}`}
        className="block text-sm font-medium text-gray-900 hover:underline"
        onClick={(e) => e.stopPropagation()}
        style={{ color: "#1e56a0" }}
      >
        {candidate.first_name} {candidate.last_name}
      </Link>
      {candidate.email && (
        <p className="mt-0.5 truncate text-xs text-gray-500">{candidate.email}</p>
      )}
      {candidate.source && (
        <p className="mt-1.5 text-xs text-gray-400">{candidate.source}</p>
      )}
    </div>
  )
}
