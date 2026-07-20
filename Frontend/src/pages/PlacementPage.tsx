import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Download, Sparkles, XCircle } from 'lucide-react'
import { api, downloadCsv, type PlacementResponse } from '../api/client'
import { useApp } from '../context/AppContext'
import { Reveal } from '../components/Reveal'

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
            Model 2 ranks machines by aggregated Model 1 risk — correlated at{' '}
            <strong style={{ color: 'var(--ink)' }}>
              r = {data.correlation.toFixed(3)}
            </strong>{' '}
            with observed failure rates.
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
          <div className="action-card">
            <div className="action-card-head">
              <span className="action-badge">Recommended action</span>
              <span className="action-delta">
                −{(data.avoid[0].risk_score - data.top_pick.risk_score).toFixed(1)} pts
                risk
              </span>
            </div>
            <div className="action-move">
              <div className="action-node from">
                <span className="action-node-label">Move workload off</span>
                <Link to={`/app/nodes/${data.avoid[0].node_id}`}>
                  Node {data.avoid[0].node_id}
                </Link>
                <span className="action-node-risk critical">
                  {data.avoid[0].risk_score.toFixed(1)}% risk
                </span>
              </div>
              <div className="action-arrow" aria-hidden>
                <ArrowRight size={22} />
              </div>
              <div className="action-node to">
                <span className="action-node-label">Onto</span>
                <Link to={`/app/nodes/${data.top_pick.node_id}`}>
                  Node {data.top_pick.node_id}
                </Link>
                <span className="action-node-risk healthy">
                  {data.top_pick.risk_score.toFixed(1)}% risk
                </span>
              </div>
            </div>
            <p className="action-foot">
              <CheckCircle2 size={14} color="var(--color-healthy)" />
              {data.top_pick.actual_failure_rate != null
                ? `Target node's historical failure rate is ${(data.top_pick.actual_failure_rate * 100).toFixed(1)}%.`
                : 'Target node is the lowest-risk machine in this snapshot.'}
            </p>
          </div>
        ) : null}
      </Reveal>

      <div className="grid-2">
        <Reveal delay={0.1}>
          <div className="panel">
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
              <p className="panel-sub">Lowest risk machines for the next job</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Risk %</th>
                  <th>CPU %</th>
                  <th>GPU %</th>
                </tr>
              </thead>
              <tbody>
                {data.recommended.map((r) => (
                  <tr key={r.node_id}>
                    <td>
                      <Link to={`/app/nodes/${r.node_id}`}>{r.node_id}</Link>
                    </td>
                    <td>{r.risk_score}</td>
                    <td>{r.cpu_usage_pct}</td>
                    <td>{r.gpu_usage_pct}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </div>
        </Reveal>
        
        <Reveal delay={0.2}>
          <div className="panel">
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
              <p className="panel-sub">Highest risk right now</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Risk %</th>
                  <th>CPU %</th>
                  <th>GPU %</th>
                </tr>
              </thead>
              <tbody>
                {data.avoid.map((r) => (
                  <tr key={r.node_id}>
                    <td>
                      <Link to={`/app/nodes/${r.node_id}`}>{r.node_id}</Link>
                    </td>
                    <td>{r.risk_score}</td>
                    <td>{r.cpu_usage_pct}</td>
                    <td>{r.gpu_usage_pct}</td>
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
