"use client"

import { useRef, useState } from "react"
import { UploadCloud } from "lucide-react"

interface FileDropZoneProps {
  onUpload: (file: File) => void
  accept?: string
  disabled?: boolean
  label?: string
}

// Wiederverwendbare Drag-and-Drop-Upload-Zone: Dateien per Drop ODER per Klick (öffnet
// den klassischen Datei-Dialog als Fallback) landen. onUpload wird für jede
// ausgewählte/abgelegte Datei einzeln aufgerufen - der Aufrufer kümmert sich selbst um
// FormData und die passende Server Action pro Datei (siehe
// candidates/[id]/files-tab.tsx und clients/[id]/client-files-tab.tsx, die beide diese
// Komponente nutzen statt eigener Upload-UI).
export function FileDropZone({
  onUpload,
  accept = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx",
  disabled = false,
  label = "Datei hierher ziehen oder klicken zum Hochladen",
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    Array.from(fileList).forEach((file) => onUpload(file))
  }

  return (
    <div
      onClick={() => { if (!disabled) inputRef.current?.click() }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragActive(false)
        if (disabled) return
        handleFiles(e.dataTransfer.files)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragActive(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragActive(false)
      }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors"
      style={{
        borderColor: dragActive ? "#1e56a0" : "#dde3ea",
        backgroundColor: dragActive ? "#1e56a010" : "white",
        color: dragActive ? "#1e56a0" : "#6b7280",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <UploadCloud size={20} />
      <span className="font-medium">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          if (inputRef.current) inputRef.current.value = ""
        }}
      />
    </div>
  )
}
