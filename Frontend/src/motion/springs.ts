import type { Transition } from 'framer-motion'

export const springSmooth: Transition = {
  type: 'spring',
  duration: 0.5,
  bounce: 0.15,
}

export const springSnap: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
}

export const springHeavy: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 18,
}

export const springBounce: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 10,
}

export const springTicker: Transition = {
  type: 'spring',
  stiffness: 80,
  damping: 12,
}
