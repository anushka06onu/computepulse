import type { Transition, Variants } from 'framer-motion'
import { springSmooth } from './springs'

const reduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const easeOutExpo = [0.23, 1, 0.32, 1] as const
const easeInOutExpo = [0.77, 0, 0.175, 1] as const
const easeDrawer = [0.32, 0.72, 0, 1] as const

export const transition: Transition = reduced
  ? { duration: 0 }
  : { duration: 0.35, ease: easeOutExpo }

export const pageVariants: Variants = {
  initial: { opacity: 0, y: reduced ? 0 : 8, filter: 'blur(4px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.28, ease: easeInOutExpo },
  },
  exit: {
    opacity: 0,
    y: reduced ? 0 : -4,
    filter: 'blur(2px)',
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.18, ease: easeOutExpo },
  },
}

export const blurUp: Variants = {
  hidden: { opacity: 0, y: reduced ? 0 : 24, filter: 'blur(4px)', scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    scale: 1,
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.6, ease: easeOutExpo },
  },
}

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: reduced ? 0 : 0.08,
      delayChildren: reduced ? 0 : 0.1,
    },
  },
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: reduced ? 0 : 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.35, ease: easeOutExpo },
  },
  hidden: { opacity: 0, y: reduced ? 0 : 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.35, ease: easeOutExpo },
  },
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.3, ease: easeOutExpo },
  },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: reduced ? 1 : 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: reduced ? { duration: 0 } : springSmooth,
  },
}

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: reduced ? 0 : 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.4, ease: easeDrawer },
  },
}

export const hoverLift = {
  y: -2,
  transition: { duration: 0.22, ease: easeOutExpo },
}

export const pressDown = {
  scale: 0.97,
  transition: { duration: 0.14, ease: easeOutExpo },
}

export const chartBarGrow: Variants = {
  hidden: { scaleY: 0, transformOrigin: 'bottom' },
  visible: {
    scaleY: 1,
    transition: reduced ? { duration: 0 } : springSmooth,
  },
}

export const navIndicator = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
}

export const tooltipEnter: Variants = {
  hidden: { opacity: 0, scale: reduced ? 1 : 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.125, ease: easeOutExpo },
  },
}

export const heroStagger: Variants = {
  animate: {
    transition: {
      staggerChildren: reduced ? 0 : 0.12,
    },
  },
}
