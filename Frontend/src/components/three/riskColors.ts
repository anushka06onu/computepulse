import * as THREE from 'three'

/** teal → amber → rose (brand risk ramp) */
export function colorForRiskPct(riskPct: number, out: THREE.Color) {
  const t = Math.min(1, Math.max(0, riskPct / 100))
  if (t < 0.45) {
    out.setRGB(0.12 + t * 0.2, 0.72 - t * 0.15, 0.58)
  } else if (t < 0.7) {
    out.setRGB(0.78, 0.55 - (t - 0.45) * 0.4, 0.16)
  } else {
    out.setRGB(0.85, 0.28 - (t - 0.7) * 0.2, 0.22)
  }
  return out
}

export function colorForRisk01(risk: number, out: THREE.Color) {
  return colorForRiskPct(risk * 100, out)
}

export const RISK_BG = '#0b1618'
