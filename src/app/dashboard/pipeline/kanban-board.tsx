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
import { updateCandidateStatus } from "./actions"

export interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  source: string
  created_at: string
}

const COLUMNS: { status: string; label: string; color: string; dot: string }[] = [
  { status: "new",       label: "Neu",          color: "#0e7490", dot: "#4ba3c3" },
  { status: "contacted", label: "Kontaktiert",   color: "#b45309", dot: "#f59e0b" },
  { status: "interview", label: "Interview",     color: "#1e56a0", dot: "#1e56a0" },
  { status: "offer",     label: "Angebot",       color: "#7c3aed", dot: "#8b5cf6" },
  { status: "hired",     label: "Eingestellt",   color: "#1a9a6a", dot: "#1a9a6a" },
  { status: "rejected",  label: "Abgelehnt",     color: "#6b7280", dot: "#9ca3af" },
]

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

  function handleDragEnd(event: DragEndEvent) {
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

    updateCandidateStatus(candidateId, newStatus).catch(() => {
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: oldStatus } : c))
      )
    })
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
