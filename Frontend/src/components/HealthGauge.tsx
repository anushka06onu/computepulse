import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Grade } from '../api/client'
import { CountUp } from './KPI'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function bandColor(score: number): string {
  if (score >= 70) return 'var(--color-healthy)'
  if (score >= 55) return 'var(--color-watch)'
  return 'var(--color-critical)'
}

function gradeFor(score: number): Grade {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 55) return 'Fair'
  return 'Poor'
}

export function HealthGauge({
  score,
  grade,
  size = 180,
  stroke = 14,
  label = 'Cluster health',
}: {
  score: number
  grade?: Grade
  size?: number
  stroke?: number
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, score))
  const resolvedGrade = grade ?? gradeFor(clamped)
  const color = bandColor(clamped)

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - stroke
  const circumference = 2 * Math.PI * r
  const sweep = 240 / 360
  const arcLen = circumference * sweep
  const targetOffset = arcLen * (1 - clamped / 100)

  const [offset, setOffset] = useState(reduced ? targetOffset : arcLen)
  const mounted = useRef(false)

  useEffect(() => {
    if (reduced) {
      setOffset(targetOffset)
      return
    }
    const id = requestAnimationFrame(() => setOffset(targetOffset))
    mounted.current = true
    return () => cancelAnimationFrame(id)
  }, [targetOffset])

  const dash = useMemo(() => `${arcLen} ${circumference}`, [arcLen, circumference])

  return (
    <div className="health-gauge" style={{ width: size }}>
      <div className="health-gauge-ring" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label}: ${clamped.toFixed(1)} out of 100, ${resolvedGrade}`}
        >
          <g transform={`rotate(150 ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeLinecap="round"
            />
            <motion.circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeLinecap="round"
              initial={false}
              animate={{ strokeDashoffset: offset }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 1.1, ease: [0.23, 1, 0.32, 1] }
              }
              style={{ strokeDashoffset: offset }}
            />
          </g>
        </svg>
        <div className="health-gauge-center">
          <div className="health-gauge-value" style={{ color }}>
            <CountUp end={clamped} decimals={1} />
          </div>
          <motion.div
            className="health-gauge-grade"
            data-grade={resolvedGrade}
            key={resolvedGrade}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            {resolvedGrade}
          </motion.div>
        </div>
      </div>
      <div className="health-gauge-label">{label}</div>
    </div>
  )
}

