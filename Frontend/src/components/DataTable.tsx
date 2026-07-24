import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { StatusBadge } from './StatusBadge'
import type { Health } from '../api/client'
import { staggerContainer, staggerItem } from '../motion/presets'

type Col<T> = {
  key: keyof T | string
  label: string
  render?: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}

const ROW_CAP = 40
const PAGE_SIZES = [25, 50, 100] as const

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  pulseCritical,
}: {
  rows: T[]
  columns: Col<T>[]
  pulseCritical?: boolean
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [asc, setAsc] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => String(c.key) === sortKey)
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = col?.sortValue
        ? col.sortValue(a)
        : (a[sortKey as keyof T] as string | number)
      const bv = col?.sortValue
        ? col.sortValue(b)
        : (b[sortKey as keyof T] as string | number)
      if (av < bv) return asc ? -1 : 1
      if (av > bv) return asc ? 1 : -1
      return 0
    })
    return copy
  }, [rows, sortKey, asc, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * pageSize
  const pageRows = sorted.slice(start, start + pageSize)
  const end = Math.min(start + pageSize, sorted.length)
  const useMotion = pageRows.length <= ROW_CAP

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const key = String(c.key)
              const sortedHere = sortKey === key
              return (
                <th
                  key={key}
                  role="columnheader"
                  aria-sort={
                    sortedHere ? (asc ? 'ascending' : 'descending') : 'none'
                  }
                  tabIndex={0}
                  onClick={() => {
                    if (sortKey === key) setAsc(!asc)
                    else {
                      setSortKey(key)
                      setAsc(true)
                    }
                    setPage(0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).click()
                    }
                  }}
                >
                  {c.label}
                  {sortedHere ? (asc ? ' ↑' : ' ↓') : ''}
                </th>
              )
            })}
          </tr>
        </thead>
        {useMotion ? (
          <motion.tbody
            key={`${sortKey ?? 'default'}-${asc ? 'asc' : 'desc'}-${safePage}-${pageSize}`}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {pageRows.map((row, i) => {
              const health = row.health as Health | undefined
              const rowKey =
                (row.node_id as number | string | undefined) ?? `${start + i}`
              return (
                <motion.tr
                  key={rowKey}
                  variants={staggerItem}
                  className={
                    pulseCritical && health === 'critical' ? 'pulse-critical' : ''
                  }
                >
                  {columns.map((c) => (
                    <td key={String(c.key)}>
                      {c.render
                        ? c.render(row)
                        : c.key === 'health' && health
                          ? <StatusBadge health={health} />
                          : String(row[c.key as keyof T] ?? '')}
                    </td>
                  ))}
                </motion.tr>
              )
            })}
          </motion.tbody>
        ) : (
          <tbody>
            {pageRows.map((row, i) => {
              const health = row.health as Health | undefined
              const rowKey =
                (row.node_id as number | string | undefined) ?? `${start + i}`
              return (
                <tr
                  key={rowKey}
                  className={
                    pulseCritical && health === 'critical' ? 'pulse-critical' : ''
                  }
                >
                  {columns.map((c) => (
                    <td key={String(c.key)}>
                      {c.render
                        ? c.render(row)
                        : c.key === 'health' && health
                          ? <StatusBadge health={health} />
                          : String(row[c.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        )}
      </table>
      <div className="table-pager">
        <span className="table-pager-status">
          {sorted.length === 0
            ? 'No rows'
            : `Showing ${start + 1}–${end} of ${sorted.length.toLocaleString()}`}
        </span>
        <div className="table-pager-controls">
          <label className="table-pager-size">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
                setPage(0)
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Prev
          </button>
          <span className="table-pager-page">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
