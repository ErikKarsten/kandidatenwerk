"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"

const PAGE_SIZES = [10, 20, 50] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export function readStoredPageSize(key: string): PageSize {
  if (typeof window === "undefined") return 10
  const n = Number(window.localStorage.getItem(key))
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : 10
}

export function usePaginatedList<T>(items: T[], storageKey: string) {
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPageSize(readStoredPageSize(storageKey))
  }, [storageKey])

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visible = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  function handlePageSize(size: PageSize) {
    setPageSize(size)
    setPage(1)
    window.localStorage.setItem(storageKey, String(size))
  }

  return { visible, page: safePage, totalPages, pageSize, setPage, handlePageSize }
}

interface PaginationBarProps {
  page: number
  totalPages: number
  pageSize: PageSize
  onPageChange: (p: number) => void
  onPageSizeChange: (s: PageSize) => void
}

export function PaginationBar({ page, totalPages, pageSize, onPageChange, onPageSizeChange }: PaginationBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Pro Seite:</span>
        <div className="flex gap-1">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onPageSizeChange(size)}
              className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: pageSize === size ? "#1e56a0" : "white",
                color: pageSize === size ? "white" : "#6b7280",
                border: `1px solid ${pageSize === size ? "#1e56a0" : "#dde3ea"}`,
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center rounded border text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-30"
          style={{ borderColor: "#dde3ea" }}
          aria-label="Vorherige Seite"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-gray-500 tabular-nums">
          Seite {page} von {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="flex h-7 w-7 items-center justify-center rounded border text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-30"
          style={{ borderColor: "#dde3ea" }}
          aria-label="Nächste Seite"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
