import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  Download,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { api, downloadCsv, type DailyBriefAction, type DailyBriefResponse } from '../api/client'
import { useApp } from '../context/AppContext'
import {
  briefSummaryText,
  filterBriefActions,
  primaryCtas,
  type BriefFilter,
} from '../lib/dailyBrief'
import { KPI } from './KPI'

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const SEVERITY_LABEL: Record<string, string> = {
  conflict: 'Conflict',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function SeverityPip({ action }: { action: DailyBriefAction }) {
  const tone = action.severity_tone ?? (action.has_conflict ? 'watch' : 'healthy')
  const label = SEVERITY_LABEL[action.severity ?? 'low'] ?? 'Low'
  return (
    <span className={`dab-sev dab-sev-${tone}`} title={`Severity: ${label}`}>
      <span className="dab-sev-dot" aria-hidden />
      {label}
    </span>
  )
}

function ActionCard({ action }: { action: DailyBriefAction }) {
  const conflict = action.conflict ?? action.conflicts?.[0] ?? null
  const ctas = primaryCtas(action)

  return (
    <article className={`dab-card${action.has_conflict ? ' is-conflict' : ''}`}>
      <div className="dab-card-top">
        <div className="dab-rank" aria-label={`Rank ${action.rank}`}>
          #{action.rank}
        </div>
        <div className="dab-card-head">
          <h3 className="dab-action-title">{action.action_text}</h3>
          <div className="dab-meta">
            <SeverityPip action={action} />
            <span className="dab-chip">Node {action.node_id}</span>
            {action.priority_score != null && (
              <span className="dab-chip">
                Priority {action.priority_score.toFixed(0)}
              </span>
            )}
            {typeof action.error_count === 'number' && (
              <span className="dab-chip">Errors {action.error_count}</span>
            )}
            {typeof action.queue_length === 'number' && (
              <span className="dab-chip">Queue {action.queue_length}</span>
            )}
          </div>
        </div>
      </div>

      <div className="dab-signals">
        <div className="dab-signal">
          <div className="dab-signal-label">Model 1 · Failure risk</div>
          <div
            className={`dab-signal-value${action.risk_score > 60 ? ' critical' : ''}`}
          >
            {action.risk_score.toFixed(0)}%
          </div>
        </div>
        <div className="dab-signal">
          <div className="dab-signal-label">Model 2 · Hist. fail rate</div>
          <div className="dab-signal-value">
            {action.avg_risk_score.toFixed(0)}%
          </div>
        </div>
        <div className="dab-signal">
          <div className="dab-signal-label">
            {action.is_underutilized ? 'Model 3 · Est. savings' : 'Model 3 · GPU util'}
          </div>
          <div
            className={`dab-signal-value${action.is_underutilized ? ' healthy' : ''}`}
          >
            {action.is_underutilized
              ? money(action.estimated_savings_usd)
              : `${action.gpu_usage_pct.toFixed(0)}%`}
          </div>
        </div>
      </div>

      <div className="dab-reason">
        <Lightbulb size={16} style={{ color: 'var(--watch)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Reason · </strong>
          {action.reason}
        </div>
      </div>

      {conflict && (
        <div className="dab-conflict-split" role="group" aria-label="Model disagreement">
          <div className="dab-view a">
            <div className="dab-view-model">{conflict.model_a}</div>
            <div className="dab-view-says">{conflict.model_a_says}</div>
          </div>
          <div className="dab-view b">
            <div className="dab-view-model">{conflict.model_b}</div>
            <div className="dab-view-says">{conflict.model_b_says}</div>
          </div>
        </div>
      )}

      <div className="dab-ctas">
        {ctas.map((c) => (
          <Link
            key={c.to + c.label}
            to={c.to}
            className={c.tone === 'primary' ? 'btn btn-primary dab-cta' : 'btn dab-cta'}
          >
            {c.label}
          </Link>
        ))}
      </div>
    </article>
  )
}

type Props = {
  /** Compact mode when embedded on Fleet (hides long how-to). */
  embedded?: boolean
}

export function DailyActionBrief({ embedded = false }: Props) {
  const { seed, refresh } = useApp()
  const [data, setData] = useState<DailyBriefResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<BriefFilter>('all')
  const [copied, setCopied] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const hasDataRef = useRef(false)

  const load = useCallback(() => {
    // Keep prior KPIs/cards visible while refreshing (no blank flash).
    if (!hasDataRef.current) setLoading(true)
    setError(null)
    let cancelled = false
    api
      .dailyBrief(seed)
      .then((d) => {
        if (cancelled) return
        hasDataRef.current = true
        setData(d)
        setGeneratedAt(new Date())
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [seed, reloadKey])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  const visible = useMemo(
    () => (data ? filterBriefActions(data.actions, filter) : []),
    [data, filter],
  )

  async function onCopy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(briefSummaryText(data))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  function onExport() {
    if (!data) return
    downloadCsv(
      `computepulse-daily-brief-${seed}.csv`,
      data.actions.map((a) => ({
        rank: a.rank,
        node_id: a.node_id,
        action: a.action_text,
        reason: a.reason,
        severity: a.severity ?? '',
        risk_score: a.risk_score,
        hist_fail_rate: a.avg_risk_score,
        gpu_usage_pct: a.gpu_usage_pct,
        estimated_savings_usd: a.estimated_savings_usd,
        has_conflict: a.has_conflict,
        conflict_type: a.conflict?.type ?? '',
        priority_score: a.priority_score ?? '',
      })),
    )
  }

  async function onRefresh() {
    await refresh()
    setReloadKey((k) => k + 1)
  }

  if (error) {
    return (
      <div className="dab dab-frame panel">
        <div className="panel-inner-core">
          <div className="panel-header" style={{ color: 'var(--critical)' }}>
            <AlertTriangle size={18} />
            <h2>Daily Action Brief failed to load</h2>
          </div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="dab dab-frame panel" aria-busy="true">
        <div className="panel-inner-core stack">
          <div className="skeleton" style={{ height: 84 }} />
          <div className="skeleton" style={{ height: 96 }} />
          <div className="skeleton" style={{ height: 190 }} />
          <div className="skeleton" style={{ height: 190 }} />
        </div>
      </div>
    )
  }

  const conflictCount = data.total_conflicts ?? data.conflicts.length
  const timeLabel = generatedAt
    ? generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <motion.section
      className="dab dab-frame"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      aria-labelledby="dab-title"
    >
      <div className="dab-hero">
        <div>
          <div className="page-eyebrow">
            <ClipboardList size={12} /> Morning plan · three models → one list
            {timeLabel ? ` · generated ${timeLabel}` : ''}
            {` · seed ${seed}`}
          </div>
          <h2 id="dab-title">Daily Action Brief</h2>
          <p>
            Top five actions across{' '}
            {data.fleet_nodes ? data.fleet_nodes.toLocaleString() : 'the'} real
            fleet nodes, ranked from failure risk, placement history, and idle-GPU
            signals. Conflicts are flagged — never hidden.
          </p>
        </div>
        <div className="dab-toolbar">
          <div className="dab-pill-row">
            <span className="dab-pill">
              <Sparkles size={12} />{' '}
              {data.fleet_nodes
                ? `${data.fleet_nodes.toLocaleString()} nodes scored`
                : 'Fleet scored'}
            </span>
            <span className={`dab-pill${conflictCount > 0 ? ' amber' : ' healthy'}`}>
              <ShieldAlert size={12} /> {conflictCount} conflict
              {conflictCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="dab-actions-bar">
            <button type="button" className="btn" onClick={onRefresh} title="Refresh fleet seed and rebuild brief">
              <RefreshCw size={14} /> Refresh
            </button>
            <button type="button" className="btn" onClick={onCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn" onClick={onExport}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <KPI
          label="Actions to review"
          value={String(data.total_actions)}
          icon={<ClipboardList size={16} />}
          tone="watch"
        />
        <KPI
          label="Conflicts flagged"
          value={String(conflictCount)}
          icon={<ShieldAlert size={16} />}
          tone={conflictCount > 0 ? 'critical' : 'healthy'}
        />
        <KPI
          label="Est. savings in top 5"
          value={money(data.total_savings)}
          icon={<Sparkles size={16} />}
          tone="healthy"
        />
      </div>

      <div className="dab-filter-row" role="tablist" aria-label="Brief filter">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`dab-filter${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All actions ({data.actions.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'conflicts'}
          className={`dab-filter${filter === 'conflicts' ? ' is-active' : ''}`}
          onClick={() => setFilter('conflicts')}
        >
          Conflicts only ({data.actions.filter((a) => a.has_conflict).length})
        </button>
      </div>

      <div className="dab-list">
        {visible.length === 0 ? (
          <div className="panel">
            <div className="panel-inner-core">
              <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
                No conflicted actions in the top five for this seed. Switch to
                “All actions” or hit Refresh for a new scenario.
              </p>
            </div>
          </div>
        ) : (
          visible.map((action) => (
            <ActionCard key={`${action.rank}-${action.node_id}`} action={action} />
          ))
        )}
      </div>

      {!embedded && (
        <div className="dab-howto">
          <h3>How to use this brief</h3>
          <ol>
            <li>
              Start at <strong>#1</strong> — highest priority across all three models.
            </li>
            <li>
              Amber <strong>Conflict</strong> cards show both model views inline — decide with
              eyes open, then Inspect the node.
            </li>
            <li>
              Use <strong>Refresh</strong> to load a new fleet seed (same control as Fleet).
            </li>
            <li>
              <strong>Copy</strong> / <strong>Export CSV</strong> for judges or your ops channel.
            </li>
          </ol>
        </div>
      )}

      {data.caveat && <p className="dab-caveat">{data.caveat}</p>}
    </motion.section>
  )
}

