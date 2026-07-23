import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { api, type ExplainResponse, type NodeDetail } from '../api/client'
import { useApp } from '../context/AppContext'
import { KPI } from '../components/KPI'
import { Reveal } from '../components/Reveal'
import { ChartTooltip } from '../components/ChartTooltip'
import { staggerContainer } from '../motion/presets'

export function NodePage() {
  const { nodeId } = useParams()
  const navigate = useNavigate()
  const { seed, critical, watch, health } = useApp()
  const [ids, setIds] = useState<number[]>([])
  const [data, setData] = useState<NodeDetail | null>(null)
  const [brief, setBrief] = useState<ExplainResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (health && !health.ready) return
    api
      .nodes(seed)
      .then((r) => {
        setIds(r.node_ids)
        if (!nodeId && r.node_ids.length) {
          navigate(`/app/nodes/${r.node_ids[0]}`, { replace: true })
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [seed, health, nodeId, navigate])

  useEffect(() => {
    if (!nodeId || (health && !health.ready)) return
    let cancelled = false
    setData(null)
    setBrief(null)
    // Paint KPIs fast, then upgrade with SHAP/forecast + AI brief
    api
      .node(Number(nodeId), seed, critical, watch, { light: true })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    api
      .node(Number(nodeId), seed, critical, watch, { forecast: true })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        /* keep light payload */
      })
    const t = window.setTimeout(() => {
      api
        .explain(Number(nodeId), seed, critical, watch)
        .then((b) => {
          if (!cancelled) setBrief(b)
        })
        .catch(() => {
          /* optional */
        })
    }, 50)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [nodeId, seed, critical, watch, health])

  const filteredIds = useMemo(() => {
    if (!query.trim()) return ids.slice(0, 200)
    return ids.filter((id) => String(id).includes(query.trim())).slice(0, 200)
  }, [ids, query])

  const shapData = useMemo(() => {
    if (!data) return []
    return [...data.shap].sort((a, b) => a.impact - b.impact)
  }, [data])

  if (error) return <p className="banner">{error}</p>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Search size={12} /> Explorer
          </div>
          <h1>Node Explorer</h1>
          <p>
            Inspect a real machine: snapshot metrics, failure history, and local
            SHAP explanation.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Reveal>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-inner-core">
              <div className="panel-header">
                <h2>Select machine</h2>
              </div>
              <div className="field">
                <label>Search node ID</label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type an ID to filter…"
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Machine</label>
                <select
                  value={nodeId ?? ''}
                  onChange={(e) => navigate(`/app/nodes/${e.target.value}`)}
                >
                  {filteredIds.map((id) => (
                    <option key={id} value={id}>
                      Node {id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Reveal>

        {data ? (
          <motion.div
            className="kpi-grid"
            style={{ marginBottom: 0, gridTemplateColumns: '1fr 1fr' }}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <KPI label="Risk" value={`${data.risk_score.toFixed(1)}%`} />
            <KPI label="Anomaly" value={data.anomaly_score.toFixed(2)} />
            <KPI label="Fused" value={`${data.fused_risk.toFixed(1)}%`} tone="watch" />
            <KPI
              label="Health"
              value={
                <span className={`kpi-status ${data.health}`}>
                  <span className="kpi-status-dot" aria-hidden />
                  {data.health === 'critical'
                    ? 'Critical'
                    : data.health === 'watch'
                      ? 'Watch'
                      : 'Healthy'}
                </span>
              }
              tone={
                data.health === 'critical'
                  ? 'critical'
                  : data.health === 'watch'
                    ? 'watch'
                    : 'healthy'
              }
            />
            <KPI
              label="Fleet rank"
              value={`#${data.fleet_rank}`}
            />
            <KPI
              label="Historical failure"
              value={`${(data.historical_failure_rate * 100).toFixed(1)}%`}
              tone="watch"
            />
          </motion.div>
        ) : (
          <div className="skeleton" style={{ height: 180, marginBottom: 0 }} />
        )}
      </div>

      {data && brief ? (
        <Reveal delay={0.05}>
          <div className="panel">
            <div className="panel-inner-core">
              <div className="panel-header">
                <div>
                  <h2>AI brief</h2>
                  <p className="panel-sub">
                    {brief.llm_used ? 'Groq rewrite' : 'Template'} ·{' '}
                    {brief.embedding_used ? 'HF neighbors' : 'sklearn neighbors'}
                    {data.model_version ? ` · ${data.model_version}` : ''}
                  </p>
                </div>
              </div>
              <p style={{ marginTop: 0 }}>{brief.summary}</p>
              <div className="demo-chips" style={{ marginBottom: 12 }}>
                {brief.shap_reasons.map((r) => (
                  <span className="demo-chip" key={r}>
                    {r}
                  </span>
                ))}
              </div>
              {brief.neighbors.length ? (
                <p className="caption" style={{ marginBottom: 0 }}>
                  Similar failed nodes:{' '}
                  {brief.neighbors
                    .map(
                      (n) =>
                        `${n.node_id} (risk ${n.risk_score}%, fail ${(n.historical_failure_rate * 100).toFixed(0)}%)`,
                    )
                    .join(' · ')}
                </p>
              ) : null}
              <p className="caption">{brief.caveat}</p>
            </div>
          </div>
        </Reveal>
      ) : data ? (
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
              <div>
                <h2>AI brief</h2>
                <p className="panel-sub">Loading grounded brief…</p>
              </div>
            </div>
            <div className="skeleton" style={{ height: 64 }} />
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <Reveal delay={0.1}>
            <div className="grid-2">
              <div className="panel">
                <div className="panel-inner-core">
                  <div className="panel-header">
                    <div>
                      <h2>Current snapshot</h2>
                      <p className="panel-sub">Real values from this resample</p>
                    </div>
                  </div>
              <div className="metric-list">
                {[
                  ['CPU usage %', data.snapshot.cpu_usage_pct],
                  ['GPU usage %', data.snapshot.gpu_usage_pct],
                  ['Memory pressure', data.snapshot.mem_pressure],
                  ['GPU memory pressure', data.snapshot.gpu_mem_pressure],
                  ['I/O ops total', data.snapshot.io_ops_total],
                  [
                    'Duration (hrs)',
                    data.snapshot.duration_hours ?? 'unknown',
                  ],
                  ['Last real status', data.snapshot.status],
                ].map(([k, v]) => (
                  <div className="metric-row" key={String(k)}>
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-inner-core">
                  <div className="panel-header">
                    <div>
                      <h2>Why this risk?</h2>
                      <p className="panel-sub">Local SHAP for this machine</p>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 320 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={shapData}
                        layout="vertical"
                        margin={{ left: 8, right: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="feature"
                          width={118}
                          tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-elevated)' }} />

                        <Bar
                          dataKey="impact"
                          radius={[0, 6, 6, 0]}
                          isAnimationActive
                          animationDuration={700}
                          animationEasing="ease-out"
                        >
                          {shapData.map((s) => (
                            <Cell
                              key={s.feature}
                              fill={s.impact > 0 ? 'var(--color-critical)' : 'var(--color-healthy)'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="caption">
                    Positive pushes toward risk; negative toward healthy.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="panel">
              <div className="panel-inner-core">
                <div className="panel-header">
                  <div>
                    <h2>Risk over time — Node {data.node_id}</h2>
                    <p className="panel-sub">
                      Observed risk with dashed short-horizon forecast
                    </p>
                  </div>
                </div>
                {data.timeline.length >= 2 ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <AreaChart
                        data={data.timeline}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor="var(--color-accent)"
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="100%"
                              stopColor="var(--color-accent)"
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="index"
                          tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<TimelineTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="risk_score"
                          name="Risk %"
                          stroke="var(--color-accent)"
                          strokeWidth={2}
                          fill="url(#riskFill)"
                          connectNulls={false}
                          isAnimationActive
                        />
                        <Line
                          type="monotone"
                          dataKey="forecast_risk"
                          name="Forecast"
                          stroke="var(--color-watch)"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={false}
                          connectNulls
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="caption">
                    Only {data.timeline.length} instance on record — not enough for
                    a trend line.
                  </p>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="panel">
              <div className="panel-inner-core">
                <div className="panel-header">
                  <div>
                    <h2>Recent history — Node {data.node_id}</h2>
                    <p className="panel-sub">Last 20 real instances on this machine</p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>CPU %</th>
                        <th>GPU %</th>
                        <th>Mem pressure</th>
                        <th>Duration</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((h, i) => (
                        <tr key={i}>
                          <td>{h.cpu_usage_pct}</td>
                          <td>{h.gpu_usage_pct}</td>
                          <td>{h.mem_pressure}</td>
                          <td>{h.duration_hours}</td>
                          <td>{h.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Reveal>
        </>
      ) : null}
    </div>
  )
}

type TimelineTooltipProps = {
  active?: boolean
  payload?: Array<{
    payload?: {
      risk_score: number | null
      forecast_risk?: number | null
      status: string
      index: number
    }
  }>
}

function TimelineTooltip({ active, payload }: TimelineTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  const val = p.forecast_risk ?? p.risk_score
  return (
    <div className="chart-tooltip-box">
      <p className="chart-tooltip-label">Instance #{p.index}</p>
      <div className="chart-tooltip-row">
        <span>{p.forecast_risk != null ? 'Forecast' : 'Risk'}</span>
        <strong>{val != null ? `${val.toFixed(1)}%` : '—'}</strong>
      </div>
      <div className="chart-tooltip-row">
        <span>Status</span>
        <strong>{p.status}</strong>
      </div>
    </div>
  )
}



