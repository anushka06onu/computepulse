import { useEffect, useState } from 'react'
import { GitCompare } from 'lucide-react'
import { api, type NodeDetail } from '../api/client'
import { useApp } from '../context/AppContext'
import { StatusBadge } from '../components/StatusBadge'
import { Reveal } from '../components/Reveal'

export function ComparePage() {
  const { seed, critical, watch, health } = useApp()
  const [ids, setIds] = useState<number[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [results, setResults] = useState<NodeDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (health && !health.ready) return
    api
      .nodes(seed)
      .then((r) => setIds(r.node_ids.slice(0, 500)))
      .catch((e: Error) => setError(e.message))
  }, [seed, health])

  const toggle = (id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  const runCompare = async () => {
    if (selected.length < 2) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.compare(selected, seed, critical, watch)
      setResults(res.nodes)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <GitCompare size={12} /> Side-by-side
          </div>
          <h1>Compare Nodes</h1>
          <p>Select 2–3 machines for a side-by-side risk and telemetry view.</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            disabled={selected.length < 2 || busy}
            onClick={() => void runCompare()}
          >
            {busy ? 'Comparing…' : `Compare ${selected.length || ''}`}
          </button>
        </div>
      </div>

      {error ? <p className="banner">{error}</p> : null}

      <Reveal>
        <div className="panel">
          <div className="panel-inner-core">
            <div className="panel-header">
              <div>
                <h2>Select nodes</h2>
                <p className="panel-sub">
                  Selected: {selected.length ? selected.join(', ') : 'none'} (max 3)
                </p>
              </div>
              {selected.length ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
                  Clear
                </button>
              ) : null}
            </div>
            <div className="node-pick-grid">
              {ids.map((id) => (
                <button
                  key={id}
                  className={`chip${selected.includes(id) ? ' active' : ''}`}
                  onClick={() => toggle(id)}
                  style={{ justifyContent: 'center' }}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {results ? (
        <Reveal delay={0.1}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${results.length}, 1fr)`,
              gap: 16,
            }}
          >
            {results.map((n) => (
              <div className="panel" key={n.node_id} style={{ marginBottom: 0 }}>
                <div className="panel-inner-core">
                  <div className="panel-header">
                    <div>
                      <h2>Node {n.node_id}</h2>
                      <p className="panel-sub">
                        <StatusBadge health={n.health} /> · {n.risk_score.toFixed(1)}%
                        risk
                      </p>
                    </div>
                  </div>
                  <div className="metric-list">
                    <div className="metric-row">
                      <span className="k">Failure rate</span>
                      <span className="v">
                        {(n.historical_failure_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="k">CPU %</span>
                      <span className="v">{n.snapshot.cpu_usage_pct}</span>
                    </div>
                    <div className="metric-row">
                      <span className="k">GPU %</span>
                      <span className="v">{n.snapshot.gpu_usage_pct}</span>
                    </div>
                    <div className="metric-row">
                      <span className="k">Mem pressure</span>
                      <span className="v">{n.snapshot.mem_pressure}</span>
                    </div>
                    <div className="metric-row">
                      <span className="k">Instances</span>
                      <span className="v">{n.instance_count}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      ) : (
        <Reveal delay={0.1}>
          <div className="panel empty-state">
            <div className="panel-inner-core empty-state">
              <GitCompare size={32} />
              <p style={{ margin: 0, marginTop: 16 }}>
                Pick at least two nodes, then hit Compare.
              </p>
            </div>
          </div>
        </Reveal>
      )}
    </div>
  )
}
