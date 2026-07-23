import { lazy, Suspense, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  Cpu,
  Play,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { CountUp } from '../components/KPI'
import { ThemeToggle } from '../components/ThemeToggle'
import { staggerContainer, staggerItem } from '../motion/presets'
import { MountWhenVisible, useDeferredReady } from '../hooks/useDeferred'

const HeroClusterScene = lazy(() =>
  import('../components/landing/HeroClusterScene').then((m) => ({
    default: m.HeroClusterScene,
  })),
)
const FleetRiskLandscape = lazy(() =>
  import('../components/landing/FleetRiskLandscape').then((m) => ({
    default: m.FleetRiskLandscape,
  })),
)
const PulseCoreMini = lazy(() =>
  import('../components/landing/PulseCoreMini').then((m) => ({
    default: m.PulseCoreMini,
  })),
)

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const ease = [0.22, 1, 0.36, 1] as const

const fade = {
  initial: { opacity: 0, y: reduced ? 0 : 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: reduced ? { duration: 0 } : { duration: 0.55, ease },
}

const MODULES = [
  {
    n: '01',
    t: 'Failure risk prediction',
    d: 'LightGBM scores each instance from real telemetry — CPU, GPU, memory pressure, and I/O.',
    icon: ShieldCheck,
  },
  {
    n: '02',
    t: 'Smart workload placement',
    d: 'Rank machines by aggregated risk so the next job lands where failure is least likely.',
    icon: Cpu,
  },
  {
    n: '03',
    t: 'Cost optimization',
    d: 'Surface chronically underutilized GPUs and estimate reclaimable spend at industry rates.',
    icon: Wallet,
  },
]

export function LandingPage() {
  const defer3d = useDeferredReady(160)
  const can3d = useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
    } catch {
      return false
    }
  }, [])

  return (
    <div className="landing">
      <div className="landing-visual" aria-hidden>
        <div className="landing-visual-glow landing-visual-glow-a" />
        <div className="landing-visual-glow landing-visual-glow-b" />
        {can3d && defer3d ? (
          <Suspense fallback={null}>
            <HeroClusterScene reduced={reduced} />
          </Suspense>
        ) : null}
      </div>

      <section className="landing-hero">
        <header className="landing-nav">
          <div className="brand">
            <div className="brand-mark">
              <Activity size={15} strokeWidth={2.5} />
            </div>
            <span className="brand-word">
              Compute<span>Pulse</span>
            </span>
          </div>
          <div className="landing-nav-actions">
            <ThemeToggle />
            <Link to="/app/fleet" className="landing-nav-link">
              Dashboard
            </Link>
          </div>
        </header>

        <div className="hero-content">
          <motion.h1
            className="brand-hero"
            initial={{ opacity: 0, y: reduced ? 0 : 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease }}
          >
            Compute<span>Pulse</span>
          </motion.h1>
          <motion.p
            className="tagline"
            initial={{ opacity: 0, y: reduced ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduced ? { duration: 0 } : { delay: 0.1, duration: 0.55, ease }
            }
          >
            Predict GPU cluster failures before they interrupt your jobs —
            trained on real Alibaba production traces.
          </motion.p>
          <motion.div
            className="cta-row"
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduced ? { duration: 0 } : { delay: 0.2, duration: 0.5, ease }
            }
          >
            <Link to="/app/demo" className="btn btn-on-dark">
              <Play size={16} />
              Run Demo
            </Link>
            <Link to="/app/fleet" className="btn btn-outline-light">
              Open Dashboard
              <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>

        <motion.div
          className="hero-scroll-hint"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { delay: 0.9, duration: 0.6 }}
        >
          <span />
        </motion.div>
      </section>

      <section className="landing-section shift-section">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.p className="section-label" variants={staggerItem}>
            The shift
          </motion.p>
          <div className="shift-grid">
            <motion.div
              className="shift-col shift-col-past"
              variants={staggerItem}
            >
              <span className="shift-tag">Before</span>
              <h2>Monitoring shows what is.</h2>
              <p>
                Live gauges and alerts describe the present — useful, but always
                a step behind failure.
              </p>
            </motion.div>
            <motion.div
              className="shift-divider"
              aria-hidden
              variants={staggerItem}
            >
              <ArrowRight size={18} strokeWidth={2.25} />
            </motion.div>
            <motion.div
              className="shift-col shift-col-next"
              variants={staggerItem}
            >
              <span className="shift-tag">With ComputePulse</span>
              <h2>Prediction shows what will be.</h2>
              <p>
                Failure risk, safer placement, and idle capacity — from ~6,500
                real GPUs across ~1,800 machines.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <section className="landing-section landscape-section">
        <motion.div {...fade}>
          <p className="section-label">Fleet landscape</p>
          <h2 className="section-title">Real fleet risk landscape</h2>
          <p className="section-lead">
            Interactive 3D view of machine risk versus CPU and GPU pressure —
            the same signal operators use to decide where the next job should
            land.
          </p>
        </motion.div>
        <motion.div
          className="landscape-stage"
          initial={{ opacity: 0, y: reduced ? 0 : 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={reduced ? { duration: 0 } : { duration: 0.6, ease }}
        >
          {can3d ? (
            <MountWhenVisible
              rootMargin="220px"
              fallback={<div className="fleet-3d-skeleton" />}
            >
              <Suspense fallback={<div className="fleet-3d-skeleton" />}>
                <FleetRiskLandscape reduced={reduced} />
              </Suspense>
            </MountWhenVisible>
          ) : (
            <div className="fleet-3d-fallback">
              WebGL unavailable — open the dashboard for the live fleet map.
            </div>
          )}
        </motion.div>
      </section>

      <section className="landing-section">
        <motion.div {...fade} className="modules-head">
          <div>
            <p className="section-label">Product</p>
            <h2 className="section-title">Three modules. One decision loop.</h2>
          </div>
          {can3d ? (
            <MountWhenVisible rootMargin="160px" fallback={null}>
              <Suspense fallback={null}>
                <PulseCoreMini reduced={reduced} />
              </Suspense>
            </MountWhenVisible>
          ) : null}
        </motion.div>

        <div className="module-list">
          {MODULES.map((m, i) => {
            const Icon = m.icon
            return (
              <motion.div
                key={m.n}
                className="module-row"
                initial={{ opacity: 0, y: reduced ? 0 : 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.45, delay: 0.05 + i * 0.07, ease }
                }
              >
                <div className="module-num">{m.n}</div>
                <div className="module-copy">
                  <h3>{m.t}</h3>
                  <p>{m.d}</p>
                </div>
                <div className="module-icon">
                  <Icon size={20} strokeWidth={2} />
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      <section className="proof-strip">
        <motion.div
          className="proof-grid"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.4 }}
        >
          <ProofStat
            end={88}
            decimals={0}
            suffix="%"
            label="Accuracy vs 53% standard method"
          />
          <ProofStat end={0.924} decimals={3} label="Prediction Confidence on real data" />
          <ProofStat
            end={0.902}
            decimals={3}
            label="Placement risk vs observed failures"
          />
        </motion.div>
      </section>

      <section className="landing-section">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.p className="section-label" variants={staggerItem}>
            Pipeline
          </motion.p>
          <motion.h2 className="section-title" variants={staggerItem}>
            How it works
          </motion.h2>
          <div className="pipeline">
            {[
              {
                t: 'Real traces',
                d: 'Alibaba PAI GPU cluster, July–August 2020',
              },
              { t: 'AI Engine', d: 'Smart Predictions + Clear Explanations' },
              { t: 'Action', d: 'Place, avoid, reclaim capacity' },
            ].map((step, i) => (
              <motion.div
                key={step.t}
                className="pipeline-flow"
                variants={staggerItem}
              >
                {i > 0 ? (
                  <span className="pipeline-arrow" aria-hidden>
                    <ArrowRight size={16} />
                  </span>
                ) : null}
                <div className="pipeline-step">
                  <span className="pipeline-index">0{i + 1}</span>
                  <strong>{step.t}</strong>
                  <p>{step.d}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <footer className="landing-footer landing-footer-3d">
        <motion.div {...fade} className="landing-footer-inner">
          <h2>Ready to inspect the fleet?</h2>
          <p>Open the live dashboard on real historical snapshots.</p>
          <div className="cta-row">
            <Link to="/app/fleet" className="btn btn-on-dark">
              Launch ComputePulse
              <ArrowRight size={16} />
            </Link>
            <Link to="/app/demo" className="btn btn-outline-light">
              Run Demo
            </Link>
          </div>
        </motion.div>
      </footer>
    </div>
  )
}

function ProofStat({
  end,
  decimals,
  suffix = '',
  label,
}: {
  end: number
  decimals: number
  suffix?: string
  label: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.35 })
  return (
    <motion.div className="proof-item" ref={ref} variants={staggerItem}>
      <div className="num">
        {inView ? (
          <CountUp end={end} decimals={decimals} suffix={suffix} />
        ) : (
          `${end.toFixed(decimals)}${suffix}`
        )}
      </div>
      <div className="lbl">{label}</div>
    </motion.div>
  )
}


