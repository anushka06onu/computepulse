import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { useMemo, useRef } from 'react'
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

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const ease = [0.22, 1, 0.36, 1] as const

const fade = {
  initial: { opacity: 0, y: reduced ? 0 : 20 },
  animate: { opacity: 1, y: 0 },
  transition: reduced ? { duration: 0 } : { duration: 0.55, ease },
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: ((i * 41) % 100) + (i % 5) * 0.4,
  top: ((i * 59) % 100) + (i % 4) * 0.3,
  size: (i % 3) + 1.2,
  dur: 7 + (i % 5),
  y: 10 + (i % 6) * 2,
  op: 0.12 + (i % 4) * 0.05,
}))

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
  const particles = useMemo(() => PARTICLES, [])

  return (
    <div className="landing">
      <div className="landing-visual" aria-hidden>
        <div className="landing-visual-glow landing-visual-glow-a" />
        <div className="landing-visual-glow landing-visual-glow-b" />
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              ['--float-dur' as string]: `${p.dur}s`,
              ['--float-y' as string]: `${p.y}px`,
              ['--float-op' as string]: String(p.op),
            }}
          />
        ))}
      </div>

      <section className="landing-hero">
        <header className="landing-nav">
          <div className="brand">
            <div className="brand-mark">
              <Activity size={15} strokeWidth={2.5} />
            </div>
            Compute<span>Pulse</span>
          </div>
          <div className="landing-nav-actions">
            <ThemeToggle />
            <Link to="/app/fleet" className="btn btn-outline-light btn-sm">
              Open dashboard
            </Link>
          </div>
        </header>

        <div className="hero-content">
          <motion.p
            className="hero-kicker"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.4, ease }}
          >
            Cluster health intelligence
          </motion.p>
          <motion.h1
            className="brand-hero"
            initial={{ opacity: 0, y: reduced ? 0 : 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.65, ease }}
          >
            ComputePulse
          </motion.h1>
          <motion.p
            className="tagline"
            initial={{ opacity: 0, y: reduced ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduced ? { duration: 0 } : { delay: 0.08, duration: 0.5, ease }
            }
          >
            Predict GPU cluster failures before they interrupt your jobs —
            trained on real Alibaba production traces.
          </motion.p>
          <motion.div
            className="cta-row"
            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduced ? { duration: 0 } : { delay: 0.16, duration: 0.45, ease }
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
          transition={reduced ? { duration: 0 } : { delay: 0.8, duration: 0.6 }}
        >
          <span />
        </motion.div>
      </section>

      <section className="landing-section shift-section">
        <motion.div {...fade}>
          <p className="section-label">The shift</p>
          <div className="shift-grid">
            <div className="shift-col shift-col-past">
              <span className="shift-tag">Before</span>
              <h2>Monitoring shows what is.</h2>
              <p>
                Live gauges and alerts describe the present — useful, but always
                a step behind failure.
              </p>
            </div>
            <div className="shift-divider" aria-hidden>
              <ArrowRight size={18} strokeWidth={2.25} />
            </div>
            <div className="shift-col shift-col-next">
              <span className="shift-tag">With ComputePulse</span>
              <h2>Prediction shows what will be.</h2>
              <p>
                Failure risk, safer placement, and idle capacity — from ~6,500
                real GPUs across ~1,800 machines.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="landing-section">
        <motion.div {...fade}>
          <p className="section-label">Product</p>
          <h2 className="section-title">Three modules. One decision loop.</h2>
        </motion.div>

        <div className="module-list">
          {MODULES.map((m, i) => {
            const Icon = m.icon
            return (
              <motion.div
                key={m.n}
                className="module-row"
                initial={{ opacity: 0, y: reduced ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
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
        <div className="proof-grid">
          <ProofStat
            end={88}
            decimals={0}
            suffix="%"
            label="Accuracy vs 53% baseline"
          />
          <ProofStat end={0.924} decimals={3} label="ROC-AUC on real holdout" />
          <ProofStat
            end={0.902}
            decimals={3}
            label="Placement risk vs observed failures"
          />
        </div>
      </section>

      <section className="landing-section">
        <motion.div {...fade}>
          <p className="section-label">Pipeline</p>
          <h2 className="section-title">How it works</h2>
          <div className="pipeline">
            {[
              {
                t: 'Real traces',
                d: 'Alibaba PAI GPU cluster, July–August 2020',
              },
              { t: 'Models', d: 'LightGBM + SHAP explainability' },
              { t: 'Action', d: 'Place, avoid, reclaim capacity' },
            ].map((step, i) => (
              <div key={step.t} className="pipeline-flow">
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
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <footer className="landing-footer">
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
    <div className="proof-item" ref={ref}>
      <div className="num">
        {inView ? (
          <CountUp end={end} decimals={decimals} suffix={suffix} />
        ) : (
          `${end.toFixed(decimals)}${suffix}`
        )}
      </div>
      <div className="lbl">{label}</div>
    </div>
  )
}
