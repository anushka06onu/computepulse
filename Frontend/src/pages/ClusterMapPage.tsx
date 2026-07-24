import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Box, Grid3x3, LayoutGrid } from 'lucide-react'
import { api, type FleetNode, type FleetSnapshot, type Health } from '../api/client'
import { useApp } from '../context/AppContext'
import { PageError } from '../components/PageError'
import { pressDown, staggerContainer, staggerItem, tooltipEnter } from '../motion/presets'

const ClusterTopology3D = lazy(() =>
  import('../components/three/ClusterTopology3D').then((m) => ({
    default: m.ClusterTopology3D,
  })),
)

type Filter = 'all' | Health
type ViewMode = '3d' | '2d'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function cellColor(fused: number): string {
  if (fused >= 70) {
    const t = Math.min(1, (fused - 70) / 30)
    return `color-mix(in oklab, var(--color-critical) ${55 + Math.round(t * 40)}%, transparent)`
  }
  if (fused >= 40) {
    const t = (fused - 40) / 30
    return `color-mix(in oklab, var(--color-watch) ${45 + Math.round(t * 40)}%, transparent)`
  }
  const t = fused / 40
  return `color-mix(in oklab, var(--color-healthy) ${28 + Math.round(t * 47)}%, transparent)`
}

function canWebGL() {
  if (typeof window === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

export function ClusterMapPage() {
  const navigate = useNavigate()
  const { seed, critical, watch, health } = useApp()
  const [data, setData] = useState<FleetSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<{ node: FleetNode; x: number; y: number } | null>(
    null,
  )
  const webgl = useMemo(() => canWebGL(), [])
  const [view, setView] = useState<ViewMode>(webgl ? '3d' : '2d')

  useEffect(() => {
    if (health?.ready === false) return
    let cancelled = false
    api
      .fleet(seed, critical, watch)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [seed, critical, watch, health?.ready, reloadKey])

  const MAP_2D_CAP = 500

  const cells = useMemo(() => {
    if (!data) return []
    const q = query.trim()
    return data.nodes
      .filter((n) => (filter === 'all' ? true : n.health === filter))
      .filter((n) => (q ? String(n.node_id).includes(q) : true))
      .slice()
      .sort((a, b) => a.node_id - b.node_id)
  }, [data, filter, query])

  if (error) {
    return (
      <PageError
        title="Cluster Map"
        message={error}
        onRetry={() => {
          setError(null)
          setReloadKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Grid3x3 size={12} /> Topology
          </div>
          <h1>Cluster Map</h1>
          <p>
            Every machine colored by fused risk (risk + anomaly). Hover for
            detail, click to inspect.
          </p>
        </div>
        {webgl ? (
          <div className="page-actions view-toggle">
            <button
              className={`chip${view === '3d' ? ' active' : ''}`}
              onClick={() => setView('3d')}
            >
              <Box size={14} /> 3D
            </button>
            <button
              className={`chip${view === '2d' ? ' active' : ''}`}
              onClick={() => setView('2d')}
            >
              <LayoutGrid size={14} /> Classic 2D
            </button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        {(
          [
            ['all', 'All machines'],
            ['critical', 'Critical'],
            ['watch', 'Watch'],
            ['healthy', 'Healthy'],
          ] as const
        ).map(([f, label]) => (
          <motion.button
            key={f}
            className={`chip${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
            whileTap={pressDown}
          >
            {label}
          </motion.button>
        ))}
        <input
          className="map-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find node ID…"
        />
      </div>

      <div className="panel">
        <div className="panel-inner-core">
          <div className="panel-header">
            <div>
              <h2>{view === '3d' ? 'Fleet topology' : 'Fleet heatmap'}</h2>
              <p className="panel-sub">
                {view === '2d' && cells.length > MAP_2D_CAP
                  ? `Showing ${MAP_2D_CAP.toLocaleString()} of ${cells.length.toLocaleString()} machines — refine filters to go deeper`
                  : `${cells.length.toLocaleString()} machines shown`}
              </p>
            </div>
            <div className="map-legend">
              <span className="map-legend-label">Low risk</span>
              <span className="map-legend-bar" aria-hidden />
              <span className="map-legend-label">High risk</span>
            </div>
          </div>

          {!data ? (
            <div className="skeleton" style={{ height: 420 }} />
          ) : view === '3d' ? (
            <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
              <ClusterTopology3D
                nodes={cells}
                reduced={reduced}
                onSelect={(id) => navigate(`/app/nodes/${id}`)}
              />
            </Suspense>
          ) : (
            <motion.div
              className="cluster-grid"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              key={`${filter}-${query}`}
              onMouseLeave={() => setHover(null)}
            >
              {cells.slice(0, MAP_2D_CAP).map((n, i) => (
                <motion.button
                  key={n.node_id}
                  className={`cluster-cell ${n.health}`}
                  style={{ backgroundColor: cellColor(n.fused_risk) }}
                  aria-label={`Node ${n.node_id}, fused ${n.fused_risk.toFixed(0)}%, ${n.health}`}
                  variants={i < 120 ? staggerItem : undefined}
                  onClick={() => navigate(`/app/nodes/${n.node_id}`)}
                  onMouseEnter={(e) =>
                    setHover({ node: n, x: e.clientX, y: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHover({ node: n, x: e.clientX, y: e.clientY })
                  }
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {hover && view === '2d' ? (
          <motion.div
            className="map-tooltip"
            style={{ left: hover.x + 14, top: hover.y + 14 }}
            variants={tooltipEnter}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <strong>Node {hover.node.node_id}</strong>
            <span>Fused {hover.node.fused_risk.toFixed(1)}%</span>
            <span>Risk {hover.node.risk_score.toFixed(1)}%</span>
            <span>Anomaly {hover.node.anomaly_score.toFixed(2)}</span>
            <span className={`status ${hover.node.health}`}>
              <span className="status-dot" />
              {hover.node.health}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

