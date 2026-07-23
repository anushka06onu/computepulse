import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Download, Sparkles, XCircle } from 'lucide-react'
import { api, downloadCsv, type PlacementResponse } from '../api/client'
import { useApp } from '../context/AppContext'
import { Reveal } from '../components/Reveal'
import { scaleIn } from '../motion/presets'

export function PlacementPage() {
  const { seed, health } = useApp()
  const [n, setN] = useState(5)
  const [data, setData] = useState<PlacementResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (health && !health.ready) return
    let cancelled = false
    api
      .placement(n, seed)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [n, seed, health])

  if (error) return <p className="banner">{error}</p>
  if (!data) return <div className="skeleton" style={{ height: 240 }} />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Sparkles size={12} /> Recommendations
          </div>
          <h1>Smart Job Placement</h1>
          <p>
            Policy <strong style={{ color: 'var(--ink)' }}>{data.policy ?? 'risk_anomaly_v2'}</strong>{' '}
            ranks by fused risk + anomaly + history. Failure risk ↔ fail correlation{' '}
            <strong style={{ color: 'var(--ink)' }}>
              r = {data.correlation.toFixed(3)}
            </strong>
            {data.lift
              ? ` · offline lift ${(data.lift.relative_reduction_vs_risk_only * 100).toFixed(1)}% vs risk-only`
              : ''}
            .
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-ghost"
            onClick={() =>
              downloadCsv('placement.csv', [
                ...data.recommended.map((r) => ({ side: 'recommend', ...r })),
                ...data.avoid.map((r) => ({ side: 'avoid', ...r })),
              ] as Record<string, unknown>[])
            }
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <Reveal>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
              <h2>How many machines?</h2>
            </div>
            <div className="range-row">
              <input
                type="range"
                min={3}
                max={20}
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
              />
              <span className="range-value">{n}</span>
            </div>
          </div>
        </div>

        {data.top_pick && data.avoid.length ? (
          <motion.div
            className="action-card"
            variants={scaleIn}
            initial="hidden"
            animate="visible"
          >
            <div className="action-card-head">
              <span className="action-badge">Recommended action</span>
              <span className="action-delta">
                +
                {(
                  (data.top_pick.score ?? 100 - data.top_pick.risk_score) -
                  (data.avoid[0].score ?? 100 - data.avoid[0].risk_score)
                ).toFixed(1)}{' '}
                pts score
              </span>
            </div>
            <div className="action-move">
              <div className="action-node from">
                <span className="action-node-label">Move workload off</span>
                <Link to={`/app/nodes/${data.avoid[0].node_id}`}>
                  Node {data.avoid[0].node_id}
                </Link>
                <span className="action-node-risk critical">
                  fused {data.avoid[0].fused_risk?.toFixed(1) ?? data.avoid[0].risk_score}%
                </span>
              </div>
              <motion.div
                className="action-arrow"
                aria-hidden
                animate={
                  typeof window !== 'undefined' &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? undefined
                    : { x: [0, 6, 0] }
                }
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <ArrowRight size={22} />
              </motion.div>
              <div className="action-node to">
                <span className="action-node-label">Onto</span>
                <Link to={`/app/nodes/${data.top_pick.node_id}`}>
                  Node {data.top_pick.node_id}
                </Link>
                <span className="action-node-risk healthy">
                  score {data.top_pick.score?.toFixed(1) ?? '—'}
                </span>
              </div>
            </div>
            <p className="action-foot">
              <CheckCircle2 size={14} color="var(--color-healthy)" />
              {data.top_pick.actual_failure_rate != null
                ? `Target node's historical failure rate is ${(data.top_pick.actual_failure_rate * 100).toFixed(1)}%.`
                : 'Target node is the lowest-risk machine in this snapshot.'}
            </p>
          </motion.div>
        ) : null}
      </Reveal>

      <div className="grid-2 placement-boards">
        <Reveal delay={0.1}>
          <div className="panel" style={{ marginBottom: 0, height: '100%' }}>
            <div className="panel-inner-core">
              <div className="panel-header">
                <div>
                  <h2>
                    <CheckCircle2
                      size={16}
                      style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-healthy)' }}
                    />
                    Recommended now
                  </h2>
                  <p className="panel-sub">Highest placement score (safety + normality + history)</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th>Score</th>
                      <th>Fused %</th>
                      <th>Risk %</th>
                      <th>Components</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recommended.map((r) => (
                      <tr key={r.node_id}>
                        <td>
                          <Link to={`/app/nodes/${r.node_id}`}>{r.node_id}</Link>
                        </td>
                        <td>{r.score ?? '—'}</td>
                        <td>{r.fused_risk ?? '—'}</td>
                        <td>{r.risk_score}</td>
                        <td style={{ fontSize: 12 }}>
                          {r.components
                            ? `S${r.components.safety} N${r.components.normality} H${r.components.history}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="panel" style={{ marginBottom: 0, height: '100%' }}>
            <div className="panel-inner-core">
              <div className="panel-header">
                <div>
                  <h2>
                    <XCircle
                      size={16}
                      style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-critical)' }}
                    />
                    Machines to avoid
                  </h2>
                  <p className="panel-sub">Lowest placement score</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th>Score</th>
                      <th>Fused %</th>
                      <th>Risk %</th>
                      <th>Components</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.avoid.map((r) => (
                      <tr key={r.node_id}>
                        <td>
                          <Link to={`/app/nodes/${r.node_id}`}>{r.node_id}</Link>
                        </td>
                        <td>{r.score ?? '—'}</td>
                        <td>{r.fused_risk ?? '—'}</td>
                        <td>{r.risk_score}</td>
                        <td style={{ fontSize: 12 }}>
                          {r.components
                            ? `S${r.components.safety} N${r.components.normality} H${r.components.history}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}



