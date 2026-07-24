import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ListOrdered,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { HealthGauge } from '../components/HealthGauge'
import { CountUp } from '../components/KPI'
import type { DemoFit, DemoPlacement, DemoScenario } from '../api/client'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STEP_MS = 2200
const TOTAL = 6

function FitPanel({
  title,
  subtitle,
  fit,
  tone,
}: {
  title: string
  subtitle: string
  fit: DemoFit
  tone: 'critical' | 'healthy'
}) {
  return (
    <div className={`demo-fit-panel demo-fit-panel-${tone}`}>
      <div className="demo-fit-panel-head">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <p className="demo-fit-summary">{fit.summary}</p>
      <ul className="demo-fit-list">
        {fit.checks.map((c) => (
          <li
            key={c.key}
            className={c.met ? 'demo-fit-ok' : 'demo-fit-fail'}
          >
            <span className="demo-fit-icon" aria-hidden>
              {c.met ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
            </span>
            <div className="demo-fit-copy">
              <div className="demo-fit-row">
                <em>{c.label}</em>
                <span>
                  {c.actual}
                  <small> req {c.required}</small>
                </span>
              </div>
              <p>{c.why}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RunDemoPage() {
  const {
    health,
    demoScenario,
    demoReplayAt,
    demoRank,
    demoHistory,
    demoQueue,
    demoViewing,
    demoAutoRunning,
    demoBatchNote,
    ensureDemoScenario,
    seed,
    requestDemoReplay,
    placeNextJob,
    placeAllAtOnce,
    runQueueAuto,
    stopDemoAuto,
    addJobs,
    viewDemoHistory,
    clearDemoBatchNote,
  } = useApp()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!demoScenario)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [gaugeScore, setGaugeScore] = useState<number | null>(
    demoScenario?.health_before ?? null,
  )
  const playingRef = useRef(playing)
  const stepRef = useRef(step)
  const skipRequestedRef = useRef(false)
  playingRef.current = playing
  stepRef.current = step

  const busy = demoAutoRunning

  const live =
    demoScenario &&
    demoScenario.seed === seed &&
    (demoScenario.rank ?? 0) === demoRank
      ? demoScenario
      : null

  const data: DemoScenario | DemoPlacement | null = demoViewing ?? live

  const startPlayback = useCallback((before: number, after: number) => {
    setError(null)
    setGaugeScore(before)
    setStep(0)
    setPlaying(true)
    skipRequestedRef.current = false
    if (reduced) {
      setStep(TOTAL - 1)
      setPlaying(false)
      setGaugeScore(after)
    }
  }, [])

  // Load scenario for current seed + rank (live session only).
  useEffect(() => {
    if (health?.ready === false) return
    if (demoViewing) return
    if (busy) return
    let cancelled = false

    setLoading(true)
    ensureDemoScenario(seed, demoRank)
      .then((d) => {
        if (cancelled) return
        setLoading(false)
        startPlayback(d.health_before, d.health_after)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setLoading(false)
        setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [health?.ready, seed, demoRank, ensureDemoScenario, startPlayback, demoViewing, busy])

  useEffect(() => {
    if (demoScenario && demoScenario.seed === seed) setLoading(false)
  }, [demoScenario, seed])

  useEffect(() => {
    if (!demoReplayAt || !data) return
    startPlayback(data.health_before, data.health_after)
  }, [demoReplayAt, data, startPlayback])

  useEffect(() => {
    if (!data || !playing || reduced) return
    if (step >= TOTAL - 1) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setStep((s) => Math.min(TOTAL - 1, s + 1)), STEP_MS)
    return () => clearTimeout(id)
  }, [data, playing, step])

  useEffect(() => {
    if (!data || reduced) return
    if (step >= 4) {
      const id = setTimeout(() => setGaugeScore(data.health_after), 350)
      return () => clearTimeout(id)
    }
    setGaugeScore(data.health_before)
  }, [step, data])

  const waitPlaybackDone = useCallback(async () => {
    if (reduced) return
    const deadline = Date.now() + TOTAL * STEP_MS + 2000
    while (Date.now() < deadline) {
      if (skipRequestedRef.current) {
        skipRequestedRef.current = false
        return
      }
      if (!playingRef.current || stepRef.current >= TOTAL - 1) return
      await new Promise((r) => setTimeout(r, 150))
    }
  }, [])

  const replay = useCallback(() => {
    requestDemoReplay()
  }, [requestDemoReplay])

  const skip = useCallback(() => {
    if (!data) return
    setGaugeScore(data.health_after)
    setStep(TOTAL - 1)
    setPlaying(false)
    skipRequestedRef.current = true
  }, [data])

  const onPlaceNext = useCallback(async () => {
    setError(null)
    clearDemoBatchNote()
    setLoading(true)
    try {
      await placeNextJob()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Placement failed')
    } finally {
      setLoading(false)
    }
  }, [clearDemoBatchNote, placeNextJob])

  const onRunAuto = useCallback(async () => {
    setError(null)
    try {
      if (demoQueue.length === 0) addJobs(3)
      await runQueueAuto(waitPlaybackDone)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-run failed')
    }
  }, [addJobs, demoQueue.length, runQueueAuto, waitPlaybackDone])

  const onPlaceAll = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      if (demoQueue.length === 0) addJobs(3)
      await placeAllAtOnce()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch placement failed')
    } finally {
      setLoading(false)
    }
  }, [addJobs, demoQueue.length, placeAllAtOnce])

  const progress = useMemo(() => ((step + 1) / TOTAL) * 100, [step])
  const candidates = data?.candidates ?? []
  const savings = data?.cost_savings
  const req = data?.job.requirements
  const fromFit = data?.from.fit
  const toFit = data?.to.fit

  const sessionSavings = useMemo(
    () =>
      demoHistory.reduce(
        (sum, h) => sum + (h.cost_savings?.estimated_usd ?? 0),
        0,
      ),
    [demoHistory],
  )

  const claimedHosts = useMemo(() => {
    const ids = new Set<number>()
    for (const h of demoHistory) ids.add(h.to.node_id)
    return ids
  }, [demoHistory])

  if ((loading || !data) && !demoViewing && !error)
    return <div className="skeleton" style={{ height: 480 }} />

  if (!data && error) {
    return (
      <div className="demo-page">
        <p className="banner demo-inline-error" role="alert">
          {error}
        </p>
        <button className="btn btn-primary" onClick={() => setError(null)}>
          Dismiss
        </button>
      </div>
    )
  }

  if (!data) return <div className="skeleton" style={{ height: 480 }} />

  const show = (i: number) => step >= i
  const delta = data.health_after - data.health_before
  const rankLabel = (data.rank ?? demoRank) + 1
  const poolLabel = data.pool_size ?? '?'
  const viewingHistory = Boolean(demoViewing)

  return (
    <div className="demo-page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Play size={12} /> Placement session · Warnings critical #
            {rankLabel}/{poolLabel}
          </div>
          <h1>Run Demo</h1>
          <p>
            Queue jobs and place them onto safer hosts. Each recommend node
            hosts at most one job this session. Run auto plays the queue
            one-by-one; Place all at once commits the full queue instantly.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={skip} disabled={viewingHistory}>
            <SkipForward size={16} /> Skip
          </button>
          <button
            className="btn btn-ghost"
            onClick={replay}
            disabled={busy}
          >
            <RotateCcw size={16} /> Replay
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || viewingHistory}
            onClick={() => {
              void onPlaceNext()
            }}
          >
            <Play size={16} /> Place next job
          </button>
        </div>
      </div>

      {error ? (
        <p className="banner demo-inline-error" role="alert">
          {error}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      <section className="demo-session" aria-label="Placement session">
        <div className="demo-session-stats">
          <div>
            <span>Placed</span>
            <strong>{demoHistory.length}</strong>
          </div>
          <div>
            <span>Queued</span>
            <strong>{demoQueue.length}</strong>
          </div>
          <div>
            <span>Session savings</span>
            <strong>
              ${Math.round(sessionSavings).toLocaleString()}
            </strong>
          </div>
          <div>
            <span>Exclusive hosts</span>
            <strong>{claimedHosts.size}</strong>
          </div>
        </div>
        <div className="demo-session-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => addJobs(1)}
          >
            <Plus size={14} /> Add job
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => addJobs(3)}
          >
            <Plus size={14} /> Add 3 jobs
          </button>
          {busy ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => stopDemoAuto()}
            >
              <Square size={14} /> Stop auto
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={viewingHistory}
              onClick={() => {
                void onRunAuto()
              }}
            >
              <ListOrdered size={14} /> Run auto (one by one)
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || viewingHistory}
            onClick={() => {
              void onPlaceAll()
            }}
          >
            <Zap size={14} /> Place all at once
          </button>
          {viewingHistory ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => viewDemoHistory(null)}
            >
              Back to live
            </button>
          ) : null}
        </div>

        {demoBatchNote ? (
          <p className="demo-session-note" role="status">
            {demoBatchNote}
          </p>
        ) : null}

        {demoQueue.length > 0 ? (
          <div className="demo-queue" aria-label="Job queue">
            <p className="demo-queue-label">Up next</p>
            <ul>
              {demoQueue.map((q) => (
                <li key={`q-${q.rank}`}>
                  <span>Critical #{q.rank + 1}</span>
                  <strong>{q.job_preview?.label ?? `Rank ${q.rank}`}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="demo-queue-empty">
            Queue empty — Add jobs, then Run auto or Place all at once.
          </p>
        )}

        {demoHistory.length > 0 ? (
          <div className="demo-history" aria-label="Placement history">
            <p className="demo-queue-label">
              History · unique hosts only
            </p>
            <div className="demo-history-table" role="table">
              <div className="demo-history-row head" role="row">
                <span role="columnheader">#</span>
                <span role="columnheader">Job</span>
                <span role="columnheader">From</span>
                <span role="columnheader">To</span>
                <span role="columnheader">Fit</span>
                <span role="columnheader">Saved</span>
              </div>
              {demoHistory.map((h) => {
                const active =
                  demoViewing?.session_index === h.session_index
                return (
                  <button
                    key={`h-${h.session_index}-${h.job.id}-${h.to.node_id}`}
                    type="button"
                    className={`demo-history-row${active ? ' active' : ''}`}
                    role="row"
                    onClick={() => viewDemoHistory(h)}
                  >
                    <span>{h.session_index + 1}</span>
                    <span>{h.job.label}</span>
                    <span>N{h.from.node_id}</span>
                    <span>N{h.to.node_id}</span>
                    <span>
                      {h.to.fit
                        ? `${h.to.fit.met_count}/${h.to.fit.total}`
                        : '—'}
                    </span>
                    <span>
                      $
                      {Math.round(
                        h.cost_savings?.estimated_usd ?? 0,
                      ).toLocaleString()}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>

      {data.session_note ? (
        <p className="demo-session-note" role="status">
          {data.session_note}
        </p>
      ) : null}
      {data.constrained ? (
        <p className="demo-session-note demo-session-note-warn" role="status">
          Soft-constrained — best free host did not meet every requirement, but
          the node is still exclusive (not shared with another session job).
        </p>
      ) : null}

      {req ? (
        <section className="demo-job" aria-label="Job requirements">
          <div className="demo-job-head">
            <div className="demo-job-icon">
              <ClipboardList size={18} />
            </div>
            <div>
              <p className="demo-job-kicker">
                {viewingHistory ? 'History placement' : 'Active job'} · Warnings
                critical #{rankLabel}/{poolLabel}
              </p>
              <h2>{data.job.label}</h2>
              <p>
                {data.job.workload ?? 'GPU workload'}
                {data.job.gpu_count != null ? ` · ${data.job.gpu_count} GPU` : ''}
                {data.job.duration_hours != null
                  ? ` · ~${data.job.duration_hours}h`
                  : ''}
              </p>
            </div>
          </div>
          <div className="demo-job-reqs">
            <div>
              <span>Max failure risk</span>
              <strong>≤ {req.max_fused_risk_pct}%</strong>
            </div>
            <div>
              <span>Max CPU busy</span>
              <strong>≤ {req.max_cpu_usage_pct}%</strong>
            </div>
            <div>
              <span>Max GPU busy</span>
              <strong>≤ {req.max_gpu_usage_pct}%</strong>
            </div>
            <div>
              <span>Max mem pressure</span>
              <strong>≤ {req.max_mem_pressure}</strong>
            </div>
            <div>
              <span>Max anomaly</span>
              <strong>≤ {req.max_anomaly_score}</strong>
            </div>
          </div>
          <p className="demo-job-note">
            Place next job archives the current placement, reserves its target
            node capacity, and recommends the next safer host for the following
            critical.
          </p>
        </section>
      ) : null}

      <div className="demo-progress">
        <motion.div
          className="demo-progress-bar"
          animate={{ width: `${progress}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <p className="demo-caption">{data.steps[Math.min(step, data.steps.length - 1)]}</p>

      <div className="demo-stage">
        <AnimatePresence>
          {show(0) ? (
            <motion.div
              key={`risk-${data.from.node_id}-${data.job.id}`}
              className="demo-card demo-risk"
              initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={reduced ? { duration: 0 } : { duration: 0.5 }}
            >
              <div className="demo-card-icon critical">
                <AlertTriangle size={20} />
              </div>
              <div className="demo-node-id">Node {data.from.node_id}</div>
              <div className="demo-risk-value">
                <CountUp
                  end={data.from.fused_risk ?? data.from.risk_score}
                  decimals={1}
                  suffix="%"
                />
              </div>
              <div className="demo-risk-label">fused failure risk</div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(1) ? (
            <motion.div
              key={`reasons-${data.from.node_id}-${data.job.id}`}
              className="demo-card demo-reasons"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.45 }}
            >
              <div className="demo-card-title">
                <Sparkles size={15} /> Why it's at risk
              </div>
              <div className="demo-chips">
                {data.from.reasons.map((r, i) => (
                  <motion.span
                    key={r}
                    className="demo-chip"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      reduced ? { duration: 0 } : { delay: 0.1 + i * 0.08 }
                    }
                  >
                    {r}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(2) && candidates.length > 0 ? (
            <motion.div
              key={`analyze-${data.from.node_id}-${data.job.id}`}
              className="demo-card demo-analyze"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.45 }}
            >
              <div className="demo-card-title">
                <Search size={15} /> Analyzing placement candidates
              </div>
              <p className="demo-analyze-sub">
                Ranking fleet nodes by placement score — safety 60% · normality 30% ·
                history 10%. Session reservations reduce capacity on claimed hosts.
              </p>
              <div className="demo-candidates">
                {candidates.map((c, i) => {
                  const revealed = step > 2 || reduced
                  const isWinner = c.selected && (step >= 3 || reduced)
                  return (
                    <motion.div
                      key={c.node_id}
                      className={`demo-candidate${isWinner ? ' selected' : ''}${
                        revealed && !c.selected && step >= 3 ? ' dimmed' : ''
                      }${c.reserved ? ' reserved' : ''}`}
                      initial={{ opacity: 0, x: reduced ? 0 : -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={
                        reduced ? { duration: 0 } : { delay: 0.06 * i }
                      }
                    >
                      <span className="demo-candidate-rank">#{c.rank}</span>
                      <div className="demo-candidate-main">
                        <strong>Node {c.node_id}</strong>
                        <em>
                          {c.fused_risk.toFixed(1)}% fused
                          {c.reserved ? ' · reserved' : ''}
                        </em>
                      </div>
                      <div className="demo-candidate-score">
                        <span>{c.placement_score.toFixed(1)}</span>
                        {isWinner ? <small>best</small> : null}
                      </div>
                      <div
                        className="demo-candidate-bar"
                        style={{
                          width: `${Math.max(8, Math.min(100, c.placement_score))}%`,
                        }}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(3) ? (
            <motion.div
              key={`rec-${data.from.node_id}-${data.to.node_id}-${data.job.id}`}
              className="demo-card demo-move"
              initial={{ opacity: 0, x: reduced ? 0 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5 }}
            >
              <div className="demo-card-title">
                <ArrowRight size={15} /> Recommended move
              </div>
              <div className="demo-move-row">
                <div className="demo-move-node from">
                  <span>{data.job.label}</span>
                  <strong>Node {data.from.node_id}</strong>
                  <em className="critical">
                    {(data.from.fused_risk ?? data.from.risk_score).toFixed(1)}% fused
                  </em>
                  {fromFit ? (
                    <small className="demo-move-fit critical">
                      {fromFit.met_count}/{fromFit.total} requirements met
                    </small>
                  ) : null}
                </div>
                <ArrowRight size={24} className="demo-move-arrow" />
                <div className="demo-move-node to">
                  <span>Best scored target</span>
                  <strong>Node {data.to.node_id}</strong>
                  <em className="healthy">
                    score{' '}
                    {(
                      data.to.placement_score ?? 100 - data.to.risk_score
                    ).toFixed(1)}
                  </em>
                  {toFit ? (
                    <small className="demo-move-fit healthy">
                      {toFit.met_count}/{toFit.total} requirements met
                    </small>
                  ) : null}
                </div>
              </div>

              {fromFit && toFit ? (
                <div className="demo-fit-grid">
                  <FitPanel
                    title={`Why Node ${data.from.node_id} fails`}
                    subtitle="Assigned critical machine"
                    fit={fromFit}
                    tone="critical"
                  />
                  <FitPanel
                    title={`Why Node ${data.to.node_id} qualifies`}
                    subtitle="Recommended placement"
                    fit={toFit}
                    tone="healthy"
                  />
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(4) ? (
            <motion.div
              key={`gauge-${data.from.node_id}-${data.job.id}`}
              className="demo-card demo-gauge"
              initial={{ opacity: 0, scale: reduced ? 1 : 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5 }}
            >
              <HealthGauge
                score={gaugeScore ?? data.health_before}
                size={160}
                label="Projected workload health"
              />
              <div className="demo-gauge-delta">
                <span className="demo-gauge-before">
                  {data.health_before.toFixed(1)}
                </span>
                <ArrowRight size={16} />
                <span className="demo-gauge-after">
                  {data.health_after.toFixed(1)}
                </span>
                <span
                  className={`demo-gauge-pts ${delta >= 0 ? 'healthy' : 'critical'}`}
                >
                  {delta >= 0 ? '+' : ''}
                  {delta.toFixed(1)} pts
                </span>
              </div>

              {savings ? (
                <div className="demo-savings">
                  <div className="demo-savings-icon">
                    <DollarSign size={18} />
                  </div>
                  <div className="demo-savings-body">
                    <span className="demo-savings-label">
                      Estimated savings from AI prediction
                    </span>
                    <strong className="demo-savings-value">
                      <CountUp end={Math.round(savings.estimated_usd)} prefix="$" />
                    </strong>
                    <span className="demo-savings-meta">
                      Based on {(savings.probability_avoided * 100).toFixed(0)}% lower failure risk vs job cost
                    </span>
                  </div>
                </div>
              ) : null}

              <p className="demo-caveat">Projected workload health after moving off the critical server to a safer machine.</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(5) ? (
            <motion.div
              key={`done-${data.from.node_id}-${data.job.id}`}
              className="demo-card demo-done"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5 }}
            >
              <motion.div
                className="demo-done-check"
                initial={reduced ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 260, damping: 16 }
                }
              >
                <CheckCircle2 size={30} />
              </motion.div>
              <h3>Workload rerouted</h3>
              <p>
                {data.job.label} moved off a{' '}
                {(data.from.fused_risk ?? data.from.risk_score).toFixed(0)}%-fused
                machine onto Node {data.to.node_id}
                {savings
                  ? ` — estimated $${Math.round(savings.estimated_usd).toLocaleString()} avoided by acting before failure.`
                  : '.'}
              </p>
              <div className="cta-row">
                <Link to="/app/fleet" className="btn btn-primary">
                  Open Fleet Overview
                  <ArrowRight size={16} />
                </Link>
                <Link to={`/app/nodes/${data.from.node_id}`} className="btn btn-ghost">
                  Inspect Node {data.from.node_id}
                </Link>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
