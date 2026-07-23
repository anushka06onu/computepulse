import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  ChevronDown,
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

const FAQS = [
  {
    q: 'What does ComputePulse do?',
    a: 'It predicts which GPU machines are likely to fail or interrupt jobs, recommends safer placement for the next workload, and surfaces idle capacity you can reclaim — all from real cluster telemetry.',
  },
  {
    q: 'Is the data real or simulated?',
    a: 'Real. Models are trained and evaluated on Alibaba PAI GPU cluster traces (July–August 2020): hundreds of thousands of instances across roughly 1,700 machines. Snapshots in the dashboard resample that history — they are not synthetic toys.',
  },
  {
    q: 'How strong is the failure risk model?',
    a: 'On a stratified holdout split, the Failure risk model reaches about 88% accuracy and 0.926 ROC-AUC, versus a simple rule baseline around 54% accuracy. Five-fold CV stays near 0.91, so the lift is not a one-off lucky split.',
  },
  {
    q: 'How does job placement work?',
    a: 'There is no “optimal placement” label in the trace, so we do not invent one. Placement ranks machines by fused risk, anomaly, and historical failure rate (safety 60% · normality 30% · history 10%), then recommends the highest-scoring hosts and flags the ones to avoid.',
  },
  {
    q: 'Are the dollar savings exact?',
    a: 'No — and we label that clearly. Underutilized machines are detected from real GPU usage; estimated savings use an assumed $2.50/GPU-hour cloud-adjacent rate, not Alibaba billing. Treat them as opportunity sizing, not invoices.',
  },
  {
    q: 'Does ComputePulse auto-remediate failures?',
    a: 'No. It is an operator intelligence layer: warnings, explainable risk drivers (SHAP), and recommended moves. Humans decide. Run Demo walks one critical machine through detect → analyze → recommend → estimated cost avoided.',
  },
  {
    q: 'Who is this for?',
    a: 'Platform engineers, SRE, and researchers who run shared GPU fleets and need failure risk, safer placement, and idle-capacity insight grounded in reproducible metrics — not another vanity dashboard.',
  },
]

const FOOTER_PRODUCT = [
  { to: '/app/fleet', label: 'Fleet Overview' },
  { to: '/app/demo', label: 'Run Demo' },
  { to: '/app/placement', label: 'Job Placement' },
  { to: '/app/optimize', label: 'Cost Optimization' },
  { to: '/app/evidence', label: 'Model Evidence' },
]

const FOOTER_PLATFORM = [
  { to: '/app/warnings', label: 'Warnings' },
  { to: '/app/map', label: 'Cluster Map' },
  { to: '/app/nodes', label: 'Node Explorer' },
  { to: '/app/compare', label: 'Compare Nodes' },
]

export function LandingPage() {
  const defer3d = useDeferredReady(2200)
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
          className="section-intro"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.p className="section-label" variants={staggerItem}>
            The shift
          </motion.p>
        </motion.div>
        <motion.div
          className="shift-grid"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
        >
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
        </motion.div>
      </section>

      <section className="landing-section landscape-section">
        <motion.div {...fade} className="section-intro">
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
        <motion.div {...fade} className="section-intro modules-head">
          {can3d ? (
            <MountWhenVisible rootMargin="160px" fallback={null}>
              <Suspense fallback={null}>
                <PulseCoreMini reduced={reduced} />
              </Suspense>
            </MountWhenVisible>
          ) : null}
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
        <motion.div className="proof-inner" {...fade}>
          <div className="proof-head">
            <p className="section-label">Model evidence</p>
            <h2 className="section-title">Validated on real holdout data</h2>
            <p className="section-lead">
              Accuracy, ranking quality, and placement correlation — measured on
              the same stratified test split used in Model Evidence.
            </p>
          </div>
          <div className="proof-grid">
            <ProofStat
              end={88}
              decimals={0}
              suffix="%"
              label="Accuracy vs 54% baseline"
            />
            <ProofStat end={0.926} decimals={3} label="ROC-AUC on real holdout" />
            <ProofStat
              end={0.902}
              decimals={3}
              label="Placement risk vs observed failures"
            />
          </div>
        </motion.div>
      </section>

      <section className="landing-section">
        <motion.div
          className="section-intro"
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
        </motion.div>
        <motion.div
          className="pipeline"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.25 }}
        >
          {[
            {
              t: 'Real traces',
              d: 'Alibaba PAI GPU cluster, July–August 2020',
            },
            { t: 'Models', d: 'LightGBM + SHAP explainability' },
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
        </motion.div>
      </section>

      <FaqSection />

      <footer className="site-footer">
        <div className="site-footer-cta">
          <motion.div {...fade} className="site-footer-cta-inner">
            <p className="section-label">Next step</p>
            <h2>Ready to inspect the fleet?</h2>
            <p>
              Open the live dashboard on real historical snapshots — or walk one
              critical machine through detect, analyze, and recommend.
            </p>
            <div className="cta-row">
              <Link to="/app/fleet" className="btn btn-on-dark">
                Launch ComputePulse
                <ArrowRight size={16} />
              </Link>
              <Link to="/app/demo" className="btn btn-outline-light">
                <Play size={16} />
                Run Demo
              </Link>
            </div>
          </motion.div>
        </div>

        <div className="site-footer-main">
          <div className="site-footer-brand">
            <div className="brand">
              <div className="brand-mark">
                <Activity size={15} strokeWidth={2.5} />
              </div>
              <span className="brand-word">
                Compute<span>Pulse</span>
              </span>
            </div>
            <p>
              GPU fleet intelligence: predict failures, place workloads safely,
              and reclaim idle capacity — grounded in real production traces.
            </p>
          </div>

          <div className="site-footer-cols">
            <div>
              <h3>Product</h3>
              <ul>
                {FOOTER_PRODUCT.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Platform</h3>
              <ul>
                {FOOTER_PLATFORM.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Evidence</h3>
              <ul>
                <li>
                  <Link to="/app/evidence">Holdout metrics</Link>
                </li>
                <li>
                  <a href="#faq">FAQ</a>
                </li>
                <li>
                  <Link to="/app/demo">Guided demo</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="site-footer-bar">
          <span>© {new Date().getFullYear()} ComputePulse</span>
          <span>Trained on Alibaba PAI GPU cluster traces</span>
        </div>
      </footer>
    </div>
  )
}

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="landing-section faq-section" id="faq">
      <motion.div
        className="section-intro"
        variants={staggerContainer}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, amount: 0.2 }}
      >
        <motion.p className="section-label" variants={staggerItem}>
          FAQ
        </motion.p>
        <motion.h2 className="section-title" variants={staggerItem}>
          Questions operators ask
        </motion.h2>
        <motion.p className="section-lead" variants={staggerItem}>
          Straight answers about the data, the models, and what ComputePulse
          does — and does not — claim.
        </motion.p>
      </motion.div>

      <motion.div
        className="faq-list"
        variants={staggerContainer}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, amount: 0.15 }}
      >
        {FAQS.map((item, i) => {
          const isOpen = open === i
          return (
            <motion.div
              key={item.q}
              className={`faq-item${isOpen ? ' open' : ''}`}
              variants={staggerItem}
            >
              <button
                type="button"
                className="faq-trigger"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{item.q}</span>
                <ChevronDown size={18} aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    key="body"
                    className="faq-body"
                    initial={
                      reduced
                        ? { height: 'auto', opacity: 1 }
                        : { height: 0, opacity: 0 }
                    }
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={
                      reduced
                        ? { height: 'auto', opacity: 0 }
                        : { height: 0, opacity: 0 }
                    }
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                    }
                  >
                    <p>{item.a}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </motion.div>
    </section>
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
  const inView = useInView(ref, { once: true, amount: 0.2 })
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



