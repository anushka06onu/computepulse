import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Server, Wallet } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'framer-motion'
import { api, downloadCsv, type OptimizeResponse } from '../api/client'
import { useApp } from '../context/AppContext'
import { KPI, CountUp } from '../components/KPI'
import { Reveal } from '../components/Reveal'
import { ChartTooltip } from '../components/ChartTooltip'
import { staggerContainer } from '../motion/presets'

export function OptimizePage() {
  const { health, seed, watch } = useApp()
  const [data, setData] = useState<OptimizeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (health && !health.ready) return
    api
      .optimize(seed, watch)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [health, seed, watch])

  if (error) return <p className="banner">{error}</p>
  if (!data) return <div className="skeleton" style={{ height: 240 }} />

  const chart = data.opportunities.slice(0, 15).map((o) => ({
    node: String(o.node_id),
    savings: o.estimated_savings_usd,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Wallet size={12} /> Savings
          </div>
          <h1>Cost Optimization</h1>
          <p>
            Policy {data.policy ?? 'safe_reclaim_v1'}: reclaim only when fused risk
            &lt; watch ({data.summary.watch_threshold ?? 40}). Underutilized = avg
            GPU below {data.summary.underutilized_threshold_pct.toFixed(0)}%. Dollar
            estimate assumes ${data.summary.assumed_cost_per_gpu_hour.toFixed(2)}
            /GPU-hour (assumption, not Alibaba ground truth).
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-ghost"
            onClick={() =>
              downloadCsv(
                'optimize.csv',
                data.opportunities as unknown as Record<string, unknown>[],
              )
            }
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <motion.div
        className="kpi-grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <KPI
          label="Machines analyzed"
          value={<CountUp end={data.summary.total_machines_analyzed} />}
          icon={<Server size={16} />}
        />
        <KPI
          label="Underutilized"
          value={<CountUp end={data.summary.underutilized_machines} />}
          tone="watch"
          icon={<Wallet size={16} />}
        />
        <KPI
          label="Est. total savings"
          value={<CountUp end={Math.round(data.summary.total_estimated_savings_usd)} prefix="$" />}
          tone="healthy"
        />
      </motion.div>

      <Reveal delay={0.1}>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
          <div>
            <h2>Top 15 by estimated savings</h2>
            <p className="panel-sub">Highest reclaimable GPU-hour opportunity</p>
          </div>
        </div>
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer>
                <BarChart data={chart} margin={{ bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="node"
                    tick={{ fontSize: 10, fill: 'var(--ink-muted)' }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-elevated)' }} />
                  <Bar dataKey="savings" fill="url(#savingsGradient)" radius={[6, 6, 0, 0]} />
                  <defs>
                    <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-healthy)" stopOpacity={1}/>
                      <stop offset="100%" stopColor="var(--color-healthy)" stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
          <div>
            <h2>Ranked opportunities</h2>
            <p className="panel-sub">Real machines, real utilization</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>Action</th>
                <th>Fused %</th>
                <th>Avg GPU %</th>
                <th>Avg CPU %</th>
                <th>Idle hours (est.)</th>
                <th>Savings ($)</th>
                </tr>
              </thead>
              <tbody>
                {data.opportunities.map((o) => (
                  <tr key={o.node_id}>
                    <td>
                      <Link to={`/app/nodes/${o.node_id}`}>{o.node_id}</Link>
                    </td>
                    <td>
                      <span
                        className={`chip${o.action === 'reclaim' ? ' active' : ''}`}
                      >
                        {o.action ?? '—'}
                      </span>
                    </td>
                    <td>{o.fused_risk ?? '—'}</td>
                    <td>{o.avg_gpu_usage_pct}</td>
                    <td>{o.avg_cpu_usage_pct}</td>
                    <td>{o.estimated_idle_hours}</td>
                    <td>{o.estimated_savings_usd.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </Reveal>
    </div>
  )
}

