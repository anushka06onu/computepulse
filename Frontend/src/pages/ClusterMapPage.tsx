import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Grid3x3 } from 'lucide-react'
import { api, type FleetNode, type FleetSnapshot, type Health } from '../api/client'
import { useApp } from '../context/AppContext'
import { fadeIn } from '../motion/presets'

type Filter = 'all' | Health

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

export function ClusterMapPage() {
  const navigate = useNavigate()
  const { seed, critical, watch, health } = useApp()
  const [data, setData] = useState<FleetSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<{ node: FleetNode; x: number; y: number } | null>(
    null,
  )

  useEffect(() => {
    if (health && !health.ready) return
    let cancelled = false
    setData(null)
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
  }, [seed, critical, watch, health])

  const cells = useMemo(() => {
    if (!data) return []
    const q = query.trim()
    return data.nodes
      .filter((n) => (filter === 'all' ? true : n.health === filter))
      .filter((n) => (q ? String(n.node_id).includes(q) : true))
      .slice()
      .sort((a, b) => a.node_id - b.node_id)
  }, [data, filter, query])

  if (error) return <p className="banner">{error}</p>

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
          <button
            key={f}
            className={`chip${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
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
              <h2>Fleet heatmap</h2>
              <p className="panel-sub">
                {cells.length.toLocaleString()} machines shown
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
          ) : (
            <motion.div
              className="cluster-grid"
              variants={fadeIn}
              initial="initial"
              animate="animate"
              onMouseLeave={() => setHover(null)}
            >
              {cells.map((n) => (
                <button
                  key={n.node_id}
                  className={`cluster-cell ${n.health}`}
                  style={{ backgroundColor: cellColor(n.fused_risk) }}
                  aria-label={`Node ${n.node_id}, fused ${n.fused_risk.toFixed(0)}%, ${n.health}`}
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

      {hover ? (
        <div
          className="map-tooltip"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <strong>Node {hover.node.node_id}</strong>
          <span>Fused {hover.node.fused_risk.toFixed(1)}%</span>
          <span>Risk {hover.node.risk_score.toFixed(1)}%</span>
          <span>Anomaly {hover.node.anomaly_score.toFixed(2)}</span>
          <span className={`status ${hover.node.health}`}>
            <span className="status-dot" />
            {hover.node.health}
          </span>
        </div>
      ) : null}
    </div>
  )
}

