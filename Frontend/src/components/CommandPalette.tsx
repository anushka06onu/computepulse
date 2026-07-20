import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const routes = [
  { label: 'Fleet Overview', path: '/app/fleet' },
  { label: 'Node Explorer', path: '/app/nodes' },
  { label: 'Job Placement', path: '/app/placement' },
  { label: 'Cost Optimization', path: '/app/optimize' },
  { label: 'Model Evidence', path: '/app/evidence' },
  { label: 'Compare Nodes', path: '/app/compare' },
  { label: 'Landing page', path: '/' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const navigate = useNavigate()
  const { refresh } = useApp()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
        setIdx(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo(() => {
    const actions = [
      ...routes.map((r) => ({
        label: `Go to ${r.label}`,
        run: () => navigate(r.path),
      })),
      {
        label: 'Refresh live snapshot',
        run: () => void refresh(),
      },
    ]
    const query = q.trim().toLowerCase()
    if (!query) return actions
    const nodeMatch = query.match(/^node\s+(\d+)$/) || query.match(/^(\d+)$/)
    if (nodeMatch) {
      const id = Number(nodeMatch[1])
      return [
        {
          label: `Open node ${id}`,
          run: () => navigate(`/app/nodes/${id}`),
        },
        ...actions.filter((a) => a.label.toLowerCase().includes(query)),
      ]
    }
    return actions.filter((a) => a.label.toLowerCase().includes(query))
  }, [q, navigate, refresh])

  if (!open) return null

  return (
    <div className="palette-overlay" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Jump to page, refresh, or type a node ID…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(i + 1, items.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(i - 1, 0))
            }
            if (e.key === 'Enter' && items[idx]) {
              items[idx].run()
              setOpen(false)
            }
          }}
        />
        <ul>
          {items.map((item, i) => (
            <li key={item.label}>
              <button
                className={i === idx ? 'active' : ''}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  item.run()
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
