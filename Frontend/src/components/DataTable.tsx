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

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                onClick={() => {
                  if (sortKey === String(c.key)) setAsc(!asc)
                  else {
                    setSortKey(String(c.key))
                    setAsc(true)
                  }
                }}
              >
                {c.label}
                {sortKey === String(c.key) ? (asc ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <motion.tbody
          key={`${sortKey ?? 'default'}-${asc ? 'asc' : 'desc'}-${sorted.length}`}
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {sorted.slice(0, 100).map((row, i) => {
            const health = row.health as Health | undefined
            const animateRow = i < ROW_CAP
            return (
              <motion.tr
                key={i}
                layout
                variants={animateRow ? staggerItem : undefined}
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
          {sorted.length > 100 && (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '1rem', color: 'var(--ink-muted)' }}>
                Showing top 100 of {sorted.length.toLocaleString()} rows. (Sort to see others)
              </td>
            </tr>
          )}
        </motion.tbody>
      </table>
    </div>
  )
}
