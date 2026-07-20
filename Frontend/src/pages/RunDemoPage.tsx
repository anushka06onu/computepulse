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
import { api, type DemoScenario } from '../api/client'
import { useApp } from '../context/AppContext'
import { HealthGauge } from '../components/HealthGauge'
import { CountUp } from '../components/KPI'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STEP_MS = 2200
const TOTAL = 5

export function RunDemoPage() {
  const { seed, critical, watch, health } = useApp()
  const [data, setData] = useState<DemoScenario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [gaugeScore, setGaugeScore] = useState<number | null>(null)

  const load = useCallback(() => {
    setData(null)
    setError(null)
    setStep(0)
    setPlaying(true)
    setGaugeScore(null)
    api
      .demo(seed, critical, watch)
      .then((d) => {
        setData(d)
        setGaugeScore(d.health_before)
        if (reduced) {
          setStep(TOTAL - 1)
          setPlaying(false)
          setGaugeScore(d.health_after)
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [seed, critical, watch])

  useEffect(() => {
    if (health && !health.ready) return
    load()
  }, [load, health])

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
    if (!data) return
    setGaugeScore(data.health_before)
    setStep(0)
    setPlaying(true)
  }, [data])

  const skip = useCallback(() => {
    if (!data) return
    setGaugeScore(data.health_after)
    setStep(TOTAL - 1)
    setPlaying(false)
  }, [data])

  const progress = useMemo(() => ((step + 1) / TOTAL) * 100, [step])

  if (error) return <p className="banner">{error}</p>
  if (!data) return <div className="skeleton" style={{ height: 480 }} />

  const show = (i: number) => step >= i
  const delta = data.health_after - data.health_before

  return (
    <div className="demo-page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <Play size={12} /> Guided demo
          </div>
          <h1>Run Demo</h1>
          <p>
            A live, data-driven walkthrough: catch a failing machine, explain why,
            and reroute its workload — all from the current snapshot.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={skip}>
            <SkipForward size={16} /> Skip
          </button>
          <button className="btn btn-primary" onClick={replay}>
            <RotateCcw size={16} /> Replay
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
              key="risk"
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
                <CountUp end={data.from.risk_score} decimals={1} suffix="%" />
              </div>
              <div className="demo-risk-label">predicted failure risk</div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(1) ? (
            <motion.div
              key="reasons"
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
              key="rec"
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
                  <em className="critical">{data.from.risk_score.toFixed(1)}%</em>
                </div>
                <ArrowRight size={24} className="demo-move-arrow" />
                <div className="demo-move-node to">
                  <span>Safer target</span>
                  <strong>Node {data.to.node_id}</strong>
                  <em className="healthy">{data.to.risk_score.toFixed(1)}%</em>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {show(3) ? (
            <motion.div
              key="gauge"
              className="demo-card demo-gauge"
              initial={{ opacity: 0, scale: reduced ? 1 : 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5 }}
            >
              <HealthGauge
                score={gaugeScore ?? data.health_before}
                size={160}
                label="Projected cluster health"
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
              key="done"
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
                {data.job.label} moved off a {data.from.risk_score.toFixed(0)}%-risk
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
