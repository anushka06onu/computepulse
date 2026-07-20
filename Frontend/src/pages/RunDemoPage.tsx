import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { HealthGauge } from '../components/HealthGauge'
import { CountUp } from '../components/KPI'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STEP_MS = 2200
const TOTAL = 5

export function RunDemoPage() {
  const {
    health,
    demoScenario,
    demoReplayAt,
    demoRank,
    ensureDemoScenario,
    seed,
    requestDemoReplay,
    requestDemoRun,
  } = useApp()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!demoScenario)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [gaugeScore, setGaugeScore] = useState<number | null>(
    demoScenario?.health_before ?? null,
  )

  const data =
    demoScenario &&
    demoScenario.seed === seed &&
    (demoScenario.rank ?? 0) === demoRank
      ? demoScenario
      : null

  const startPlayback = useCallback((before: number, after: number) => {
    setError(null)
    setGaugeScore(before)
    setStep(0)
    setPlaying(true)
    if (reduced) {
      setStep(TOTAL - 1)
      setPlaying(false)
      setGaugeScore(after)
    }
  }, [])

  // Load scenario for current seed + rank.
  useEffect(() => {
    if (health && !health.ready) return
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
  }, [health, seed, demoRank, ensureDemoScenario, startPlayback])

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
    if (step >= 3) {
      const id = setTimeout(() => setGaugeScore(data.health_after), 350)
      return () => clearTimeout(id)
    }
    setGaugeScore(data.health_before)
  }, [step, data])

  const replay = useCallback(() => {
    requestDemoReplay()
  }, [requestDemoReplay])

  const skip = useCallback(() => {
    if (!data) return
    setGaugeScore(data.health_after)
    setStep(TOTAL - 1)
    setPlaying(false)
  }, [data])

  const progress = useMemo(() => ((step + 1) / TOTAL) * 100, [step])

  if (error) return <p className="banner">{error}</p>
  if (loading || !data) return <div className="skeleton" style={{ height: 480 }} />

  const show = (i: number) => step >= i
  const delta = data.health_after - data.health_before
  const rankLabel = (data.rank ?? demoRank) + 1
  const poolLabel = data.pool_size ?? '?'

  return (
    <div className="demo-page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Play size={12} /> Guided demo · critical #{rankLabel}/{poolLabel} ·
            seed {data.seed}
          </div>
          <h1>Run Demo</h1>
          <p>
            Walks a real high-risk machine from the current fleet snapshot.
            Top-bar <strong>Run Demo</strong> advances to the next critical node;
            <strong> Replay</strong> keeps this one.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={skip}>
            <SkipForward size={16} /> Skip
          </button>
          <button className="btn btn-ghost" onClick={replay}>
            <RotateCcw size={16} /> Replay
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              void requestDemoRun()
            }}
          >
            <Play size={16} /> Next critical
          </button>
        </div>
      </div>

      <div className="demo-progress">
        <motion.div
          className="demo-progress-bar"
          animate={{ width: `${progress}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <p className="demo-caption">{data.steps[step]}</p>

      <div className="demo-stage">
        <AnimatePresence>
          {show(0) ? (
            <motion.div
              key={`risk-${data.from.node_id}`}
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
              key={`reasons-${data.from.node_id}`}
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
          {show(2) ? (
            <motion.div
              key={`rec-${data.from.node_id}-${data.to.node_id}`}
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
                </div>
                <ArrowRight size={24} className="demo-move-arrow" />
                <div className="demo-move-node to">
                  <span>Safer target</span>
                  <strong>Node {data.to.node_id}</strong>
                  <em className="healthy">
                    score{' '}
                    {(
                      data.to.placement_score ?? 100 - data.to.risk_score
                    ).toFixed(1)}
                  </em>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(3) ? (
            <motion.div
              key={`gauge-${data.from.node_id}`}
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
              <p className="demo-caveat">{data.caveat}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(4) ? (
            <motion.div
              key={`done-${data.from.node_id}`}
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
                machine onto Node {data.to.node_id}.
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
