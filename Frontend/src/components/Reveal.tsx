import { useRef, type ReactNode } from 'react'
import { motion, useInView } from 'framer-motion'

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  width?: 'fit-content' | '100%'
  once?: boolean
}

/** Scroll reveal that never leaves content stuck invisible. */
export function Reveal({
  children,
  className = '',
  delay = 0,
  width = '100%',
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, amount: 0.15, margin: '0px' })

  return (
    <div ref={ref} style={{ width, position: 'relative' }} className={className}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={
          isInView
            ? { opacity: 1, y: 0 }
            : { opacity: 0.001, y: 12 }
        }
        transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: 'opacity, transform' }}
      >
        {children}
      </motion.div>
    </div>
  )
}
