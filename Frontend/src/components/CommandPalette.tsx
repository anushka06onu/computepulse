import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { scaleIn, staggerContainer, staggerItem } from '../motion/presets'

const routes = [
  { label: 'Fleet Overview', path: '/app/fleet' },
  { label: 'Warnings Inbox', path: '/app/warnings' },
  { label: 'Cluster Map', path: '/app/map' },
  { label: 'Node Explorer', path: '/app/nodes' },
  { label: 'Job Placement', path: '/app/placement' },
  { label: 'Cost Optimization', path: '/app/optimize' },
  { label: 'System Accuracy', path: '/app/evidence' },
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

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="palette-overlay"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="palette"
            onClick={(e) => e.stopPropagation()}
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
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
            <motion.ul
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              key={q}
            >
              {items.map((item, i) => (
                <motion.li key={item.label} variants={staggerItem}>
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
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
