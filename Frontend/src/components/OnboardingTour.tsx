import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { scaleIn } from '../motion/presets'

const steps = [
  {
    title: 'Fleet health at a glance',
    body: 'See every real machine color-coded by risk. Refresh resamples a different real historical moment.',
    path: '/app/fleet',
  },
  {
    title: 'Explain any node',
    body: 'Open a machine to see live metrics and a real per-node AI explanation.',
    path: '/app/nodes',
  },
  {
    title: 'Place the next job',
    body: 'Rank machines to prefer or avoid based on AI risk aggregated for placement.',
    path: '/app/placement',
  },
  {
    title: 'Find idle capacity',
    body: 'Surface underutilized GPUs and estimated dollar savings opportunities.',
    path: '/app/optimize',
  },
]

export function OnboardingTour() {
  const [step, setStep] = useState(0)
  const { completeTour } = useApp()
  const navigate = useNavigate()
  const current = steps[step]

  return (
    <motion.div
      className="tour-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="tour-card"
        variants={scaleIn}
        initial="hidden"
        animate="visible"
      >
        <div className="tour-progress">
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-faint)',
            marginBottom: 8,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Step {step + 1} of {steps.length}
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <h2>{current.title}</h2>
            <p style={{ marginBottom: 20 }}>{current.body}</p>
          </motion.div>
        </AnimatePresence>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => completeTour()}>
            Skip
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              navigate(current.path)
              if (step >= steps.length - 1) completeTour()
              else setStep((s) => s + 1)
            }}
          >
            {step >= steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
