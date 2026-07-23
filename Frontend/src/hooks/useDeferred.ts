import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useInView } from 'framer-motion'

/** Mount heavy work after first paint / browser idle. */
export function useDeferredReady(ms = 120) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const arm = () => {
      if (!cancelled) setReady(true)
    }
    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(arm, { timeout: Math.max(ms, 2500) })
      return () => {
        cancelled = true
        w.cancelIdleCallback?.(id)
      }
    }
    const t = window.setTimeout(arm, ms)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [ms])
  return ready
}

/** Render children once the placeholder enters (or nears) the viewport. */
export function MountWhenVisible({
  children,
  rootMargin = '180px',
  fallback = null,
  className,
}: {
  children: ReactNode
  rootMargin?: string
  fallback?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, {
    once: true,
    margin: rootMargin as `${number}px`,
  })
  return createElement(
    'div',
    { ref, className },
    inView ? children : fallback,
  )
}

