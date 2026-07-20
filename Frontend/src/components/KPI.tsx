import { motion, useSpring, useTransform, useInView } from 'framer-motion'
import { useEffect, useRef, type ReactNode } from 'react'
import { staggerItem, hoverLift } from '../motion/presets'
import { springTicker } from '../motion/springs'

export function KPI({
  label,
  value,
  delta,
  tone,
  icon,
}: {
  label: string
  value: string | ReactNode
  delta?: string
  tone?: 'critical' | 'watch' | 'healthy' | 'default'
  icon?: ReactNode
}) {
  return (
    <motion.div
      className={`kpi${tone && tone !== 'default' ? ` tone-${tone}` : ''}`}
      variants={staggerItem}
      whileHover={hoverLift}
    >
      <div className="kpi-inner-core">
        <div className="kpi-top">
          <div className="label">{label}</div>
          {icon ? <div className="kpi-icon">{icon}</div> : null}
        </div>
        <div className="value">{value}</div>
        {delta ? <div className="delta">{delta}</div> : null}
      </div>
    </motion.div>
  )
}

export function CountUp({
  end,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  end: number
  decimals?: number
  prefix?: string
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  
  const springValue = useSpring(0, springTicker)
  const formattedValue = useTransform(springValue, value => 
    `${prefix}${value.toFixed(decimals)}${suffix}`
  )

  useEffect(() => {
    if (isInView) {
      springValue.set(end)
    }
  }, [isInView, end, springValue])

  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <motion.span ref={ref}>
      {reduced ? `${prefix}${end.toFixed(decimals)}${suffix}` : formattedValue}
    </motion.span>
  )
}

