import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import {
  api,
  type WarningAlert,
  type WarningSeverity,
  type WarningsResponse,
} from '../api/client'
import { useApp } from '../context/AppContext'
import { KPI, CountUp } from '../components/KPI'
import { Reveal } from '../components/Reveal'
import { staggerContainer } from '../motion/presets'

type Filter = 'all' | WarningSeverity

export function WarningsPage() {
  const { seed, critical, watch, health } = useApp()
  const [data, setData] = useState<WarningsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WarningAlert | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = (rescan: boolean) => {
    if (health && !health.ready) return
    setError(null)
    setBusy(true)
    // Fast list first (no Groq/HF). Detail enrich on click.
    const req = rescan
      ? api.warningsRun(seed, critical, watch, 0)
      : api.warnings(seed, critical, watch, 0)
    req
      .then((d) => {
        setData(d)
        const first = d.alerts[0]?.id ?? null
        setSelectedId((prev) => prev ?? first)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, critical, watch, health])

  useEffect(() => {
    if (!selectedId || (health && !health.ready)) return
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    api
      .warning(selectedId, seed, critical, watch)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        if (!cancelled && data) {
          setDetail(data.alerts.find((a) => a.id === selectedId) ?? null)
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, seed, critical, watch, health, data])

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.alerts
    return data.alerts.filter((a) => a.severity === filter)
  }, [data, filter])

  const selected: WarningAlert | null =
    detail ??
    (data && selectedId
      ? (data.alerts.find((a) => a.id === selectedId) ?? null)
      : null)

  if (error) return <p className="banner">{error}</p>
  if (!data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 28, width: 220 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <p className="caption">Scanning warnings…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Bell size={12} /> Operator agent
          </div>
          <h1>Warnings Inbox</h1>
          <p>
            Triage desk over fused risk, forecast, drift, and unsafe reclaim —
            grounded briefs, not live remediation. {data.model_version}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => load(true)}
          >
            <RefreshCw size={16} />
            {busy ? 'Scanning…' : 'Rescan & log'}
          </button>
        </div>
      </div>

      <motion.div
        className="kpi-grid"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <KPI
          label="Active warnings"
          value={<CountUp end={data.counts.total} />}
          icon={<Bell size={16} />}
        />
        <KPI
          label="High"
          value={<CountUp end={data.counts.high} />}
          tone="critical"
          icon={<AlertTriangle size={16} />}
        />
        <KPI
          label="Medium"
          value={<CountUp end={data.counts.medium} />}
          tone="watch"
          icon={<ShieldAlert size={16} />}
        />
        <KPI
          label="Low"
          value={<CountUp end={data.counts.low} />}
          icon={<Sparkles size={16} />}
        />
      </motion.div>

      {data.drift?.high ? (
        <p className="banner" style={{ marginBottom: 16 }}>
          Drift elevated (PSI≈{data.drift.psi}).{' '}
          {data.drift.message ?? 'Review Evidence before trusting new thresholds.'}
        </p>
      ) : null}

      <div className="filters">
        {(
          [
            ['all', 'All'],
            ['high', 'High'],
            ['medium', 'Medium'],
            ['low', 'Low'],
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

      <div className="warnings-layout">
        <Reveal>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-inner-core">
              <div className="panel-header">
                <div>
                  <h2>Alerts</h2>
                  <p className="panel-sub">
                    {filtered.length} shown · briefs load on select
                  </p>
                </div>
              </div>
              <div className="warnings-list">
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`warning-row${selectedId === a.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <span className={`sev-pill ${a.severity}`}>{a.severity}</span>
                    <span className="warning-row-body">
                      <strong>{a.title}</strong>
                      <em>{a.type.replace(/_/g, ' ')}</em>
                    </span>
                    {a.scores.fused != null ? (
                      <span className="warning-fused">
                        {Number(a.scores.fused).toFixed(0)}%
                      </span>
                    ) : null}
                  </button>
                ))}
                {!filtered.length ? (
                  <p className="caption">No alerts for this filter.</p>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-inner-core">
              {selected ? (
                <>
                  <div className="panel-header">
                    <div>
                      <h2>{selected.title}</h2>
                      <p className="panel-sub">
                        <span className={`sev-pill ${selected.severity}`}>
                          {selected.severity}
                        </span>{' '}
                        {selected.type.replace(/_/g, ' ')}
                        {detailLoading
                          ? ' · loading brief…'
                          : selected.llm_used
                            ? ' · Groq'
                            : ' · Template'}
                        {selected.embedding_used ? ' · HF neighbors' : ''}
                      </p>
                    </div>
                  </div>
                  {detailLoading && !detail ? (
                    <div className="skeleton" style={{ height: 72, marginBottom: 12 }} />
                  ) : (
                    <p style={{ marginTop: 0 }}>{selected.summary}</p>
                  )}
                  {selected.reasons.length ? (
                    <div className="demo-chips" style={{ marginBottom: 12 }}>
                      {selected.reasons.map((r) => (
                        <span className="demo-chip" key={r}>
                          {r}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selected.neighbors.length ? (
                    <p className="caption">
                      Similar failed nodes:{' '}
                      {selected.neighbors
                        .map(
                          (n) =>
                            `${n.node_id} (${n.risk_score}%, fail ${(n.historical_failure_rate * 100).toFixed(0)}%)`,
                        )
                        .join(' · ')}
                    </p>
                  ) : null}
                  {selected.recommendation ? (
                    <div className="warning-rec">
                      <strong>Recommendation</strong>
                      <p>
                        {selected.recommendation.kind.replace(/_/g, ' ')}
                        {selected.recommendation.target_node_id != null
                          ? ` → Node ${selected.recommendation.target_node_id}`
                          : ''}
                        {selected.recommendation.placement_score != null
                          ? ` (score ${selected.recommendation.placement_score})`
                          : ''}
                      </p>
                      <p className="caption" style={{ marginBottom: 0 }}>
                        {selected.recommendation.caveat}
                      </p>
                    </div>
                  ) : null}
                  <div className="cta-row" style={{ marginTop: 16 }}>
                    {selected.node_id != null ? (
                      <Link
                        to={`/app/nodes/${selected.node_id}`}
                        className="btn btn-primary"
                      >
                        Open node
                      </Link>
                    ) : null}
                    <Link to="/app/placement" className="btn btn-ghost">
                      Placement
                    </Link>
                    <Link to="/app/optimize" className="btn btn-ghost">
                      Optimize
                    </Link>
                    <Link to="/app/evidence" className="btn btn-ghost">
                      Evidence
                    </Link>
                  </div>
                  <p className="caption">{selected.caveat}</p>
                </>
              ) : (
                <p className="caption">Select an alert to inspect.</p>
              )}
            </div>
          </div>
        </Reveal>
      </div>

      <p className="caption" style={{ marginTop: 16 }}>
        {data.caveat}
      </p>
    </div>
  )
}
