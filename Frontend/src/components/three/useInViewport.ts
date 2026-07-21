import { useEffect, useState, type RefObject } from 'react'

/** True when `ref` intersects viewport (enough to keep WebGL alive). */
export function useInViewport(
  ref: RefObject<HTMLElement | null>,
  amount = 0.05,
) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting || entry.intersectionRatio > 0),
      { threshold: [0, amount], rootMargin: '80px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, amount])

  return visible
}
