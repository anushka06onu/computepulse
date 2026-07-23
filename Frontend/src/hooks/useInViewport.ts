import { useEffect, useState, type RefObject } from 'react'

/** True when `ref` intersects viewport (pauses WebGL when offscreen). */
export function useInViewport(
  ref: RefObject<HTMLElement | null>,
  amount = 0.05,
) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) =>
        setVisible(entry.isIntersecting || entry.intersectionRatio > 0),
      { threshold: [0, amount], rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, amount])

  return visible
}
