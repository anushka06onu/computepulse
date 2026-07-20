import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  Download,
  Eye,
  Server,
} from 'lucide-react'
import { api, downloadCsv, type FleetNode, type FleetSnapshot } from '../api/client'
import { useApp } from '../context/AppContext'
import { KPI, CountUp } from '../components/KPI'
import { DataTable } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { HealthGauge } from '../components/HealthGauge'
import { Reveal } from '../components/Reveal'
import { ChartTooltip } from '../components/ChartTooltip'
import { staggerContainer } from '../motion/presets'

export function FleetPage() {
  const { seed, critical, watch, health } = useApp()
  const [data, setData] = useState<FleetSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'critical' | 'watch' | 'healthy'>(
    'all',
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

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.nodes
    return data.nodes.filter((n) => n.health === filter)
  }, [data, filter])

  const hist = useMemo(() => {
    if (!data) return []
    const bins = Array.from({ length: 20 }, (_, i) => ({
      bin: `${i * 5}`,
      count: 0,
    }))
    for (const n of data.nodes) {
      const idx = Math.min(19, Math.floor(n.risk_score / 5))
      bins[idx].count += 1
    }
    return bins
  }, [data])

  if (error) return <p className="banner">{error}</p>
  if (!data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 28, width: 260 }} />
        <div className="kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 110 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Activity size={12} /> Monitoring
          </div>
          <h1>Fleet Overview</h1>
          <p>{data.caption}</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-ghost"
            onClick={() =>
              downloadCsv(
                'fleet-snapshot.csv',
                filtered as unknown as Record<string, unknown>[],
              )
            }
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="fleet-hero">
        <Reveal>
          <div className="panel gauge-panel">
            <div className="panel-inner-core gauge-panel-inner">
              <HealthGauge
                score={data.summary.health_score}
                grade={data.summary.grade}
              />
              <div className="gauge-copy">
                <h2>Fleet health score</h2>
                <p className="panel-sub">
                  100 minus the mean predicted failure risk across all{' '}
                  {data.summary.total_machines.toLocaleString()} machines in this
                  snapshot.
                </p>
                <div className="gauge-legend">
                  <span>
                    <i className="dot healthy" /> Healthy 70+
                  </span>
                  <span>
                    <i className="dot watch" /> Fair 55–69
                  </span>
                  <span>
                    <i className="dot critical" /> Poor &lt;55
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <motion.div
          className="kpi-grid fleet-kpis"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <KPI
            label="Total machines"
            value={<CountUp end={data.summary.total_machines} />}
            icon={<Server size={16} />}
          />
          <KPI
            label="Critical now"
            value={String(data.summary.critical)}
            tone="critical"
            icon={<AlertTriangle size={16} />}
          />
          <KPI
            label="Watch now"
            value={String(data.summary.watch)}
            tone="watch"
            icon={<Eye size={16} />}
          />
          <KPI
            label="Healthy now"
            value={String(data.summary.healthy)}
            tone="healthy"
            icon={<Activity size={16} />}
          />
        </motion.div>
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
      </div>

      <Reveal>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
              <div>
                <h2>Machines by risk</h2>
                <p className="panel-sub">
                  {filtered.length.toLocaleString()} shown · click a node to
                  inspect
                </p>
              </div>
            </div>
            <div style={{ maxHeight: 440, overflow: 'auto' }}>
              <DataTable<FleetNode & Record<string, unknown>>
                pulseCritical
                rows={filtered as (FleetNode & Record<string, unknown>)[]}
                columns={[
                  {
                    key: 'node_id',
                    label: 'Node',
                    render: (r) => (
                      <Link to={`/app/nodes/${r.node_id}`}>{r.node_id}</Link>
                    ),
                  },
                  { key: 'risk_score', label: 'Risk %' },
                  {
                    key: 'health',
                    label: 'Health',
                    render: (r) => <StatusBadge health={r.health} />,
                  },
                  { key: 'cpu_usage_pct', label: 'CPU %' },
                  { key: 'gpu_usage_pct', label: 'GPU %' },
                  { key: 'mem_pressure', label: 'Mem pressure' },
                  { key: 'duration_hours', label: 'Duration (hrs)' },
                  { key: 'status', label: 'Last status' },
                ]}
              />
            </div>
            <p className="caption">
              Duration −1 means no normal completion time was logged in the
              trace.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
              <div>
                <h2>Risk score distribution</h2>
                <p className="panel-sub">Histogram across the current snapshot</p>
              </div>
            </div>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={hist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="bin"
                    tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-elevated)' }} />
                  <Bar dataKey="count" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
